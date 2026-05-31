package scan

import (
	"fmt"
	"stockbacktest/internal/backtest"
	"stockbacktest/internal/data"
	"sync"
)

type ScanParams struct {
	FastMin  int
	FastMax  int
	FastStep int
	SlowMin  int
	SlowMax  int
	SlowStep int
	UseRSI   bool
}

func DefaultScanParams() ScanParams {
	return ScanParams{
		FastMin:  5,
		FastMax:  20,
		FastStep: 1,
		SlowMin:  20,
		SlowMax:  60,
		SlowStep: 1,
		UseRSI:   false,
	}
}

type ScanResult struct {
	FastPeriod int
	SlowPeriod int
	ReturnPct  float64
	WinRate    float64
	MaxDD      float64
	Sharpe     float64
	NumTrades  int
}

type ScanReport struct {
	Params   ScanParams
	Results  []ScanResult
	Best     ScanResult
	Worst    ScanResult
	AvgReturn float64
	FastRange []int
	SlowRange []int
}

func RunScan(candles []data.Candle, baseCfg backtest.Config, sp ScanParams) (*ScanReport, error) {
	if sp.FastMin >= sp.SlowMin {
		return nil, fmt.Errorf("快线最小周期必须小于慢线最小周期")
	}

	fastRange := make([]int, 0)
	for f := sp.FastMin; f <= sp.FastMax; f += sp.FastStep {
		fastRange = append(fastRange, f)
	}

	slowRange := make([]int, 0)
	for s := sp.SlowMin; s <= sp.SlowMax; s += sp.SlowStep {
		slowRange = append(slowRange, s)
	}

	results := make([]ScanResult, 0, len(fastRange)*len(slowRange))
	resultCh := make(chan ScanResult, len(fastRange)*len(slowRange))

	var wg sync.WaitGroup
	sem := make(chan struct{}, 8)

	for _, fast := range fastRange {
		for _, slow := range slowRange {
			if fast >= slow {
				continue
			}
			wg.Add(1)
			sem <- struct{}{}
			go func(f, s int) {
				defer wg.Done()
				defer func() { <-sem }()

				cfg := baseCfg
				cfg.FastPeriod = f
				cfg.SlowPeriod = s
				cfg.UseRSI = sp.UseRSI

				engine := backtest.NewEngine(candles, cfg)
				result := engine.Run()

				resultCh <- ScanResult{
					FastPeriod: f,
					SlowPeriod: s,
					ReturnPct:  result.TotalReturnPct,
					WinRate:    result.WinRate,
					MaxDD:      result.MaxDrawdown,
					Sharpe:     result.SharpeRatio,
					NumTrades:  result.NumTrades,
				}
			}(fast, slow)
		}
	}

	wg.Wait()
	close(resultCh)

	for r := range resultCh {
		results = append(results, r)
	}

	if len(results) == 0 {
		return nil, fmt.Errorf("没有有效的参数组合")
	}

	best := results[0]
	worst := results[0]
	var totalReturn float64

	for _, r := range results {
		if r.ReturnPct > best.ReturnPct {
			best = r
		}
		if r.ReturnPct < worst.ReturnPct {
			worst = r
		}
		totalReturn += r.ReturnPct
	}

	avgReturn := totalReturn / float64(len(results))

	return &ScanReport{
		Params:    sp,
		Results:   results,
		Best:      best,
		Worst:     worst,
		AvgReturn: avgReturn,
		FastRange: fastRange,
		SlowRange: slowRange,
	}, nil
}

func (r *ScanReport) ResultMatrix() map[[2]int]ScanResult {
	m := make(map[[2]int]ScanResult)
	for _, res := range r.Results {
		m[[2]int{res.FastPeriod, res.SlowPeriod}] = res
	}
	return m
}
