package reporter

import (
	"time"

	"github.com/depaudit/depaudit/pkg/constraint"
	"github.com/depaudit/depaudit/pkg/fixer"
	"github.com/depaudit/depaudit/pkg/license"
	"github.com/depaudit/depaudit/pkg/scanner"
	"github.com/depaudit/depaudit/pkg/vuln"
)

type Report struct {
	ProjectName       string
	ProjectPath       string
	Language          string
	ScanTime          time.Time
	TotalDeps         int
	Vulnerabilities   []vuln.Vulnerability
	LicenseIssues     []license.LicenseIssue
	ConstraintIssues  []constraint.ConstraintIssue
	ProjectLicense    string
	FixResults        []fixer.FixResult
	Summary           ReportSummary
}

type ReportSummary struct {
	TotalVulns        int
	CriticalCount     int
	HighCount         int
	MediumCount       int
	LowCount          int
	LicenseIssues     int
	ConstraintIssues  int
	FixedCount        int
	FailedCount       int
}

type Reporter interface {
	Name() string
	Generate(report *Report) (string, error)
}

type ReportGenerator struct {
	reporters map[string]Reporter
}

func NewReportGenerator() *ReportGenerator {
	return &ReportGenerator{
		reporters: map[string]Reporter{
			"text": &TextReporter{},
			"json": &JSONReporter{},
			"html": &HTMLReporter{},
		},
	}
}

func (g *ReportGenerator) Generate(report *Report, formats []string) (map[string]string, error) {
	results := make(map[string]string)
	
	for _, format := range formats {
		if reporter, ok := g.reporters[format]; ok {
			content, err := reporter.Generate(report)
			if err != nil {
				return nil, err
			}
			results[format] = content
		}
	}
	
	return results, nil
}

func (g *ReportGenerator) GetReporter(format string) Reporter {
	return g.reporters[format]
}

func BuildReport(scanResult *scanner.ScanResult, vulns []vuln.Vulnerability, fixResults []fixer.FixResult) *Report {
	return BuildReportWithExtra(scanResult, vulns, nil, nil, "", fixResults)
}

func BuildReportWithExtra(
	scanResult *scanner.ScanResult,
	vulns []vuln.Vulnerability,
	licenseIssues []license.LicenseIssue,
	constraintIssues []constraint.ConstraintIssue,
	projectLicense string,
	fixResults []fixer.FixResult) *Report {
	summary := ReportSummary{
		TotalVulns:       len(vulns),
		LicenseIssues:    len(licenseIssues),
		ConstraintIssues: len(constraintIssues),
	}
	
	for _, v := range vulns {
		switch v.Severity {
		case "CRITICAL":
			summary.CriticalCount++
		case "HIGH":
			summary.HighCount++
		case "MEDIUM":
			summary.MediumCount++
		case "LOW":
			summary.LowCount++
		}
	}
	
	for _, r := range fixResults {
		if r.Success {
			summary.FixedCount++
		} else {
			summary.FailedCount++
		}
	}
	
	return &Report{
		ProjectPath:      scanResult.ProjectPath,
		Language:         scanResult.Language,
		ScanTime:         scanResult.ScanTime,
		TotalDeps:        len(scanResult.Dependencies),
		Vulnerabilities:  vulns,
		LicenseIssues:    licenseIssues,
		ConstraintIssues: constraintIssues,
		ProjectLicense:   projectLicense,
		FixResults:       fixResults,
		Summary:          summary,
	}
}
