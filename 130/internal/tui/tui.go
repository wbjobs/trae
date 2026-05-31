package tui

import (
	"fmt"
	"stockbacktest/internal/backtest"
	"stockbacktest/internal/chart"
	"stockbacktest/internal/data"
	"stockbacktest/internal/finance"
	"stockbacktest/internal/heatmap"
	"stockbacktest/internal/scan"
	"strings"

	"github.com/charmbracelet/bubbles/viewport"
	tea "github.com/charmbracelet/bubbletea"
	"github.com/charmbracelet/lipgloss"
)

type ViewMode int

const (
	ViewChart ViewMode = iota
	ViewHeatmap
)

var (
	borderStyle = lipgloss.NewStyle().
			Border(lipgloss.NormalBorder()).
			BorderForeground(lipgloss.Color("240")).
			Padding(0, 1)

	titleStyle = lipgloss.NewStyle().
			Bold(true).
			Foreground(lipgloss.Color("39")).
			Background(lipgloss.Color("236")).
			Padding(0, 2)

	selectedStyle = lipgloss.NewStyle().
			Foreground(lipgloss.Color("15")).
			Background(lipgloss.Color("33")).
			Padding(0, 1)

	valueStyle = lipgloss.NewStyle().
			Foreground(lipgloss.Color("45"))

	helpStyle = lipgloss.NewStyle().
			Foreground(lipgloss.Color("241"))

	winStyle  = lipgloss.NewStyle().Foreground(lipgloss.Color("46"))
	loseStyle = lipgloss.NewStyle().Foreground(lipgloss.Color("196"))

	tabActiveStyle = lipgloss.NewStyle().
			Bold(true).
			Foreground(lipgloss.Color("15")).
			Background(lipgloss.Color("33")).
			Padding(0, 2)

	tabInactiveStyle = lipgloss.NewStyle().
				Foreground(lipgloss.Color("244")).
				Background(lipgloss.Color("236")).
				Padding(0, 2)
)

type scanCompleteMsg struct {
	report *scan.ScanReport
	err    error
}

type Model struct {
	Candles   []data.Candle
	Engine    *backtest.Engine
	Config    backtest.Config
	Result    backtest.Result
	Logs      []string
	LogVP     viewport.Model
	ChartVP   viewport.Model
	ParamsVP  viewport.Model
	Selected  int
	Width     int
	Height    int
	Err       error

	ViewMode     ViewMode
	HeatmapVP    viewport.Model
	ScanReport   *scan.ScanReport
	HeatMetric   heatmap.Metric
	Scanning     bool
	ScanProgress string
}

func NewModel(candles []data.Candle, cfg backtest.Config) *Model {
	m := &Model{
		Candles:    candles,
		Config:     cfg,
		Selected:   0,
		HeatMetric: heatmap.MetricReturn,
	}

	engine := backtest.NewEngine(candles, cfg)
	result := engine.Run()
	m.Engine = engine
	m.Result = result
	m.Logs = engine.Logs

	return m
}

func (m Model) Init() tea.Cmd {
	return nil
}

func (m Model) Update(msg tea.Msg) (tea.Model, tea.Cmd) {
	var cmd tea.Cmd

	switch msg := msg.(type) {
	case scanCompleteMsg:
		m.Scanning = false
		if msg.err != nil {
			m.ScanProgress = fmt.Sprintf("扫描失败: %v", msg.err)
		} else {
			m.ScanReport = msg.report
			m.updateHeatmap()
		}
		return m, nil

	case tea.WindowSizeMsg:
		m.Width = msg.Width
		m.Height = msg.Height
		m.updateViewports()
		return m, nil

	case tea.KeyMsg:
		switch msg.String() {
		case "q", "ctrl+c", "esc":
			return m, tea.Quit

		case "s", "S":
			if m.ViewMode == ViewChart {
				m.ViewMode = ViewHeatmap
				if m.ScanReport == nil && !m.Scanning {
					return m, m.startScan()
				}
			} else {
				m.ViewMode = ViewChart
			}
			m.updateViewports()

		case "m", "M":
			if m.ViewMode == ViewHeatmap && m.ScanReport != nil {
				m.HeatMetric = (m.HeatMetric + 1) % 4
				m.updateHeatmap()
			}

		case "up", "k":
			if m.Selected > 0 {
				m.Selected--
				m.reRun()
			}

		case "down", "j":
			if m.Selected < 5 {
				m.Selected++
				m.reRun()
			}

		case "left", "h":
			m.adjustParam(-1)
			m.reRun()

		case "right", "l":
			m.adjustParam(1)
			m.reRun()

		case "r":
			m.Config = backtest.DefaultConfig()
			m.reRun()

		case "enter", " ":
			if m.Selected == 5 {
				m.Config.UseRSI = !m.Config.UseRSI
				m.reRun()
			}
		}
	}

	m.ParamsVP.SetContent(m.renderParams())
	return m, cmd
}

func (m *Model) startScan() tea.Cmd {
	m.Scanning = true
	m.ScanProgress = "正在扫描参数空间..."
	candles := m.Candles
	cfg := m.Config
	return func() tea.Msg {
		sp := scan.DefaultScanParams()
		sp.UseRSI = cfg.UseRSI
		report, err := scan.RunScan(candles, cfg, sp)
		return scanCompleteMsg{report: report, err: err}
	}
}

func (m *Model) updateViewports() {
	col1Width := int(float64(m.Width) * 0.55)
	col2Width := int(float64(m.Width) * 0.25)
	col3Width := int(float64(m.Width) * 0.20)

	chartHeight := m.Height - 8
	if chartHeight < 10 {
		chartHeight = 10
	}

	chartContent := chart.RenderCandles(m.Candles, m.Engine.FastMA, m.Engine.SlowMA, col1Width-4, chartHeight)
	m.ChartVP = viewport.New(col1Width-4, chartHeight)
	m.ChartVP.SetContent(chartContent)

	logHeight := m.Height - 8
	if logHeight < 5 {
		logHeight = 5
	}
	m.LogVP = viewport.New(col2Width-4, logHeight)
	m.LogVP.SetContent(strings.Join(m.Logs, "\n"))

	paramsHeight := m.Height - 8
	if paramsHeight < 10 {
		paramsHeight = 10
	}
	m.ParamsVP = viewport.New(col3Width-4, paramsHeight)
	m.ParamsVP.SetContent(m.renderParams())

	heatmapHeight := m.Height - 8
	if heatmapHeight < 15 {
		heatmapHeight = 15
	}
	m.HeatmapVP = viewport.New(col1Width-4, heatmapHeight)
	if m.Scanning {
		m.HeatmapVP.SetContent("\n  " + m.ScanProgress + "\n\n  请稍候，正在批量回测参数组合...")
	} else if m.ScanReport != nil {
		m.updateHeatmap()
	} else {
		m.HeatmapVP.SetContent("\n  按 S 切换到热力图\n\n  按 M 切换热力图指标")
	}
}

func (m *Model) updateHeatmap() {
	if m.ScanReport == nil || m.Width == 0 {
		return
	}
	col1Width := int(float64(m.Width) * 0.55)
	heatmapHeight := m.Height - 8
	if heatmapHeight < 15 {
		heatmapHeight = 15
	}
	content := heatmap.RenderHeatmap(m.ScanReport, m.HeatMetric, col1Width-4, heatmapHeight)
	content += heatmap.RenderBestList(m.ScanReport, 5)
	m.HeatmapVP.SetContent(content)
}

func (m *Model) reRun() {
	engine := backtest.NewEngine(m.Candles, m.Config)
	result := engine.Run()
	m.Engine = engine
	m.Result = result
	m.Logs = engine.Logs
	m.ScanReport = nil

	col1Width := int(float64(m.Width) * 0.55)
	col2Width := int(float64(m.Width) * 0.25)

	chartHeight := m.Height - 8
	if chartHeight < 10 {
		chartHeight = 10
	}
	chartContent := chart.RenderCandles(m.Candles, m.Engine.FastMA, m.Engine.SlowMA, col1Width-4, chartHeight)
	m.ChartVP.SetContent(chartContent)
	m.ChartVP.GotoBottom()

	logHeight := m.Height - 8
	if logHeight < 5 {
		logHeight = 5
	}
	m.LogVP.Width = col2Width - 4
	m.LogVP.Height = logHeight
	m.LogVP.SetContent(strings.Join(m.Logs, "\n"))
	m.LogVP.GotoBottom()
}

func (m *Model) adjustParam(delta int) {
	switch m.Selected {
	case 0:
		m.Config.FastPeriod += delta
		if m.Config.FastPeriod < 2 {
			m.Config.FastPeriod = 2
		}
		if m.Config.FastPeriod > 100 {
			m.Config.FastPeriod = 100
		}
	case 1:
		m.Config.SlowPeriod += delta
		if m.Config.SlowPeriod < 5 {
			m.Config.SlowPeriod = 5
		}
		if m.Config.SlowPeriod > 200 {
			m.Config.SlowPeriod = 200
		}
	case 2:
		m.Config.RSIPeriod += delta
		if m.Config.RSIPeriod < 2 {
			m.Config.RSIPeriod = 2
		}
		if m.Config.RSIPeriod > 100 {
			m.Config.RSIPeriod = 100
		}
	case 3:
		m.Config.RSIOversold = finance.Round(m.Config.RSIOversold+float64(delta)*5, 2)
		if finance.LessThan(m.Config.RSIOversold, 5) {
			m.Config.RSIOversold = 5
		}
		if finance.GreaterThan(m.Config.RSIOversold, m.Config.RSIOverbought-5) {
			m.Config.RSIOversold = finance.Round(m.Config.RSIOverbought-5, 2)
		}
	case 4:
		m.Config.RSIOverbought = finance.Round(m.Config.RSIOverbought+float64(delta)*5, 2)
		if finance.GreaterThan(m.Config.RSIOverbought, 95) {
			m.Config.RSIOverbought = 95
		}
		if finance.LessThan(m.Config.RSIOverbought, m.Config.RSIOversold+5) {
			m.Config.RSIOverbought = finance.Round(m.Config.RSIOversold+5, 2)
		}
	}
}

func (m Model) renderParams() string {
	var sb strings.Builder

	items := []struct {
		label string
		value string
	}{
		{"快线周期 (EMA)", fmt.Sprintf("%d", m.Config.FastPeriod)},
		{"慢线周期 (EMA)", fmt.Sprintf("%d", m.Config.SlowPeriod)},
		{"RSI 周期", fmt.Sprintf("%d", m.Config.RSIPeriod)},
		{"RSI 超卖线", fmt.Sprintf("%.0f", m.Config.RSIOversold)},
		{"RSI 超买线", fmt.Sprintf("%.0f", m.Config.RSIOverbought)},
		{"启用 RSI 过滤", fmt.Sprintf("%t", m.Config.UseRSI)},
	}

	for i, item := range items {
		if i == m.Selected {
			sb.WriteString(selectedStyle.Render(fmt.Sprintf("> %s: %s", item.label, item.value)))
		} else {
			sb.WriteString(fmt.Sprintf("  %s: ", item.label))
			sb.WriteString(valueStyle.Render(item.value))
		}
		sb.WriteString("\n\n")
	}

	sb.WriteString(strings.Repeat("─", 30))
	sb.WriteString("\n\n")

	sb.WriteString("回测结果:\n\n")
	sb.WriteString(fmt.Sprintf("初始资金: %.2f\n", m.Config.InitialCash))
	sb.WriteString(fmt.Sprintf("最终价值: %s\n", valueStyle.Render(fmt.Sprintf("%.2f", m.Result.FinalValue))))

	returnPct := m.Result.TotalReturnPct
	returnStr := fmt.Sprintf("%+.2f%%", returnPct)
	if finance.GreaterOrEqual(returnPct, 0) {
		sb.WriteString(fmt.Sprintf("总收益: %s\n", winStyle.Render(returnStr)))
	} else {
		sb.WriteString(fmt.Sprintf("总收益: %s\n", loseStyle.Render(returnStr)))
	}

	sb.WriteString(fmt.Sprintf("交易次数: %d\n", m.Result.NumTrades))
	sb.WriteString(fmt.Sprintf("胜率: %.1f%%\n", m.Result.WinRate))
	sb.WriteString(fmt.Sprintf("最大回撤: %.2f%%\n", m.Result.MaxDrawdown))
	sb.WriteString(fmt.Sprintf("夏普比率: %.2f\n", m.Result.SharpeRatio))

	bhReturn := m.Result.BuyHoldReturn
	bhStr := fmt.Sprintf("%+.2f%%", bhReturn)
	if finance.GreaterOrEqual(bhReturn, 0) {
		sb.WriteString(fmt.Sprintf("买入持有: %s\n", winStyle.Render(bhStr)))
	} else {
		sb.WriteString(fmt.Sprintf("买入持有: %s\n", loseStyle.Render(bhStr)))
	}

	sb.WriteString("\n" + strings.Repeat("─", 30) + "\n\n")
	sb.WriteString(helpStyle.Render("快捷键:\n"))
	sb.WriteString(helpStyle.Render("↑/↓: 选择参数\n"))
	sb.WriteString(helpStyle.Render("←/→: 调整数值\n"))
	sb.WriteString(helpStyle.Render("空格: 切换 RSI\n"))
	sb.WriteString(helpStyle.Render("R: 重置参数\n"))
	sb.WriteString(helpStyle.Render("S: 切换热力图\n"))
	sb.WriteString(helpStyle.Render("M: 切换指标\n"))
	sb.WriteString(helpStyle.Render("Q: 退出\n"))

	return sb.String()
}

func (m Model) View() string {
	if m.Width == 0 {
		return "  加载中...\n\n  请调整终端窗口大小以显示完整界面"
	}

	col1Width := int(float64(m.Width) * 0.55)
	col2Width := int(float64(m.Width) * 0.25)
	col3Width := int(float64(m.Width) * 0.20)

	if col1Width < 40 {
		col1Width = 40
	}
	if col2Width < 20 {
		col2Width = 20
	}
	if col3Width < 20 {
		col3Width = 20
	}

	var col1 string
	if m.ViewMode == ViewHeatmap {
		heatmapTitle := fmt.Sprintf(" 热力图 [%s] ", m.HeatMetric.String())
		col1 = borderStyle.Width(col1Width - 2).Render(
			titleStyle.Render(heatmapTitle) + "\n" + m.HeatmapVP.View(),
		)
	} else {
		col1 = borderStyle.Width(col1Width - 2).Render(
			titleStyle.Render(" K 线图 ") + "\n" + m.ChartVP.View(),
		)
	}

	col2 := borderStyle.Width(col2Width - 2).Render(
		titleStyle.Render(" 回测日志 ") + "\n" + m.LogVP.View(),
	)

	col3 := borderStyle.Width(col3Width - 2).Render(
		titleStyle.Render(" 策略参数 ") + "\n" + m.ParamsVP.View(),
	)

	tabs := lipgloss.JoinHorizontal(
		lipgloss.Left,
		renderTab("K线图", m.ViewMode == ViewChart),
		renderTab("热力图", m.ViewMode == ViewHeatmap),
	)

	summary := m.Result.Summary()
	summaryBar := lipgloss.NewStyle().
		Foreground(lipgloss.Color("15")).
		Background(lipgloss.Color("237")).
		Padding(0, 2).
		Width(m.Width - 4).
		Render(summary)

	helpBar := helpStyle.Render("  方向键调整参数  |  S 切换热力图  |  M 切换指标  |  R 重置  |  Q 退出")

	return tabs + "\n" + lipgloss.JoinHorizontal(lipgloss.Top, col1, col2, col3) + "\n" + summaryBar + "\n" + helpBar
}

func renderTab(label string, active bool) string {
	if active {
		return tabActiveStyle.Render(" " + label + " ")
	}
	return tabInactiveStyle.Render(" " + label + " ")
}
