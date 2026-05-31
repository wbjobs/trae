package backtest

import (
	"fmt"
	"stockbacktest/internal/data"
	"stockbacktest/internal/finance"
	"stockbacktest/internal/indicator"
	"time"
)

type Signal int

const (
	SignalNone Signal = iota
	SignalBuy
	SignalSell
)

func (s Signal) String() string {
	switch s {
	case SignalBuy:
		return "BUY"
	case SignalSell:
		return "SELL"
	default:
		return "HOLD"
	}
}

type Trade struct {
	Index     int
	Time      time.Time
	Signal    Signal
	Price     float64
	Shares    float64
	Cost      float64
	PnL       float64
	PnLPct    float64
	Reason    string
}

type Result struct {
	Trades       []Trade
	FinalValue   float64
	TotalReturn  float64
	TotalReturnPct float64
	WinRate      float64
	MaxDrawdown  float64
	SharpeRatio  float64
	NumTrades    int
	WinTrades    int
	LoseTrades   int
	BuyHoldReturn float64
}

type Config struct {
	FastPeriod   int
	SlowPeriod   int
	RSIPeriod    int
	RSIOverbought float64
	RSIOversold   float64
	InitialCash  float64
	UseRSI       bool
}

func DefaultConfig() Config {
	return Config{
		FastPeriod:    12,
		SlowPeriod:    26,
		RSIPeriod:     14,
		RSIOverbought: 70,
		RSIOversold:   30,
		InitialCash:   100000,
		UseRSI:        false,
	}
}

type Engine struct {
	Candles    []data.Candle
	FastMA     []float64
	SlowMA     []float64
	RSI        []float64
	Config     Config
	Result     Result
	Logs       []string
}

func NewEngine(candles []data.Candle, cfg Config) *Engine {
	closes := make([]float64, len(candles))
	for i, c := range candles {
		closes[i] = c.Close
	}

	return &Engine{
		Candles: candles,
		FastMA:  indicator.EMA(closes, cfg.FastPeriod),
		SlowMA:  indicator.EMA(closes, cfg.SlowPeriod),
		RSI:     indicator.RSI(closes, cfg.RSIPeriod),
		Config:  cfg,
	}
}

func (e *Engine) Run() Result {
	trades := make([]Trade, 0)
	logs := make([]string, 0)
	cash := e.Config.InitialCash
	var shares float64
	var entryPrice float64
	var entryIndex int
	var peakValue float64
	maxDrawdown := 0.0
	equityCurve := make([]float64, len(e.Candles))

	winCount := 0
	loseCount := 0

	for i := e.Config.SlowPeriod; i < len(e.Candles); i++ {
		signal := e.generateSignal(i)
		c := e.Candles[i]
		currentValue := cash + shares*c.Close
		if finance.GreaterThan(currentValue, peakValue) {
			peakValue = currentValue
		}
		drawdown := (peakValue - currentValue) / peakValue
		if finance.GreaterThan(drawdown, maxDrawdown) {
			maxDrawdown = drawdown
		}
		equityCurve[i] = currentValue

		switch signal {
		case SignalBuy:
			if finance.AlmostZero(shares) && finance.IsPositive(cash) {
				shares = finance.Round(cash/c.Close, 6)
				entryPrice = c.Close
				entryIndex = i
				cash = 0
				cost := finance.Round(shares*c.Close, 2)
				trades = append(trades, Trade{
					Index:  i,
					Time:   c.Time,
					Signal: SignalBuy,
					Price:  c.Close,
					Shares: shares,
					Cost:   cost,
					Reason: e.signalReason(i, SignalBuy),
				})
				logs = append(logs, fmt.Sprintf("[%s] BUY  %.4f shares @ %.2f  (成本: %.2f)",
					c.Time.Format("2006-01-02"), shares, c.Close, cost))
			}

		case SignalSell:
			if finance.IsPositive(shares) {
				pnl := finance.Round((c.Close-entryPrice)*shares, 2)
				pnlPct := finance.Round((c.Close-entryPrice)/entryPrice*100, 4)
				cash = finance.Round(shares*c.Close, 2)
				cost := finance.Round(shares*entryPrice, 2)
				trades = append(trades, Trade{
					Index:  i,
					Time:   c.Time,
					Signal: SignalSell,
					Price:  c.Close,
					Shares: shares,
					Cost:   cost,
					PnL:    pnl,
					PnLPct: pnlPct,
					Reason: e.signalReason(i, SignalSell),
				})
				logs = append(logs, fmt.Sprintf("[%s] SELL %.4f shares @ %.2f  (盈亏: %+.2f, %+.2f%%)",
					c.Time.Format("2006-01-02"), shares, c.Close, pnl, pnlPct))
				shares = 0
				entryPrice = 0
				entryIndex = 0
				if finance.IsPositive(pnl) {
					winCount++
				} else if finance.IsNegative(pnl) {
					loseCount++
				} else {
					winCount++
				}
			}
		}
	}

	finalValue := cash
	if finance.IsPositive(shares) {
		lastClose := e.Candles[len(e.Candles)-1].Close
		finalValue = finance.Round(shares*lastClose, 2)
		pnl := finance.Round((lastClose-entryPrice)*shares, 2)
		pnlPct := finance.Round((lastClose-entryPrice)/entryPrice*100, 4)
		cost := finance.Round(shares*entryPrice, 2)
		trades = append(trades, Trade{
			Index:  len(e.Candles) - 1,
			Time:   e.Candles[len(e.Candles)-1].Time,
			Signal: SignalSell,
			Price:  lastClose,
			Shares: shares,
			Cost:   cost,
			PnL:    pnl,
			PnLPct: pnlPct,
			Reason: "回测结束强制平仓",
		})
		logs = append(logs, fmt.Sprintf("[%s] FORCE-SELL %.4f shares @ %.2f  (盈亏: %+.2f, %+.2f%%)",
			e.Candles[len(e.Candles)-1].Time.Format("2006-01-02"), shares, lastClose, pnl, pnlPct))
		if finance.IsPositive(pnl) {
			winCount++
		} else if finance.IsNegative(pnl) {
			loseCount++
		} else {
			winCount++
		}
	}

	totalReturn := finance.Round(finalValue-e.Config.InitialCash, 2)
	totalReturnPct := finance.Round(totalReturn/e.Config.InitialCash*100, 4)

	buyHoldReturn := finance.Round(
		(e.Candles[len(e.Candles)-1].Close-e.Candles[0].Close)/e.Candles[0].Close*100, 4,
	)

	numTrades := winCount + loseCount
	winRate := 0.0
	if numTrades > 0 {
		winRate = finance.Round(float64(winCount)/float64(numTrades)*100, 2)
	}

	e.Logs = logs

	e.Result = Result{
		Trades:         trades,
		FinalValue:     finance.Round(finalValue, 2),
		TotalReturn:    totalReturn,
		TotalReturnPct: totalReturnPct,
		WinRate:        winRate,
		MaxDrawdown:    finance.Round(maxDrawdown*100, 2),
		SharpeRatio:    finance.Round(calcSharpe(equityCurve, e.Config.InitialCash), 4),
		NumTrades:      numTrades,
		WinTrades:      winCount,
		LoseTrades:     loseCount,
		BuyHoldReturn:  buyHoldReturn,
	}

	return e.Result
}

func (e *Engine) generateSignal(i int) Signal {
	prev := i - 1
	if prev < 0 {
		return SignalNone
	}

	fastPrev := e.FastMA[prev]
	slowPrev := e.SlowMA[prev]
	fastCurr := e.FastMA[i]
	slowCurr := e.SlowMA[i]

	prevBelow := finance.LessOrEqual(fastPrev, slowPrev)
	currAbove := finance.GreaterThan(fastCurr, slowCurr)
	fastCrossUp := prevBelow && currAbove

	prevAbove := finance.GreaterOrEqual(fastPrev, slowPrev)
	currBelow := finance.LessThan(fastCurr, slowCurr)
	fastCrossDown := prevAbove && currBelow

	if !e.Config.UseRSI {
		if fastCrossUp {
			return SignalBuy
		}
		if fastCrossDown {
			return SignalSell
		}
		return SignalNone
	}

	rsiVal := e.RSI[i]
	if fastCrossUp && finance.LessThan(rsiVal, e.Config.RSIOverbought) {
		return SignalBuy
	}
	if fastCrossDown && finance.GreaterThan(rsiVal, e.Config.RSIOversold) {
		return SignalSell
	}
	return SignalNone
}

func (e *Engine) signalReason(i int, s Signal) string {
	if s == SignalBuy {
		if e.Config.UseRSI {
			return fmt.Sprintf("金叉 + RSI=%.1f", e.RSI[i])
		}
		return fmt.Sprintf("金叉 (快线%.2f 上穿 慢线%.2f)", e.FastMA[i], e.SlowMA[i])
	}
	if s == SignalSell {
		if e.Config.UseRSI {
			return fmt.Sprintf("死叉 + RSI=%.1f", e.RSI[i])
		}
		return fmt.Sprintf("死叉 (快线%.2f 下穿 慢线%.2f)", e.FastMA[i], e.SlowMA[i])
	}
	return ""
}

func calcSharpe(equity []float64, initial float64) float64 {
	if len(equity) < 2 {
		return 0
	}
	returns := make([]float64, 0)
	for i := 1; i < len(equity); i++ {
		if finance.AlmostZero(equity[i-1]) || finance.AlmostZero(equity[i]) {
			continue
		}
		ret := (equity[i] - equity[i-1]) / equity[i-1]
		returns = append(returns, ret)
	}
	if len(returns) == 0 {
		return 0
	}

	var mean float64
	for _, r := range returns {
		mean += r
	}
	mean = finance.Round(mean/float64(len(returns)), 10)

	var variance float64
	for _, r := range returns {
		diff := r - mean
		variance += diff * diff
	}
	variance = finance.Round(variance/float64(len(returns)), 12)
	std := finance.Round(sqrt(variance), 10)

	if finance.AlmostZero(std) {
		return 0
	}
	return finance.Round(mean/std*sqrt(252), 4)
}

func sqrt(x float64) float64 {
	if finance.LessOrEqual(x, 0) {
		return 0
	}
	z := x
	for i := 0; i < 100; i++ {
		next := (z + x/z) / 2
		if finance.AlmostEqual(z, next) {
			break
		}
		z = next
	}
	return z
}

func (r Result) Summary() string {
	return fmt.Sprintf(
		"最终价值: %.2f | 总收益: %+.2f (%.2f%%) | 胜率: %.1f%% | 最大回撤: %.2f%% | 夏普: %.2f | 交易次数: %d | 买入持有: %.2f%%",
		r.FinalValue, r.TotalReturn, r.TotalReturnPct, r.WinRate, r.MaxDrawdown, r.SharpeRatio, r.NumTrades, r.BuyHoldReturn,
	)
}
