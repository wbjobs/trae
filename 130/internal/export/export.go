package export

import (
	"encoding/csv"
	"fmt"
	"os"
	"stockbacktest/internal/backtest"
	"stockbacktest/internal/data"
	"strconv"
)

func ExportReport(path string, result backtest.Result, candles []data.Candle, cfg backtest.Config) error {
	f, err := os.Create(path)
	if err != nil {
		return fmt.Errorf("创建导出文件失败: %w", err)
	}
	defer f.Close()

	w := csv.NewWriter(f)
	defer w.Flush()

	if err := w.Write([]string{"股票回测报告"}); err != nil {
		return err
	}
	if err := w.Write([]string{""}); err != nil {
		return err
	}

	if err := w.Write([]string{"策略参数"}); err != nil {
		return err
	}
	params := [][]string{
		{"快线周期", strconv.Itoa(cfg.FastPeriod)},
		{"慢线周期", strconv.Itoa(cfg.SlowPeriod)},
		{"RSI周期", strconv.Itoa(cfg.RSIPeriod)},
		{"RSI超卖线", fmt.Sprintf("%.0f", cfg.RSIOversold)},
		{"RSI超买线", fmt.Sprintf("%.0f", cfg.RSIOverbought)},
		{"启用RSI过滤", fmt.Sprintf("%t", cfg.UseRSI)},
		{"初始资金", fmt.Sprintf("%.2f", cfg.InitialCash)},
	}
	for _, p := range params {
		if err := w.Write(p); err != nil {
			return err
		}
	}
	if err := w.Write([]string{""}); err != nil {
		return err
	}

	if err := w.Write([]string{"回测结果"}); err != nil {
		return err
	}
	results := [][]string{
		{"最终价值", fmt.Sprintf("%.2f", result.FinalValue)},
		{"总收益", fmt.Sprintf("%+.2f", result.TotalReturn)},
		{"总收益率(%)", fmt.Sprintf("%+.2f", result.TotalReturnPct)},
		{"交易次数", strconv.Itoa(result.NumTrades)},
		{"盈利次数", strconv.Itoa(result.WinTrades)},
		{"亏损次数", strconv.Itoa(result.LoseTrades)},
		{"胜率(%)", fmt.Sprintf("%.1f", result.WinRate)},
		{"最大回撤(%)", fmt.Sprintf("%.2f", result.MaxDrawdown)},
		{"夏普比率", fmt.Sprintf("%.2f", result.SharpeRatio)},
		{"买入持有收益(%)", fmt.Sprintf("%+.2f", result.BuyHoldReturn)},
	}
	for _, r := range results {
		if err := w.Write(r); err != nil {
			return err
		}
	}
	if err := w.Write([]string{""}); err != nil {
		return err
	}

	if err := w.Write([]string{"交易明细"}); err != nil {
		return err
	}
	header := []string{"序号", "日期", "方向", "价格", "股数", "成本", "盈亏", "盈亏率(%)", "原因"}
	if err := w.Write(header); err != nil {
		return err
	}

	for i, t := range result.Trades {
		row := []string{
			strconv.Itoa(i + 1),
			t.Time.Format("2006-01-02"),
			t.Signal.String(),
			fmt.Sprintf("%.2f", t.Price),
			fmt.Sprintf("%.4f", t.Shares),
			fmt.Sprintf("%.2f", t.Cost),
			fmt.Sprintf("%+.2f", t.PnL),
			fmt.Sprintf("%+.2f", t.PnLPct),
			t.Reason,
		}
		if err := w.Write(row); err != nil {
			return err
		}
	}
	if err := w.Write([]string{""}); err != nil {
		return err
	}

	if err := w.Write([]string{"K线数据（前100行）"}); err != nil {
		return err
	}
	klineHeader := []string{"日期", "开盘", "最高", "最低", "收盘", "成交量"}
	if err := w.Write(klineHeader); err != nil {
		return err
	}

	maxRows := 100
	if len(candles) < maxRows {
		maxRows = len(candles)
	}
	for i := 0; i < maxRows; i++ {
		c := candles[i]
		row := []string{
			c.Time.Format("2006-01-02"),
			fmt.Sprintf("%.2f", c.Open),
			fmt.Sprintf("%.2f", c.High),
			fmt.Sprintf("%.2f", c.Low),
			fmt.Sprintf("%.2f", c.Close),
			fmt.Sprintf("%.0f", c.Volume),
		}
		if err := w.Write(row); err != nil {
			return err
		}
	}

	return nil
}
