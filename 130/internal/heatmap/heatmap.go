package heatmap

import (
	"fmt"
	"sort"
	"stockbacktest/internal/finance"
	"stockbacktest/internal/scan"
	"strings"

	"github.com/charmbracelet/lipgloss"
)

type Metric int

const (
	MetricReturn Metric = iota
	MetricWinRate
	MetricSharpe
	MetricMaxDD
)

func (m Metric) String() string {
	switch m {
	case MetricReturn:
		return "总收益率(%)"
	case MetricWinRate:
		return "胜率(%)"
	case MetricSharpe:
		return "夏普比率"
	case MetricMaxDD:
		return "最大回撤(%)"
	default:
		return "未知"
	}
}

var (
	heatColors = []string{
		"#08306b",
		"#08519c",
		"#2171b5",
		"#4292c6",
		"#6baed6",
		"#9ecae1",
		"#c6dbef",
		"#deebf7",
		"#fff7e6",
		"#fee08b",
		"#fdae61",
		"#f46d43",
		"#d73027",
		"#a50026",
		"#67000d",
	}
)

func RenderHeatmap(report *scan.ScanReport, metric Metric, width, height int) string {
	if width < 40 || height < 10 {
		return "窗口太小，无法绘制热力图"
	}

	results := report.ResultMatrix()

	fastRange := make([]int, len(report.FastRange))
	copy(fastRange, report.FastRange)
	sort.Ints(fastRange)

	slowRange := make([]int, len(report.SlowRange))
	copy(slowRange, report.SlowRange)
	sort.Sort(sort.Reverse(sort.IntSlice(slowRange)))

	maxCols := (width - 12) / 4
	maxRows := height - 4

	if maxCols < 3 {
		maxCols = 3
	}
	if maxRows < 3 {
		maxRows = 3
	}

	displayFast := sampleRange(fastRange, maxCols)
	displaySlow := sampleRange(slowRange, maxRows)

	values := make([][]float64, len(displaySlow))
	for i := range values {
		values[i] = make([]float64, len(displayFast))
	}

	var minVal, maxVal float64
	first := true

	for si, s := range displaySlow {
		for fi, f := range displayFast {
			key := [2]int{f, s}
			res, ok := results[key]
			val := 0.0
			if ok {
				switch metric {
				case MetricReturn:
					val = res.ReturnPct
				case MetricWinRate:
					val = res.WinRate
				case MetricSharpe:
					val = res.Sharpe
				case MetricMaxDD:
					val = -res.MaxDD
				}
			}
			values[si][fi] = val

			if first {
				minVal = val
				maxVal = val
				first = false
			} else {
				if val < minVal {
					minVal = val
				}
				if val > maxVal {
					maxVal = val
				}
			}
		}
	}

	if finance.AlmostEqual(minVal, maxVal) {
		maxVal = minVal + 1
	}

	var sb strings.Builder

	title := fmt.Sprintf("  参数扫描热力图 - %s\n\n", metric.String())
	sb.WriteString(title)

	sb.WriteString(strings.Repeat(" ", 10))
	for _, f := range displayFast {
		sb.WriteString(fmt.Sprintf("%3d ", f))
	}
	sb.WriteString("\n")
	sb.WriteString(strings.Repeat(" ", 9) + "┌")
	sb.WriteString(strings.Repeat("───┬", len(displayFast)-1))
	sb.WriteString("───┐\n")

	for si, s := range displaySlow {
		sb.WriteString(fmt.Sprintf("%7d │", s))
		for fi := range displayFast {
			val := values[si][fi]
			colorIdx := getColorIndex(val, minVal, maxVal)
			style := lipgloss.NewStyle().
				Background(lipgloss.Color(heatColors[colorIdx])).
				Foreground(lipgloss.Color("#ffffff"))

			var displayStr string
			if metric == MetricMaxDD {
				displayStr = fmt.Sprintf("%5.1f", -val)
			} else {
				displayStr = fmt.Sprintf("%5.1f", val)
			}

			if len(displayStr) > 4 {
				displayStr = displayStr[:4]
			}
			displayStr = fmt.Sprintf("%3s ", strings.TrimSpace(displayStr))

			sb.WriteString(style.Render(displayStr))
			sb.WriteString("│")
		}
		sb.WriteString("\n")

		if si < len(displaySlow)-1 {
			sb.WriteString(strings.Repeat(" ", 9) + "├")
			sb.WriteString(strings.Repeat("───┼", len(displayFast)-1))
			sb.WriteString("───┤\n")
		}
	}

	sb.WriteString(strings.Repeat(" ", 9) + "└")
	sb.WriteString(strings.Repeat("───┴", len(displayFast)-1))
	sb.WriteString("───┘\n")

	sb.WriteString("\n  图例:  ")
	sb.WriteString(colorBar(minVal, maxVal))
	sb.WriteString("\n\n")

	sb.WriteString(fmt.Sprintf("  最优参数: 快线=%d, 慢线=%d → 收益: %+.2f%%, 胜率: %.1f%%, 夏普: %.2f\n",
		report.Best.FastPeriod, report.Best.SlowPeriod,
		report.Best.ReturnPct, report.Best.WinRate, report.Best.Sharpe))
	sb.WriteString(fmt.Sprintf("  最差参数: 快线=%d, 慢线=%d → 收益: %+.2f%%, 最大回撤: %.2f%%\n",
		report.Worst.FastPeriod, report.Worst.SlowPeriod,
		report.Worst.ReturnPct, report.Worst.MaxDD))
	sb.WriteString(fmt.Sprintf("  平均收益: %+.2f%%,  测试组合数: %d\n",
		report.AvgReturn, len(report.Results)))

	return sb.String()
}

func sampleRange(rng []int, max int) []int {
	if len(rng) <= max {
		return rng
	}

	result := make([]int, max)
	step := float64(len(rng)-1) / float64(max-1)
	for i := 0; i < max; i++ {
		idx := int(float64(i) * step)
		if idx >= len(rng) {
			idx = len(rng) - 1
		}
		result[i] = rng[idx]
	}
	return result
}

func getColorIndex(val, minVal, maxVal float64) int {
	ratio := (val - minVal) / (maxVal - minVal)
	if ratio < 0 {
		ratio = 0
	}
	if ratio > 1 {
		ratio = 1
	}
	idx := int(ratio * float64(len(heatColors)-1))
	if idx >= len(heatColors) {
		idx = len(heatColors) - 1
	}
	return idx
}

func colorBar(minVal, maxVal float64) string {
	var sb strings.Builder
	steps := 10
	for i := 0; i < steps; i++ {
		ratio := float64(i) / float64(steps-1)
		idx := int(ratio * float64(len(heatColors)-1))
		style := lipgloss.NewStyle().
			Background(lipgloss.Color(heatColors[idx]))
		sb.WriteString(style.Render("  "))
	}
	sb.WriteString(fmt.Sprintf("  低: %.1f  高: %.1f", minVal, maxVal))
	return sb.String()
}

func RenderBestList(report *scan.ScanReport, topN int) string {
	if topN <= 0 {
		topN = 5
	}

	results := make([]scan.ScanResult, len(report.Results))
	copy(results, report.Results)

	sort.Slice(results, func(i, j int) bool {
		return results[i].ReturnPct > results[j].ReturnPct
	})

	var sb strings.Builder
	sb.WriteString(fmt.Sprintf("\n  === Top %d 参数组合（按收益率排序） ===\n\n", topN))
	sb.WriteString(fmt.Sprintf("  %-6s  %-6s  %-10s  %-8s  %-10s  %-8s  %-6s\n",
		"快线", "慢线", "收益率(%)", "胜率(%)", "夏普比率", "回撤(%)", "交易数"))
	sb.WriteString("  " + strings.Repeat("─", 70) + "\n")

	for i := 0; i < topN && i < len(results); i++ {
		r := results[i]
		returnStyle := lipgloss.NewStyle()
		if r.ReturnPct >= 0 {
			returnStyle = returnStyle.Foreground(lipgloss.Color("46"))
		} else {
			returnStyle = returnStyle.Foreground(lipgloss.Color("196"))
		}

		sb.WriteString(fmt.Sprintf("  %-6d  %-6d  %-10s  %-8.1f  %-10.2f  %-8.2f  %-6d\n",
			r.FastPeriod, r.SlowPeriod,
			returnStyle.Render(fmt.Sprintf("%+8.2f", r.ReturnPct)),
			r.WinRate, r.Sharpe, r.MaxDD, r.NumTrades))
	}

	return sb.String()
}
