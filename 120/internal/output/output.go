package output

import (
	"encoding/json"
	"fmt"
	"html/template"
	"os"
	"strings"
	"time"

	"cloudinspector/internal/types"
)

type OutputFormat string

const (
	FormatJSON OutputFormat = "json"
	FormatHTML OutputFormat = "html"
	FormatText OutputFormat = "text"
)

type Writer struct {
	Format OutputFormat
	Output string
}

func NewWriter(format OutputFormat, output string) *Writer {
	return &Writer{
		Format: format,
		Output: output,
	}
}

func (w *Writer) Write(report *types.Report) error {
	switch w.Format {
	case FormatJSON:
		return w.writeJSON(report)
	case FormatHTML:
		return w.writeHTML(report)
	case FormatText:
		return w.writeText(report)
	default:
		return fmt.Errorf("unsupported output format: %s", w.Format)
	}
}

func (w *Writer) writeJSON(report *types.Report) error {
	data, err := json.MarshalIndent(report, "", "  ")
	if err != nil {
		return fmt.Errorf("marshal JSON: %w", err)
	}

	if w.Output != "" {
		return os.WriteFile(w.Output, data, 0644)
	}

	fmt.Println(string(data))
	return nil
}

func (w *Writer) writeHTML(report *types.Report) error {
	funcMap := template.FuncMap{
		"riskClass": func(level types.RiskLevel) string {
			switch level {
			case types.RiskCritical:
				return "critical"
			case types.RiskHigh:
				return "high"
			case types.RiskMedium:
				return "medium"
			case types.RiskLow:
				return "low"
			default:
				return "unknown"
			}
		},
		"formatJSON": func(v interface{}) string {
			data, err := json.Marshal(v)
			if err != nil {
				return fmt.Sprintf("%v", v)
			}
			return string(data)
		},
		"joinString": func(parts []string) string {
			return strings.Join(parts, ", ")
		},
	}

	tmpl, err := template.New("report").Funcs(funcMap).Parse(htmlTemplate)
	if err != nil {
		return fmt.Errorf("parse HTML template: %w", err)
	}

	var f *os.File
	if w.Output != "" {
		f, err = os.Create(w.Output)
		if err != nil {
			return fmt.Errorf("create output file: %w", err)
		}
		defer f.Close()
	} else {
		f = os.Stdout
	}

	if err := tmpl.Execute(f, report); err != nil {
		return fmt.Errorf("execute HTML template: %w", err)
	}

	return nil
}

func (w *Writer) writeText(report *types.Report) error {
	var sb strings.Builder

	sb.WriteString("=== 多云资源巡检报告 ===\n\n")
	sb.WriteString(fmt.Sprintf("生成时间: %s\n\n", report.GeneratedAt))

	sb.WriteString("--- 概览 ---\n")
	sb.WriteString(fmt.Sprintf("总资源数: %d\n", report.Summary.TotalResources))
	sb.WriteString(fmt.Sprintf("总风险数: %d\n", report.Summary.TotalRisks))
	sb.WriteString("\n风险等级分布:\n")
	for level, count := range report.Summary.RiskByLevel {
		sb.WriteString(fmt.Sprintf("  %s: %d\n", level, count))
	}
	sb.WriteString("\n风险类别分布:\n")
	for category, count := range report.Summary.RiskByCategory {
		sb.WriteString(fmt.Sprintf("  %s: %d\n", category, count))
	}

	for _, result := range report.Results {
		sb.WriteString(fmt.Sprintf("\n--- 账号: %s (%s) ---\n", result.Account, result.Provider))
		sb.WriteString(fmt.Sprintf("资源数: %d, 风险数: %d\n", len(result.Resources), len(result.Risks)))

		if len(result.Risks) > 0 {
			sb.WriteString("\n风险列表:\n")
			for _, risk := range result.Risks {
				sb.WriteString(fmt.Sprintf("  [%s] %s - %s\n", risk.Level, risk.ResourceName, risk.Message))
			}
		}
	}

	if w.Output != "" {
		return os.WriteFile(w.Output, []byte(sb.String()), 0644)
	}

	fmt.Print(sb.String())
	return nil
}

func BuildReport(results []types.ScanResult) *types.Report {
	summary := computeSummary(results)
	return &types.Report{
		GeneratedAt: time.Now().Format(time.RFC3339),
		Summary:     summary,
		Results:     results,
	}
}

func computeSummary(results []types.ScanResult) types.ReportSummary {
	summary := types.ReportSummary{
		RiskByLevel:    make(map[types.RiskLevel]int),
		RiskByCategory: make(map[types.RiskCategory]int),
	}

	for _, result := range results {
		summary.TotalResources += len(result.Resources)
		summary.TotalRisks += len(result.Risks)
		for _, risk := range result.Risks {
			summary.RiskByLevel[risk.Level]++
			summary.RiskByCategory[risk.Category]++
		}
	}

	return summary
}
