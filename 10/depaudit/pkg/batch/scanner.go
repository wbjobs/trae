package batch

import (
	"fmt"
	"os"
	"path/filepath"
	"sync"
	"time"

	"github.com/depaudit/depaudit/pkg/config"
	"github.com/depaudit/depaudit/pkg/constraint"
	"github.com/depaudit/depaudit/pkg/license"
	"github.com/depaudit/depaudit/pkg/scanner"
	"github.com/depaudit/depaudit/pkg/vuln"
)

type ProjectScanResult struct {
	ProjectName       string
	ProjectPath       string
	Language          string
	TotalDeps         int
	Vulnerabilities   []vuln.Vulnerability
	LicenseIssues     []license.LicenseIssue
	ConstraintIssues  []constraint.ConstraintIssue
	ScanTime          time.Time
	Duration          time.Duration
	Error             error
}

type BatchResult struct {
	Projects          []ProjectScanResult
	ScanTime          time.Time
	TotalProjects     int
	ScannedProjects   int
	FailedProjects    int
	TotalDeps         int
	TotalVulns        int
	CriticalVulns     int
	HighVulns         int
	MediumVulns       int
	LowVulns          int
	LicenseIssues     int
	ConstraintIssues  int
}

type BatchScanner struct {
	Config         *config.Config
	MaxConcurrency int
}

func NewBatchScanner(cfg *config.Config) *BatchScanner {
	return &BatchScanner{
		Config:         cfg,
		MaxConcurrency: 5,
	}
}

func (bs *BatchScanner) Scan(paths []string) *BatchResult {
	result := &BatchResult{
		ScanTime: time.Now(),
	}
	
	allPaths := bs.expandPaths(paths)
	result.TotalProjects = len(allPaths)
	
	semaphore := make(chan struct{}, bs.MaxConcurrency)
	var wg sync.WaitGroup
	var mu sync.Mutex
	
	for _, path := range allPaths {
		wg.Add(1)
		semaphore <- struct{}{}
		
		go func(p string) {
			defer wg.Done()
			defer func() { <-semaphore }()
			
			scanResult := bs.singleProjectScan(p)
			
			mu.Lock()
			defer mu.Unlock()
			
			result.Projects = append(result.Projects, scanResult)
			
			if scanResult.Error != nil {
				result.FailedProjects++
			} else {
				result.ScannedProjects++
				result.TotalDeps += scanResult.TotalDeps
				result.TotalVulns += len(scanResult.Vulnerabilities)
				result.LicenseIssues += len(scanResult.LicenseIssues)
				result.ConstraintIssues += len(scanResult.ConstraintIssues)
				
				for _, v := range scanResult.Vulnerabilities {
					switch v.Severity {
					case "CRITICAL":
						result.CriticalVulns++
					case "HIGH":
						result.HighVulns++
					case "MEDIUM":
						result.MediumVulns++
					case "LOW":
						result.LowVulns++
					}
				}
			}
		}(path)
	}
	
	wg.Wait()
	
	return result
}

func (bs *BatchScanner) expandPaths(paths []string) []string {
	var expanded []string
	
	for _, p := range paths {
		absPath, err := filepath.Abs(p)
		if err != nil {
			continue
		}
		
		if info, err := os.Stat(absPath); err == nil {
			if info.IsDir() {
				if bs.isProjectDir(absPath) {
					expanded = append(expanded, absPath)
				} else {
					subDirs := bs.findProjectDirs(absPath)
					expanded = append(expanded, subDirs...)
				}
			}
		}
	}
	
	unique := make(map[string]bool)
	var result []string
	for _, p := range expanded {
		if !unique[p] {
			unique[p] = true
			result = append(result, p)
		}
	}
	
	return result
}

func (bs *BatchScanner) findProjectDirs(root string) []string {
	var dirs []string
	
	filepath.Walk(root, func(path string, info os.FileInfo, err error) error {
		if err != nil {
			return nil
		}
		
		if !info.IsDir() {
			return nil
		}
		
		for _, excluded := range bs.Config.Scan.ExcludeDirs {
			if stringsContains(filepath.Base(path), excluded) {
				return filepath.SkipDir
			}
		}
		
		if path != root && bs.isProjectDir(path) {
			dirs = append(dirs, path)
			return filepath.SkipDir
		}
		
		return nil
	})
	
	return dirs
}

func (bs *BatchScanner) isProjectDir(path string) bool {
	projectFiles := []string{
		"package.json",
		"requirements.txt",
		"Pipfile",
		"pyproject.toml",
		"pom.xml",
		"build.gradle",
		"go.mod",
	}
	
	for _, file := range projectFiles {
		if _, err := os.Stat(filepath.Join(path, file)); err == nil {
			return true
		}
	}
	
	return false
}

func (bs *BatchScanner) singleProjectScan(path string) ProjectScanResult {
	start := time.Now()
	
	result := ProjectScanResult{
		ProjectPath: path,
		ProjectName: filepath.Base(path),
		ScanTime:    time.Now(),
	}
	
	s := scanner.NewScanner()
	scanResult, err := s.ScanProject(path)
	if err != nil {
		result.Error = err
		result.Duration = time.Since(start)
		return result
	}
	
	result.Language = scanResult.Language
	result.TotalDeps = len(scanResult.Dependencies)
	
	checker := vuln.NewChecker()
	for _, dep := range scanResult.Dependencies {
		vulns, err := checker.CheckDependency(dep)
		if err != nil {
			continue
		}
		
		for _, v := range vulns {
			if bs.Config.ShouldIgnoreVuln(v.ID) {
				continue
			}
			if bs.Config.ShouldIgnorePackage(v.PackageName, v.Version) {
				continue
			}
			if !bs.Config.IsSeverityAllowed(v.Severity) {
				continue
			}
			result.Vulnerabilities = append(result.Vulnerabilities, v)
		}
	}
	
	projectLicense := license.GetProjectLicense(path)
	licenseChecker := license.NewLicenseChecker(projectLicense)
	licenseFetcher := license.NewLicenseFetcher()
	
	for _, dep := range scanResult.Dependencies {
		licenseResult := licenseFetcher.Fetch(dep)
		if !licenseResult.Found {
			continue
		}
		
		issue := licenseChecker.CheckDependency(dep, licenseResult.LicenseInfo)
		if !issue.Compatible {
			result.LicenseIssues = append(result.LicenseIssues, issue)
		}
	}
	
	constraintParser := constraint.NewConstraintParser()
	constraintChecker := constraint.NewConstraintChecker()
	peers, err := constraintParser.ParseProject(path)
	if err == nil {
		for _, peer := range peers {
			for _, dep := range scanResult.Dependencies {
				if stringsEqualFold(dep.Name, peer.PackageName) {
					issue := constraintChecker.Check(constraint.VersionConstraint{
						PackageName:    dep.Name,
						RequiredRange:  peer.VersionRange,
						CurrentVersion: dep.Version,
					})
					if !issue.Satisfied {
						result.ConstraintIssues = append(result.ConstraintIssues, issue)
					}
					break
				}
			}
		}
	}
	
	result.Duration = time.Since(start)
	return result
}

func stringsContains(s, substr string) bool {
	return len(s) >= len(substr) && (s == substr || 
		(len(s) > 0 && (stringsHasPrefix(s, substr+"/") || 
			stringsHasSuffix(s, "/"+substr) || 
			stringsContainsAny(s, "/"+substr+"/"))))
}

func stringsHasPrefix(s, prefix string) bool {
	return len(s) >= len(prefix) && s[0:len(prefix)] == prefix
}

func stringsHasSuffix(s, suffix string) bool {
	return len(s) >= len(suffix) && s[len(s)-len(suffix):] == suffix
}

func stringsContainsAny(s, substr string) bool {
	return len(s) >= len(substr) && indexOf(s, substr) >= 0
}

func indexOf(s, substr string) int {
	for i := 0; i <= len(s)-len(substr); i++ {
		if s[i:i+len(substr)] == substr {
			return i
		}
	}
	return -1
}

func stringsEqualFold(a, b string) bool {
	if len(a) != len(b) {
		return false
	}
	for i := 0; i < len(a); i++ {
		ca := a[i]
		cb := b[i]
		if ca >= 'A' && ca <= 'Z' {
			ca += 32
		}
		if cb >= 'A' && cb <= 'Z' {
			cb += 32
		}
		if ca != cb {
			return false
		}
	}
	return true
}
