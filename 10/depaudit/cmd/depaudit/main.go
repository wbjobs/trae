package main

import (
	"fmt"
	"os"
	"path/filepath"
	"strings"

	"github.com/depaudit/depaudit/pkg/batch"
	"github.com/depaudit/depaudit/pkg/ci"
	"github.com/depaudit/depaudit/pkg/config"
	"github.com/depaudit/depaudit/pkg/constraint"
	"github.com/depaudit/depaudit/pkg/fixer"
	"github.com/depaudit/depaudit/pkg/license"
	"github.com/depaudit/depaudit/pkg/reporter"
	"github.com/depaudit/depaudit/pkg/scanner"
	"github.com/depaudit/depaudit/pkg/vuln"
	"github.com/spf13/cobra"
)

var (
	cfgFile         string
	projectPath     string
	formats         []string
	severity        string
	autoFix         bool
	dryRun          bool
	failOnVuln      bool
	checkLicense    bool
	checkConstraint bool
	batchPaths      []string
	noLicense       bool
	noConstraint    bool
	projectLic  string
)

func main() {
	rootCmd := &cobra.Command{
		Use:   "depaudit",
		Short: "Dependency security audit and auto-fix tool",
		Long: `depaudit is a comprehensive dependency security audit tool that supports
multiple languages and package managers. It scans project dependencies,
queries vulnerability databases, generates reports, and can automatically
fix vulnerable dependencies.

Supported languages: JavaScript (npm/yarn/pnpm), Python (pip/pipenv/poetry),
Java (Maven/Gradle), Go (go mod)

Supported vulnerability databases: OSV, NVD`,
		Run: runAudit,
	}

	rootCmd.PersistentFlags().StringVarP(&cfgFile, "config", "c", "", "Path to config file")
	rootCmd.PersistentFlags().StringVarP(&projectPath, "path", "p", ".", "Project path to scan")
	rootCmd.PersistentFlags().StringSliceVarP(&formats, "format", "f", []string{"text"}, "Report formats (text, json, html)")
	rootCmd.PersistentFlags().StringVarP(&severity, "severity", "s", "LOW", "Minimum severity level (LOW, MEDIUM, HIGH, CRITICAL)")
	rootCmd.PersistentFlags().BoolVarP(&autoFix, "fix", "x", false, "Auto-fix vulnerable dependencies")
	rootCmd.PersistentFlags().BoolVarP(&dryRun, "dry-run", "n", false, "Dry run mode (show what would be done)")
	rootCmd.PersistentFlags().BoolVar(&failOnVuln, "fail-on-vuln", false, "Exit with non-zero code if vulnerabilities found")
	rootCmd.PersistentFlags().BoolVar(&checkLicense, "license", true, "Check dependency licenses")
	rootCmd.PersistentFlags().BoolVar(&noLicense, "no-license", false, "Skip license check")
	rootCmd.PersistentFlags().BoolVar(&checkConstraint, "constraint", true, "Check version constraints")
	rootCmd.PersistentFlags().BoolVar(&noConstraint, "no-constraint", false, "Skip version constraint check")
	rootCmd.PersistentFlags().StringVar(&projectLic, "project-license", "", "Specify project license for compatibility check")

	rootCmd.AddCommand(scanCmd())
	rootCmd.AddCommand(fixCmd())
	rootCmd.AddCommand(reportCmd())
	rootCmd.AddCommand(batchCmd())
	rootCmd.AddCommand(initCmd())
	rootCmd.AddCommand(versionCmd())

	if err := rootCmd.Execute(); err != nil {
		os.Exit(1)
	}
}

func scanCmd() *cobra.Command {
	return &cobra.Command{
		Use:   "scan",
		Short: "Scan project dependencies for vulnerabilities",
		Run:   runAudit,
	}
}

func fixCmd() *cobra.Command {
	cmd := &cobra.Command{
		Use:   "fix",
		Short: "Auto-fix vulnerable dependencies",
		Run:   runAudit,
	}
	return cmd
}

func reportCmd() *cobra.Command {
	return &cobra.Command{
		Use:   "report",
		Short: "Generate vulnerability reports",
		Run:   runAudit,
	}
}

func initCmd() *cobra.Command {
	return &cobra.Command{
		Use:   "init",
		Short: "Initialize default configuration file",
		Run: func(cmd *cobra.Command, args []string) {
			cfg := config.DefaultConfig()
			if err := cfg.Save(".depaudit.yaml"); err != nil {
				fmt.Printf("Error creating config file: %v\n", err)
				os.Exit(1)
			}
			fmt.Println("✓ Created .depaudit.yaml configuration file")
		},
	}
}

func versionCmd() *cobra.Command {
	return &cobra.Command{
		Use:   "version",
		Short: "Print version information",
		Run: func(cmd *cobra.Command, args []string) {
			fmt.Println("depaudit v1.0.0")
			fmt.Println("Dependency Security Audit & Auto-Fix Tool")
		},
	}
}

func batchCmd() *cobra.Command {
	cmd := &cobra.Command{
		Use:   "batch",
		Short: "Scan multiple projects",
		Long: `Scan multiple projects at once. You can specify multiple paths,
or a parent directory containing multiple projects.`,
		Run: runBatchScan,
	}
	
	cmd.Flags().StringSliceVarP(&batchPaths, "paths", "", []string{}, "Multiple project paths")
	
	return cmd
}

func runBatchScan(cmd *cobra.Command, args []string) {
	fmt.Println("🔒 depaudit - Batch Dependency Security Audit")
	fmt.Println("=" + strings.Repeat("=", 50))
	
	cfg, err := config.LoadConfig(cfgFile)
	if err != nil {
		fmt.Printf("Error loading config: %v\n", err)
		os.Exit(1)
	}
	
	paths := batchPaths
	if len(paths) == 0 {
		paths = cfg.Scan.Paths
	}
	if len(paths) == 0 {
		paths = []string{"."}
	}
	
	fmt.Printf("\n📁 Scanning %d project paths...\n", len(paths))
	
	batchScanner := batch.NewBatchScanner(cfg)
	result := batchScanner.Scan(paths)
	
	fmt.Printf("\n📊 Batch Scan Summary:\n")
	fmt.Printf("  Total Projects:      %d\n", result.TotalProjects)
	fmt.Printf("  Successfully Scanned: %d\n", result.ScannedProjects)
	fmt.Printf("  Failed:             %d\n", result.FailedProjects)
	fmt.Printf("  Total Dependencies:  %d\n", result.TotalDeps)
	fmt.Printf("  Total Vulnerabilities: %d\n", result.TotalVulns)
	fmt.Printf("    Critical: %d, High: %d, Medium: %d, Low: %d\n",
		result.CriticalVulns, result.HighVulns, result.MediumVulns, result.LowVulns)
	fmt.Printf("  License Issues:     %d\n", result.LicenseIssues)
	fmt.Printf("  Constraint Issues:  %d\n", result.ConstraintIssues)
	
	fmt.Println("\n📁 Project Details:")
	for i, proj := range result.Projects {
		fmt.Printf("\n[%d] %s\n", i+1, proj.ProjectName)
		fmt.Printf("    Path: %s\n", proj.ProjectPath)
		if proj.Error != nil {
			fmt.Printf("    Status: ❌ Failed - %v\n", proj.Error)
		} else {
			fmt.Printf("    Language: %s\n", proj.Language)
			fmt.Printf("    Dependencies: %d\n", proj.TotalDeps)
			fmt.Printf("    Vulnerabilities: %d\n", len(proj.Vulnerabilities))
			fmt.Printf("    License Issues: %d\n", len(proj.LicenseIssues))
			fmt.Printf("    Constraint Issues: %d\n", len(proj.ConstraintIssues))
			fmt.Printf("    Duration: %v\n", proj.Duration)
		}
	}
	
	if result.TotalVulns > 0 {
		fmt.Printf("\n⚠️  Found %d vulnerabilities across all projects\n", result.TotalVulns)
		if failOnVuln {
			os.Exit(1)
		}
	}
	
	fmt.Println("\n🎉 Batch scan completed!")
}

func runAudit(cmd *cobra.Command, args []string) {
	fmt.Println("🔒 depaudit - Dependency Security Audit Tool")
	fmt.Println("=" + strings.Repeat("=", 50))
	
	cfg, err := config.LoadConfig(cfgFile)
	if err != nil {
		fmt.Printf("Error loading config: %v\n", err)
		os.Exit(1)
	}
	
	if severity != "LOW" {
		cfg.Vuln.MinSeverity = severity
	}
	if autoFix {
		cfg.Fix.Enabled = true
	}
	if dryRun {
		cfg.Fix.DryRun = true
	}
	if failOnVuln {
		cfg.CI.FailOnVuln = true
	}
	if noLicense {
		cfg.License.Enabled = false
	}
	if noConstraint {
		cfg.Constraint.Enabled = false
	}
	if projectLic != "" {
		cfg.License.ProjectLicense = projectLic
	}
	
	absPath, err := filepath.Abs(projectPath)
	if err != nil {
		fmt.Printf("Error resolving path: %v\n", err)
		os.Exit(1)
	}
	
	fmt.Printf("\n📁 Scanning project: %s\n", absPath)
	
	s := scanner.NewScanner()
	scanResult, err := s.ScanProject(absPath)
	if err != nil {
		fmt.Printf("Error scanning project: %v\n", err)
		os.Exit(1)
	}
	
	fmt.Printf("✓ Found %d dependencies in %s project\n", 
		len(scanResult.Dependencies), scanResult.Language)
	
	fmt.Println("\n🔍 Querying vulnerability databases...")
	checker := vuln.NewChecker()
	var allVulns []vuln.Vulnerability
	
	for _, dep := range scanResult.Dependencies {
		vulns, err := checker.CheckDependency(dep)
		if err != nil {
			continue
		}
		
		for _, v := range vulns {
			if cfg.ShouldIgnoreVuln(v.ID) {
				continue
			}
			if cfg.ShouldIgnorePackage(v.PackageName, v.Version) {
				continue
			}
			if !cfg.IsSeverityAllowed(v.Severity) {
				continue
			}
			allVulns = append(allVulns, v)
		}
	}
	
	fmt.Printf("✓ Found %d vulnerabilities\n", len(allVulns))
	
	var licenseIssues []license.LicenseIssue
	if cfg.License.Enabled {
		fmt.Println("\n📜 Checking dependency licenses...")
		
		projLicense := cfg.License.ProjectLicense
		if projLicense == "" {
			projLicense = license.GetProjectLicense(absPath)
		}
		
		licenseChecker := license.NewLicenseChecker(projLicense)
		licenseFetcher := license.NewLicenseFetcher()
		
		licenseCount := 0
		issueCount := 0
		
		for _, dep := range scanResult.Dependencies {
			shouldSkip := false
			for _, ignored := range cfg.License.IgnorePackages {
				if ignored == dep.Name {
					shouldSkip = true
					break
				}
			}
			if shouldSkip {
				continue
			}
			
			licenseResult := licenseFetcher.Fetch(dep)
			if !licenseResult.Found {
				continue
			}
			
			licenseCount++
			
			issue := licenseChecker.CheckDependency(dep, licenseResult.LicenseInfo)
			if !issue.Compatible {
				licenseIssues = append(licenseIssues, issue)
				issueCount++
			}
		}
		
		fmt.Printf("✓ Checked %d licenses, found %d issues\n", licenseCount, issueCount)
	}
	
	var constraintIssues []constraint.ConstraintIssue
	if cfg.Constraint.Enabled && cfg.Constraint.CheckPeers {
		fmt.Println("\n🔗 Checking version constraints...")
		
		constraintParser := constraint.NewConstraintParser()
		constraintChecker := constraint.NewConstraintChecker()
		
		peers, _ := constraintParser.ParseProject(absPath)
		
		for _, peer := range peers {
			for _, dep := range scanResult.Dependencies {
				shouldSkip := false
				for _, ignored := range cfg.Constraint.IgnorePackages {
					if ignored == dep.Name {
						shouldSkip = true
						break
					}
				}
				if shouldSkip {
					continue
				}
				
				if strings.EqualFold(dep.Name, peer.PackageName) {
					issue := constraintChecker.Check(constraint.VersionConstraint{
						PackageName:    dep.Name,
						RequiredRange:  peer.VersionRange,
						CurrentVersion: dep.Version,
					})
					if !issue.Satisfied {
						constraintIssues = append(constraintIssues, issue)
					}
					break
				}
			}
		}
		
		fmt.Printf("✓ Checked %d constraints, found %d issues\n", 
			len(peers), len(constraintIssues))
	}
	
	var fixResults []fixer.FixResult
	if cfg.Fix.Enabled && len(allVulns) > 0 {
		fmt.Println("\n🔧 Auto-fixing vulnerabilities...")
		fxr := fixer.NewFixer(cfg)
		
		uniqueVulns := make(map[string]vuln.Vulnerability)
		for _, v := range allVulns {
			key := v.PackageName + "@" + v.Version
			if _, exists := uniqueVulns[key]; !exists {
				uniqueVulns[key] = v
			}
		}
		
		for _, v := range uniqueVulns {
			if fxr.ShouldExclude(v.PackageName) {
				fmt.Printf("  ⏭ Skipping excluded package: %s\n", v.PackageName)
				continue
			}
			
			manager := fxr.GetManager(v.Dependency.PackageManager)
			if manager == nil {
				continue
			}
			
			result := fixer.FixResult{
				PackageName: v.PackageName,
				FromVersion: v.Version,
			}
			
			targetVersion := v.Version
			if len(v.FixedVersions) > 0 {
				targetVersion = v.FixedVersions[len(v.FixedVersions)-1]
			}
			result.ToVersion = targetVersion
			
			if cfg.Fix.DryRun {
				fmt.Printf("  [DRY RUN] Would update %s from %s to %s\n", 
					v.PackageName, v.Version, targetVersion)
				result.Success = true
				fixResults = append(fixResults, result)
				continue
			}
			
			backupPath, err := manager.Backup(absPath)
			if err != nil {
				result.Error = err
				fixResults = append(fixResults, result)
				continue
			}
			
			if err := manager.Update(v.Dependency, targetVersion, false); err != nil {
				result.Error = err
				if cfg.Fix.AutoRollback {
					if rollbackErr := manager.Rollback(absPath, backupPath); rollbackErr == nil {
						result.Rollbacked = true
					}
				}
				fixResults = append(fixResults, result)
				fmt.Printf("  ✗ Failed to update %s: %v\n", v.PackageName, err)
				continue
			}
			
			result.Success = true
			fixResults = append(fixResults, result)
			fmt.Printf("  ✓ Updated %s from %s to %s\n", 
				v.PackageName, v.Version, targetVersion)
		}
	}
	
	fmt.Println("\n📊 Generating reports...")
	
	projLicense := cfg.License.ProjectLicense
	if projLicense == "" {
		projLicense = license.GetProjectLicense(absPath)
	}
	
	report := reporter.BuildReportWithExtra(
		scanResult,
		allVulns,
		licenseIssues,
		constraintIssues,
		projLicense,
		fixResults,
	)
	gen := reporter.NewReportGenerator()
	
	reports, err := gen.Generate(report, formats)
	if err != nil {
		fmt.Printf("Error generating reports: %v\n", err)
		os.Exit(1)
	}
	
	outputDir := cfg.Report.OutputDir
	if err := os.MkdirAll(outputDir, 0755); err != nil {
		fmt.Printf("Error creating output directory: %v\n", err)
		os.Exit(1)
	}
	
	for format, content := range reports {
		ext := format
		if format == "text" {
			ext = "txt"
		}
		filename := filepath.Join(outputDir, fmt.Sprintf("depaudit-report.%s", ext))
		if err := os.WriteFile(filename, []byte(content), 0644); err != nil {
			fmt.Printf("Error writing %s report: %v\n", format, err)
			continue
		}
		fmt.Printf("  ✓ %s report saved to: %s\n", strings.ToUpper(format), filename)
	}
	
	if ciIntegration := ci.NewCIIntegration(cfg); ciIntegration.IsCIEnvironment() {
		fmt.Println("\n🔄 CI/CD environment detected")
		ciResult := ciIntegration.Analyze(allVulns)
		
		if ciIntegration.GetCIProvider() == "github" {
			if err := ciIntegration.SetGitHubSummary(ciResult); err == nil {
				fmt.Println("  ✓ GitHub Actions summary created")
			}
			ciIntegration.SetOutput("vulnerabilities", fmt.Sprintf("%d", ciResult.TotalVulns))
			ciIntegration.SetOutput("license_issues", fmt.Sprintf("%d", len(licenseIssues)))
			ciIntegration.SetOutput("constraint_issues", fmt.Sprintf("%d", len(constraintIssues)))
		}
		
		if ciResult.ShouldFail {
			fmt.Printf("\n⚠️ Exiting with error due to %s vulnerabilities\n", ciResult.FailedSeverity)
			os.Exit(1)
		}
		
		if cfg.CI.FailOnLicense && len(licenseIssues) > 0 {
			fmt.Printf("\n⚠️ Exiting with error due to license issues\n")
			os.Exit(1)
		}
		
		if cfg.CI.FailOnConstraint && len(constraintIssues) > 0 {
			fmt.Printf("\n⚠️ Exiting with error due to constraint issues\n")
			os.Exit(1)
		}
	}
	
	totalIssues := len(allVulns)
	if failOnVuln && totalIssues > 0 {
		os.Exit(1)
	}
	
	fmt.Println("\n🎉 Audit completed!")
}
