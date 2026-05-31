package main

import (
	"flag"
	"fmt"
	"math"
	"math/rand"
	"os"
	"stockbacktest/internal/backtest"
	"stockbacktest/internal/data"
	"stockbacktest/internal/export"
	"stockbacktest/internal/heatmap"
	"stockbacktest/internal/scan"
	"stockbacktest/internal/tui"
	"time"

	tea "github.com/charmbracelet/bubbletea"
)

var (
	csvPath     = flag.String("csv", "", "CSV 历史数据文件路径（含 date/open/high/low/close/volume 列）")
	exportPath  = flag.String("export", "", "导出报告 CSV 路径，如 report.csv")
	fastPeriod  = flag.Int("fast", 12, "快线 EMA 周期")
	slowPeriod  = flag.Int("slow", 26, "慢线 EMA 周期")
	rsiPeriod   = flag.Int("rsi", 14, "RSI 周期")
	useRSI      = flag.Bool("use-rsi", false, "启用 RSI 过滤")
	initialCash = flag.Float64("cash", 100000, "初始资金")
	genSample   = flag.Bool("gen-sample", false, "生成示例数据 sample.csv")
	scanMode    = flag.Bool("scan", false, "启用参数扫描模式")
	fastMin     = flag.Int("fast-min", 5, "参数扫描：快线最小周期")
	fastMax     = flag.Int("fast-max", 20, "参数扫描：快线最大周期")
	slowMin     = flag.Int("slow-min", 20, "参数扫描：慢线最小周期")
	slowMax     = flag.Int("slow-max", 60, "参数扫描：慢线最大周期")
	scanMetric  = flag.String("scan-metric", "return", "参数扫描热力图指标: return/winrate/sharpe/maxdd")
	scanExport  = flag.String("scan-export", "", "参数扫描结果导出路径")
)

func main() {
	flag.Parse()

	if *genSample {
		if err := generateSampleData("sample.csv"); err != nil {
			fmt.Fprintf(os.Stderr, "生成示例数据失败: %v\n", err)
			os.Exit(1)
		}
		fmt.Println("已生成示例数据: sample.csv")
		return
	}

	var candles []data.Candle
	var err error

	if *csvPath != "" {
		candles, err = data.LoadCSV(*csvPath)
		if err != nil {
			fmt.Fprintf(os.Stderr, "加载 CSV 失败: %v\n", err)
			os.Exit(1)
		}
		fmt.Printf("已加载 %d 条 K 线数据\n", len(candles))
	} else {
		fmt.Println("未指定 CSV 文件，生成示例数据进行演示...")
		candles = generateDemoData()
	}

	if len(candles) < 50 {
		fmt.Fprintf(os.Stderr, "数据不足，至少需要 50 条 K 线\n")
		os.Exit(1)
	}

	cfg := backtest.DefaultConfig()
	cfg.FastPeriod = *fastPeriod
	cfg.SlowPeriod = *slowPeriod
	cfg.RSIPeriod = *rsiPeriod
	cfg.UseRSI = *useRSI
	cfg.InitialCash = *initialCash

	if *scanMode {
		runScanMode(candles, cfg)
		return
	}

	engine := backtest.NewEngine(candles, cfg)
	result := engine.Run()

	fmt.Printf("\n=== 回测结果 ===\n")
	fmt.Println(result.Summary())
	fmt.Printf("交易次数: %d (盈: %d, 亏: %d)\n", result.NumTrades, result.WinTrades, result.LoseTrades)
	fmt.Println()

	if *exportPath != "" {
		if err := export.ExportReport(*exportPath, result, candles, cfg); err != nil {
			fmt.Fprintf(os.Stderr, "导出失败: %v\n", err)
			os.Exit(1)
		}
		fmt.Printf("报告已导出到: %s\n", *exportPath)
		return
	}

	fmt.Println("启动 TUI 界面... (按 Q 退出)")
	time.Sleep(500 * time.Millisecond)

	model := tui.NewModel(candles, cfg)
	p := tea.NewProgram(model, tea.WithAltScreen())

	if _, err := p.Run(); err != nil {
		fmt.Fprintf(os.Stderr, "TUI 运行失败: %v\n", err)
		os.Exit(1)
	}
}

func runScanMode(candles []data.Candle, cfg backtest.Config) {
	sp := scan.DefaultScanParams()
	sp.FastMin = *fastMin
	sp.FastMax = *fastMax
	sp.SlowMin = *slowMin
	sp.SlowMax = *slowMax
	sp.UseRSI = *useRSI

	metric := heatmap.MetricReturn
	switch *scanMetric {
	case "winrate":
		metric = heatmap.MetricWinRate
	case "sharpe":
		metric = heatmap.MetricSharpe
	case "maxdd":
		metric = heatmap.MetricMaxDD
	}

	fmt.Printf("\n=== 参数扫描模式 ===\n")
	fmt.Printf("快线范围: %d - %d\n", sp.FastMin, sp.FastMax)
	fmt.Printf("慢线范围: %d - %d\n", sp.SlowMin, sp.SlowMax)
	fmt.Printf("RSI过滤: %v\n", sp.UseRSI)
	fmt.Printf("热力图指标: %s\n", metric.String())
	fmt.Println("\n正在批量回测... (使用 8 个并发线程)")

	report, err := scan.RunScan(candles, cfg, sp)
	if err != nil {
		fmt.Fprintf(os.Stderr, "参数扫描失败: %v\n", err)
		os.Exit(1)
	}

	fmt.Printf("完成！共测试 %d 组参数组合\n\n", len(report.Results))

	fmt.Println(heatmap.RenderHeatmap(report, metric, 120, 40))
	fmt.Println(heatmap.RenderBestList(report, 10))

	if *scanExport != "" {
		if err := exportScanReport(*scanExport, report); err != nil {
			fmt.Fprintf(os.Stderr, "导出扫描结果失败: %v\n", err)
			os.Exit(1)
		}
		fmt.Printf("\n扫描结果已导出到: %s\n", *scanExport)
	}

	if *exportPath != "" {
		bestCfg := cfg
		bestCfg.FastPeriod = report.Best.FastPeriod
		bestCfg.SlowPeriod = report.Best.SlowPeriod
		engine := backtest.NewEngine(candles, bestCfg)
		bestResult := engine.Run()
		if err := export.ExportReport(*exportPath, bestResult, candles, bestCfg); err != nil {
			fmt.Fprintf(os.Stderr, "导出最优策略报告失败: %v\n", err)
			os.Exit(1)
		}
		fmt.Printf("最优策略报告已导出到: %s\n", *exportPath)
	}
}

func exportScanReport(path string, report *scan.ScanReport) error {
	f, err := os.Create(path)
	if err != nil {
		return err
	}
	defer f.Close()

	fmt.Fprintln(f, "快线周期,慢线周期,总收益率(%),胜率(%),夏普比率,最大回撤(%),交易次数")
	for _, r := range report.Results {
		fmt.Fprintf(f, "%d,%d,%.4f,%.4f,%.4f,%.4f,%d\n",
			r.FastPeriod, r.SlowPeriod,
			r.ReturnPct, r.WinRate, r.Sharpe, r.MaxDD, r.NumTrades)
	}
	return nil
}

func generateDemoData() []data.Candle {
	rand.Seed(42)
	numDays := 252
	candles := make([]data.Candle, numDays)

	price := 100.0
	date := time.Now().AddDate(0, 0, -numDays)

	for i := 0; i < numDays; i++ {
		open := price
		trend := math.Sin(float64(i)/20) * 0.5
		drift := 0.0005 + trend*0.005
		volatility := 0.02 + rand.Float64()*0.02
		close := price * (1 + drift + (rand.Float64()-0.5)*volatility)
		high := math.Max(open, close) * (1 + rand.Float64()*0.01)
		low := math.Min(open, close) * (1 - rand.Float64()*0.01)
		volume := 1000000 + rand.Float64()*2000000

		candles[i] = data.Candle{
			Time:   date,
			Open:   open,
			High:   high,
			Low:    low,
			Close:  close,
			Volume: volume,
		}

		price = close
		date = date.AddDate(0, 0, 1)
	}

	return candles
}

func generateSampleData(path string) error {
	rand.Seed(time.Now().UnixNano())
	numDays := 252

	f, err := os.Create(path)
	if err != nil {
		return err
	}
	defer f.Close()

	fmt.Fprintln(f, "Date,Open,High,Low,Close,Volume")

	price := 50.0
	date := time.Now().AddDate(0, 0, -numDays)

	for i := 0; i < numDays; i++ {
		open := price
		trend := math.Sin(float64(i)/15) * 0.3
		drift := 0.0003 + trend*0.004
		volatility := 0.015 + rand.Float64()*0.02
		close := price * (1 + drift + (rand.Float64()-0.5)*volatility)
		high := math.Max(open, close) * (1 + rand.Float64()*0.012)
		low := math.Min(open, close) * (1 - rand.Float64()*0.012)
		volume := 500000 + rand.Float64()*5000000

		fmt.Fprintf(f, "%s,%.2f,%.2f,%.2f,%.2f,%.0f\n",
			date.Format("2006-01-02"), open, high, low, close, volume)

		price = close
		date = date.AddDate(0, 0, 1)
	}

	return nil
}
