package fixer

import (
	"github.com/depaudit/depaudit/pkg/config"
	"github.com/depaudit/depaudit/pkg/scanner"
	"github.com/depaudit/depaudit/pkg/vuln"
)

type FixResult struct {
	Success       bool
	PackageName   string
	FromVersion   string
	ToVersion     string
	Rollbacked    bool
	Error         error
}

type FixPlan struct {
	Vulnerabilities []vuln.Vulnerability
	TotalUpdates    int
	EstimatedRisk   string
}

type PackageManager interface {
	Name() string
	CanHandle(dep scanner.Dependency) bool
	Backup(path string) (string, error)
	Update(dep scanner.Dependency, targetVersion string, dryRun bool) error
	Rollback(path string, backupPath string) error
	GetUpdateCommand(dep scanner.Dependency, targetVersion string) string
}

type Fixer struct {
	Config     *config.Config
	managers   map[string]PackageManager
	backupDir  string
}

func NewFixer(cfg *config.Config) *Fixer {
	f := &Fixer{
		Config:    cfg,
		managers:  make(map[string]PackageManager),
		backupDir: ".depaudit-backups",
	}
	
	f.managers["npm"] = &NPMFixer{}
	f.managers["yarn"] = &YarnFixer{}
	f.managers["pnpm"] = &PnpmFixer{}
	f.managers["pip"] = &PipFixer{}
	f.managers["pipenv"] = &PipenvFixer{}
	f.managers["poetry"] = &PoetryFixer{}
	f.managers["maven"] = &MavenFixer{}
	f.managers["gradle"] = &GradleFixer{}
	f.managers["gomod"] = &GoModFixer{}
	
	return f
}

func (f *Fixer) CreatePlan(vulns []vuln.Vulnerability) *FixPlan {
	plan := &FixPlan{
		Vulnerabilities: vulns,
		TotalUpdates:    len(vulns),
	}
	
	hasCritical := false
	hasHigh := false
	
	for _, v := range vulns {
		switch v.Severity {
		case "CRITICAL":
			hasCritical = true
		case "HIGH":
			hasHigh = true
		}
	}
	
	switch {
	case hasCritical:
		plan.EstimatedRisk = "HIGH"
	case hasHigh:
		plan.EstimatedRisk = "MEDIUM"
	default:
		plan.EstimatedRisk = "LOW"
	}
	
	return plan
}

func (f *Fixer) GetManager(pkgManager string) PackageManager {
	if manager, ok := f.managers[pkgManager]; ok {
		return manager
	}
	return nil
}

func (f *Fixer) ShouldExclude(packageName string) bool {
	for _, excluded := range f.Config.Fix.ExcludePackages {
		if excluded == packageName {
			return true
		}
	}
	return false
}
