package reporter

import (
	"encoding/json"
	"time"

	"github.com/depaudit/depaudit/pkg/constraint"
	"github.com/depaudit/depaudit/pkg/fixer"
	"github.com/depaudit/depaudit/pkg/license"
	"github.com/depaudit/depaudit/pkg/vuln"
)

type JSONReporter struct{}

type JSONReport struct {
	ProjectName       string               `json:"project_name,omitempty"`
	ProjectPath       string               `json:"project_path"`
	Language          string               `json:"language"`
	ScanTime          time.Time            `json:"scan_time"`
	TotalDeps         int                  `json:"total_dependencies"`
	ProjectLicense    string               `json:"project_license,omitempty"`
	Summary           JSONSummary          `json:"summary"`
	Vulnerabilities   []JSONVuln           `json:"vulnerabilities"`
	LicenseIssues     []JSONLicenseIssue   `json:"license_issues,omitempty"`
	ConstraintIssues  []JSONConstraintIssue `json:"constraint_issues,omitempty"`
	FixResults        []JSONFixResult      `json:"fix_results,omitempty"`
}

type JSONSummary struct {
	TotalVulns       int `json:"total_vulnerabilities"`
	CriticalCount    int `json:"critical"`
	HighCount        int `json:"high"`
	MediumCount      int `json:"medium"`
	LowCount         int `json:"low"`
	LicenseIssues    int `json:"license_issues,omitempty"`
	ConstraintIssues int `json:"constraint_issues,omitempty"`
	FixedCount       int `json:"fixed,omitempty"`
	FailedCount      int `json:"failed,omitempty"`
}

type JSONLicenseIssue struct {
	PackageName    string `json:"package_name"`
	PackageVersion string `json:"package_version"`
	LicenseName    string `json:"license"`
	SPDXID         string `json:"spdx_id,omitempty"`
	ProjectLicense string `json:"project_license"`
	Compatible     bool   `json:"compatible"`
	Reason         string `json:"reason"`
	Severity       string `json:"severity"`
	Source         string `json:"source,omitempty"`
}

type JSONConstraintIssue struct {
	PackageName    string `json:"package_name"`
	CurrentVersion string `json:"current_version"`
	RequiredRange  string `json:"required_range"`
	Satisfied      bool   `json:"satisfied"`
	Reason         string `json:"reason"`
	Severity       string `json:"severity"`
}

type JSONVuln struct {
	ID               string   `json:"id"`
	Severity         string   `json:"severity"`
	CVSS             float64  `json:"cvss_score"`
	PackageName      string   `json:"package_name"`
	Version          string   `json:"current_version"`
	Ecosystem        string   `json:"ecosystem"`
	Description      string   `json:"description"`
	PublishedDate    string   `json:"published_date,omitempty"`
	FixedVersions    []string `json:"fixed_versions,omitempty"`
	AffectedVersions string   `json:"affected_versions"`
	References       []string `json:"references,omitempty"`
	Suggestion       string   `json:"suggestion,omitempty"`
}

type JSONFixResult struct {
	Success     bool   `json:"success"`
	PackageName string `json:"package_name"`
	FromVersion string `json:"from_version"`
	ToVersion   string `json:"to_version"`
	Rollbacked  bool   `json:"rollbacked,omitempty"`
	Error       string `json:"error,omitempty"`
}

func (r *JSONReporter) Name() string { return "json" }

func (r *JSONReporter) Generate(report *Report) (string, error) {
	jsonReport := JSONReport{
		ProjectPath:    report.ProjectPath,
		Language:       report.Language,
		ScanTime:       report.ScanTime,
		TotalDeps:      report.TotalDeps,
		ProjectLicense: report.ProjectLicense,
		Summary: JSONSummary{
			TotalVulns:       report.Summary.TotalVulns,
			CriticalCount:    report.Summary.CriticalCount,
			HighCount:        report.Summary.HighCount,
			MediumCount:      report.Summary.MediumCount,
			LowCount:         report.Summary.LowCount,
			LicenseIssues:    report.Summary.LicenseIssues,
			ConstraintIssues: report.Summary.ConstraintIssues,
			FixedCount:       report.Summary.FixedCount,
			FailedCount:      report.Summary.FailedCount,
		},
	}
	
	for _, v := range report.Vulnerabilities {
		jsonReport.Vulnerabilities = append(jsonReport.Vulnerabilities, toJSONVuln(v))
	}
	
	for _, l := range report.LicenseIssues {
		jsonReport.LicenseIssues = append(jsonReport.LicenseIssues, toJSONLicenseIssue(l))
	}
	
	for _, c := range report.ConstraintIssues {
		jsonReport.ConstraintIssues = append(jsonReport.ConstraintIssues, toJSONConstraintIssue(c))
	}
	
	for _, f := range report.FixResults {
		jsonReport.FixResults = append(jsonReport.FixResults, toJSONFixResult(f))
	}
	
	data, err := json.MarshalIndent(jsonReport, "", "  ")
	if err != nil {
		return "", err
	}
	
	return string(data), nil
}

func toJSONLicenseIssue(l license.LicenseIssue) JSONLicenseIssue {
	return JSONLicenseIssue{
		PackageName:    l.Package.PackageName,
		PackageVersion: l.Package.PackageVersion,
		LicenseName:    l.Package.LicenseName,
		SPDXID:         l.Package.SPDXID,
		ProjectLicense: l.ProjectLicense,
		Compatible:     l.Compatible,
		Reason:         l.Reason,
		Severity:       l.Severity,
		Source:         l.Package.Source,
	}
}

func toJSONConstraintIssue(c constraint.ConstraintIssue) JSONConstraintIssue {
	return JSONConstraintIssue{
		PackageName:    c.PackageName,
		CurrentVersion: c.CurrentVersion,
		RequiredRange:  c.RequiredRange,
		Satisfied:      c.Satisfied,
		Reason:         c.Reason,
		Severity:       c.Severity,
	}
}

func toJSONVuln(v vuln.Vulnerability) JSONVuln {
	jv := JSONVuln{
		ID:               v.ID,
		Severity:         v.Severity,
		CVSS:             v.CVSS,
		PackageName:      v.PackageName,
		Version:          v.Version,
		Ecosystem:        v.Ecosystem,
		Description:      v.Description,
		FixedVersions:    v.FixedVersions,
		AffectedVersions: v.AffectedVersions,
		References:       v.References,
		Suggestion:       v.Suggestion,
	}
	
	if !v.PublishedDate.IsZero() {
		jv.PublishedDate = v.PublishedDate.Format(time.RFC3339)
	}
	
	return jv
}

func toJSONFixResult(f fixer.FixResult) JSONFixResult {
	jfr := JSONFixResult{
		Success:     f.Success,
		PackageName: f.PackageName,
		FromVersion: f.FromVersion,
		ToVersion:   f.ToVersion,
		Rollbacked:  f.Rollbacked,
	}
	
	if f.Error != nil {
		jfr.Error = f.Error.Error()
	}
	
	return jfr
}
