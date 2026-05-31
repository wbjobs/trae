package indicator

import "stockbacktest/internal/finance"

func SMA(closes []float64, period int) []float64 {
	result := make([]float64, len(closes))
	if period <= 0 || len(closes) < period {
		return result
	}

	var sum float64
	for i := 0; i < period; i++ {
		sum += closes[i]
	}
	result[period-1] = finance.Round(sum/float64(period), 6)

	for i := period; i < len(closes); i++ {
		sum += closes[i] - closes[i-period]
		result[i] = finance.Round(sum/float64(period), 6)
	}
	return result
}

func EMA(closes []float64, period int) []float64 {
	result := make([]float64, len(closes))
	if period <= 0 || len(closes) < period {
		return result
	}

	k := 2.0 / float64(period+1)

	var sum float64
	for i := 0; i < period; i++ {
		sum += closes[i]
	}
	prev := finance.Round(sum/float64(period), 6)
	result[period-1] = prev

	for i := period; i < len(closes); i++ {
		prev = finance.Round(closes[i]*k+prev*(1-k), 6)
		result[i] = prev
	}
	return result
}

func RSI(closes []float64, period int) []float64 {
	result := make([]float64, len(closes))
	if period <= 0 || len(closes) < period+1 {
		return result
	}

	var avgGain, avgLoss float64
	for i := 1; i <= period; i++ {
		diff := closes[i] - closes[i-1]
		if finance.IsPositive(diff) {
			avgGain += diff
		} else if finance.IsNegative(diff) {
			avgLoss -= diff
		}
	}
	avgGain = finance.Round(avgGain/float64(period), 6)
	avgLoss = finance.Round(avgLoss/float64(period), 6)

	if finance.AlmostZero(avgLoss) {
		result[period] = 100
	} else {
		rs := avgGain / avgLoss
		result[period] = finance.Round(100-100/(1+rs), 4)
	}

	for i := period + 1; i < len(closes); i++ {
		diff := closes[i] - closes[i-1]
		var gain, loss float64
		if finance.IsPositive(diff) {
			gain = diff
		} else if finance.IsNegative(diff) {
			loss = -diff
		}
		avgGain = finance.Round((avgGain*float64(period-1)+gain)/float64(period), 6)
		avgLoss = finance.Round((avgLoss*float64(period-1)+loss)/float64(period), 6)

		if finance.AlmostZero(avgLoss) {
			result[i] = 100
		} else {
			rs := avgGain / avgLoss
			result[i] = finance.Round(100-100/(1+rs), 4)
		}
	}
	return result
}
