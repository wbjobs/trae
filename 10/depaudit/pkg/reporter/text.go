package reporter

import (
	"fmt"
	"strings"
)

type TextReporter struct{}

func (r *TextReporter) Name() string { return "text" }

func (r *TextReporter) Generate(report *Report) (string, error) {
	var sb strings.Builder
	
	sb.WriteString("=" + strings.Repeat("=", 60) + "=\n")
	sb.WriteString("  DEPENDENCY SECURITY AUDIT REPORT\n")
	sb.WriteString("=" + strings.Repeat("=", 60) + "=\n\n")
	
	sb.WriteString(fmt.Sprintf("Project Path: %s\n", report.ProjectPath))
	sb.WriteString(fmt.Sprintf("Language: %s\n", report.Language))
	sb.WriteString(fmt.Sprintf("Scan Time: %s\n", report.ScanTime.Format("2006-01-02 15:04:05")))
	sb.WriteString(fmt.Sprintf("Total Dependencies: %d\n", report.TotalDeps))
	if report.ProjectLicense != "" {
		sb.WriteString(fmt.Sprintf("Project License: %s\n", report.ProjectLicense))
	}
	sb.WriteString("\n")
	
	sb.WriteString("-" + strings.Repeat("-", 60) + "\n")
	sb.WriteString("  SUMMARY\n")
	sb.WriteString("-" + strings.Repeat("-", 60) + "\n\n")
	
	sb.WriteString(fmt.Sprintf("Total Vulnerabilities: %d\n", report.Summary.TotalVulns))
	sb.WriteString(fmt.Sprintf("  Critical: %d\n", report.Summary.CriticalCount))
	sb.WriteString(fmt.Sprintf("  High:     %d\n", report.Summary.HighCount))
	sb.WriteString(fmt.Sprintf("  Medium:   %d\n", report.Summary.MediumCount))
	sb.WriteString(fmt.Sprintf("  Low:      %d\n", report.Summary.LowCount))
	sb.WriteString(fmt.Sprintf("\nLicense Issues:       %d\n", report.Summary.LicenseIssues))
	sb.WriteString(fmt.Sprintf("Constraint Issues:    %d\n", report.Summary.ConstraintIssues))
	sb.WriteString(fmt.Sprintf("\nFixed:  %d\n", report.Summary.FixedCount))
	sb.WriteString(fmt.Sprintf("Failed: %d\n\n", report.Summary.FailedCount))
	
	if len(report.Vulnerabilities) > 0 {
		sb.WriteString("-" + strings.Repeat("-", 60) + "\n")
		sb.WriteString("  VULNERABILITIES\n")
		sb.WriteString("-" + strings.Repeat("-", 60) + "\n\n")
		
		for i, vuln := range report.Vulnerabilities {
			sb.WriteString(fmt.Sprintf("[%d] %s\n", i+1, vuln.ID))
			sb.WriteString(fmt.Sprintf("  Package:    %s\n", vuln.PackageName))
			sb.WriteString(fmt.Sprintf("  Version:    %s\n", vuln.AffectedVersions))
			sb.WriteString(fmt.Sprintf("  Severity:   %s (CVSS: %.1f)\n", vuln.Severity, vuln.CVSS))
			sb.WriteString(fmt.Sprintf("  Ecosystem:  %s\n", vuln.Ecosystem))
			
			if vuln.Description != "" {
				desc := wrapText(vuln.Description, 56)
				sb.WriteString(fmt.Sprintf("  Description:\n    %s\n", strings.Join(desc, "\n    ")))
			}
			
			if len(vuln.FixedVersions) > 0 {
				sb.WriteString(fmt.Sprintf("  Fixed Versions: %s\n", strings.Join(vuln.FixedVersions, ", ")))
			}
			
			if vuln.Suggestion != "" {
				sb.WriteString(fmt.Sprintf("  Suggestion: %s\n", vuln.Suggestion))
			}
			
			if len(vuln.References) > 0 {
				sb.WriteString("  References:\n")
				for _, ref := range vuln.References {
					sb.WriteString(fmt.Sprintf("    - %s\n", ref))
				}
			}
			
			sb.WriteString("\n")
		}
	}
	
	if len(report.LicenseIssues) > 0 {
		sb.WriteString("-" + strings.Repeat("-", 60) + "\n")
		sb.WriteString("  LICENSE ISSUES\n")
		sb.WriteString("-" + strings.Repeat("-", 60) + "\n\n")
		
		for i, issue := range report.LicenseIssues {
			sb.WriteString(fmt.Sprintf("[%d] %s\n", i+1, issue.Package.PackageName))
			sb.WriteString(fmt.Sprintf("  Version:    %s\n", issue.Package.PackageVersion))
			sb.WriteString(fmt.Sprintf("  License:    %s\n", issue.Package.LicenseName))
			sb.WriteString(fmt.Sprintf("  Severity:   %s\n", issue.Severity))
			sb.WriteString(fmt.Sprintf("  Reason:     %s\n", issue.Reason))
			sb.WriteString("\n")
		}
	}
	
	if len(report.ConstraintIssues) > 0 {
		sb.WriteString("-" + strings.Repeat("-", 60) + "\n")
		sb.WriteString("  VERSION CONSTRAINT ISSUES\n")
		sb.WriteString("-" + strings.Repeat("-", 60) + "\n\n")
		
		for i, issue := range report.ConstraintIssues {
			sb.WriteString(fmt.Sprintf("[%d] %s\n", i+1, issue.PackageName))
			sb.WriteString(fmt.Sprintf("  Current:    %s\n", issue.CurrentVersion))
			sb.WriteString(fmt.Sprintf("  Required:   %s\n", issue.RequiredRange))
			sb.WriteString(fmt.Sprintf("  Reason:     %s\n", issue.Reason))
			sb.WriteString("\n")
		}
	}
	
	if len(report.FixResults) > 0 {
		sb.WriteString("-" + strings.Repeat("-", 60) + "\n")
		sb.WriteString("  FIX RESULTS\n")
		sb.WriteString("-" + strings.Repeat("-", 60) + "\n\n")
		
		for _, result := range report.FixResults {
			status := "✓ SUCCESS"
			if !result.Success {
				status = "✗ FAILED"
				if result.Rollbacked {
					status += " (Rolled back)"
				}
			}
			
			sb.WriteString(fmt.Sprintf("[%s] %s\n", status, result.PackageName))
			sb.WriteString(fmt.Sprintf("  From: %s -> To: %s\n", result.FromVersion, result.ToVersion))
			
			if result.Error != nil {
				sb.WriteString(fmt.Sprintf("  Error: %s\n", result.Error.Error()))
			}
			sb.WriteString("\n")
		}
	}
	
	totalIssues := report.Summary.TotalVulns + report.Summary.LicenseIssues + report.Summary.ConstraintIssues
	if totalIssues == 0 {
		sb.WriteString("✓ No issues found! All checks passed.\n")
	}
	
	return sb.String(), nil
}

func wrapText(text string, width int) []string {
	var lines []string
	words := strings.Fields(text)
	
	if len(words) == 0 {
		return lines
	}
	
	currentLine := words[0]
	for _, word := range words[1:] {
		if len(currentLine)+1+len(word) <= width {
			currentLine += " " + word
		} else {
			lines = append(lines, currentLine)
			currentLine = word
		}
	}
	lines = append(lines, currentLine)
	
	return lines
}
