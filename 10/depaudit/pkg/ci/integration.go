package ci

import (
	"fmt"
	"os"
	"path/filepath"
	"time"

	"github.com/depaudit/depaudit/pkg/config"
	"github.com/depaudit/depaudit/pkg/vuln"
)

type CIIntegration struct {
	Config *config.Config
}

type CIScanResult struct {
	ProjectName    string
	Timestamp      time.Time
	TotalVulns     int
	CriticalCount  int
	HighCount      int
	MediumCount    int
	LowCount       int
	ShouldFail     bool
	FailedSeverity string
	Vulnerabilities []vuln.Vulnerability
}

func NewCIIntegration(cfg *config.Config) *CIIntegration {
	return &CIIntegration{
		Config: cfg,
	}
}

func (ci *CIIntegration) IsCIEnvironment() bool {
	envVars := []string{
		"CI",
		"GITHUB_ACTIONS",
		"JENKINS_HOME",
		"GITLAB_CI",
		"TRAVIS",
		"CIRCLECI",
		"BUILD_ID",
	}
	
	for _, env := range envVars {
		if os.Getenv(env) != "" {
			return true
		}
	}
	
	return false
}

func (ci *CIIntegration) GetCIProvider() string {
	switch {
	case os.Getenv("GITHUB_ACTIONS") == "true":
		return "github"
	case os.Getenv("JENKINS_HOME") != "":
		return "jenkins"
	case os.Getenv("GITLAB_CI") == "true":
		return "gitlab"
	case os.Getenv("TRAVIS") == "true":
		return "travis"
	case os.Getenv("CIRCLECI") == "true":
		return "circleci"
	default:
		return "unknown"
	}
}

func (ci *CIIntegration) Analyze(vulns []vuln.Vulnerability) CIScanResult {
	result := CIScanResult{
		Timestamp:      time.Now(),
		Vulnerabilities: vulns,
	}
	
	result.TotalVulns = len(vulns)
	
	for _, v := range vulns {
		switch v.Severity {
		case "CRITICAL":
			result.CriticalCount++
		case "HIGH":
			result.HighCount++
		case "MEDIUM":
			result.MediumCount++
		case "LOW":
			result.LowCount++
		}
	}
	
	if ci.Config.CI.FailOnVuln {
		order := map[string]int{
			"CRITICAL": 4,
			"HIGH":     3,
			"MEDIUM":   2,
			"LOW":      1,
		}
		
		minLevel := order[ci.Config.CI.MinSeverity]
		
		if result.CriticalCount > 0 && order["CRITICAL"] >= minLevel {
			result.ShouldFail = true
			result.FailedSeverity = "CRITICAL"
		} else if result.HighCount > 0 && order["HIGH"] >= minLevel {
			result.ShouldFail = true
			result.FailedSeverity = "HIGH"
		} else if result.MediumCount > 0 && order["MEDIUM"] >= minLevel {
			result.ShouldFail = true
			result.FailedSeverity = "MEDIUM"
		} else if result.LowCount > 0 && order["LOW"] >= minLevel {
			result.ShouldFail = true
			result.FailedSeverity = "LOW"
		}
	}
	
	return result
}

func (ci *CIIntegration) ExitCode(result CIScanResult) int {
	if result.ShouldFail {
		return 1
	}
	return 0
}

func (ci *CIIntegration) CreateArtifact(reportData string, format string) (string, error) {
	if !ci.Config.CI.CreateArtifact {
		return "", nil
	}
	
	outputDir := ci.Config.Report.OutputDir
	if outputDir == "" {
		outputDir = "."
	}
	
	if err := os.MkdirAll(outputDir, 0755); err != nil {
		return "", err
	}
	
	ext := format
	if format == "text" {
		ext = "txt"
	}
	
	filename := fmt.Sprintf("depaudit-report-%s.%s", 
		time.Now().Format("2006-01-02-15-04-05"), ext)
	
	filepath := filepath.Join(outputDir, filename)
	
	if err := os.WriteFile(filepath, []byte(reportData), 0644); err != nil {
		return "", err
	}
	
	return filepath, nil
}

func (ci *CIIntegration) SetOutput(name string, value string) error {
	githubOutput := os.Getenv("GITHUB_OUTPUT")
	if githubOutput != "" {
		f, err := os.OpenFile(githubOutput, os.O_APPEND|os.O_WRONLY, 0644)
		if err != nil {
			return err
		}
		defer f.Close()
		
		_, err = fmt.Fprintf(f, "%s=%s\n", name, value)
		return err
	}
	
	return nil
}

func (ci *CIIntegration) SetGitHubSummary(result CIScanResult) error {
	githubStepSummary := os.Getenv("GITHUB_STEP_SUMMARY")
	if githubStepSummary == "" {
		return nil
	}
	
	summary := ci.generateMarkdownSummary(result)
	
	return os.WriteFile(githubStepSummary, []byte(summary), 0644)
}

func (ci *CIIntegration) generateMarkdownSummary(result CIScanResult) string {
	var sb string
	
	sb += "## Dependency Security Audit Report\n\n"
	sb += fmt.Sprintf("**Scan Time:** %s\n\n", result.Timestamp.Format(time.RFC3339))
	
	sb += "### Vulnerability Summary\n\n"
	sb += "| Severity | Count |\n"
	sb += "|----------|-------|\n"
	sb += fmt.Sprintf("| 🔴 Critical | %d |\n", result.CriticalCount)
	sb += fmt.Sprintf("| 🟠 High | %d |\n", result.HighCount)
	sb += fmt.Sprintf("| 🟡 Medium | %d |\n", result.MediumCount)
	sb += fmt.Sprintf("| 🟢 Low | %d |\n", result.LowCount)
	sb += fmt.Sprintf("| **Total** | **%d** |\n\n", result.TotalVulns)
	
	if result.ShouldFail {
		sb += fmt.Sprintf("⚠️ **Build failed due to %s vulnerabilities**\n\n", result.FailedSeverity)
	} else {
		sb += "✅ **Scan completed successfully**\n\n"
	}
	
	if result.TotalVulns > 0 {
		sb += "### Top Vulnerabilities\n\n"
		sb += "| ID | Package | Severity | CVSS |\n"
		sb += "|----|---------|----------|------|\n"
		
		count := 0
		for _, v := range result.Vulnerabilities {
			if count >= 10 {
				break
			}
			sb += fmt.Sprintf("| %s | %s | %s | %.1f |\n", 
				v.ID, v.PackageName, v.Severity, v.CVSS)
			count++
		}
	}
	
	return sb
}
