package chart

import (
	"fmt"
	"math"
	"stockbacktest/internal/data"
	"stockbacktest/internal/finance"
	"strings"
)

func minMax(candles []data.Candle, start, end int) (min, max float64) {
	if start < 0 {
		start = 0
	}
	if end > len(candles) {
		end = len(candles)
	}
	min = math.Inf(1)
	max = math.Inf(-1)
	for i := start; i < end; i++ {
		if finance.LessThan(candles[i].Low, min) {
			min = candles[i].Low
		}
		if finance.GreaterThan(candles[i].High, max) {
			max = candles[i].High
		}
	}
	return
}

func RenderCandles(candles []data.Candle, fastMA, slowMA []float64, width, height int) string {
	if width < 20 || height < 10 || len(candles) == 0 {
		return "窗口太小，无法绘制K线"
	}

	barWidth := 2
	maxBars := (width - 8) / barWidth
	if maxBars < 5 {
		maxBars = 5
	}

	startIdx := len(candles) - maxBars
	if startIdx < 0 {
		startIdx = 0
	}
	visible := candles[startIdx:]

	if len(visible) == 0 {
		return "无数据"
	}

	visibleFast := fastMA[startIdx:]
	visibleSlow := slowMA[startIdx:]

	priceMin, priceMax := minMax(candles, startIdx, len(candles))

	for i := startIdx; i < len(candles); i++ {
		if i < len(fastMA) && finance.IsPositive(fastMA[i]) {
			if finance.LessThan(fastMA[i], priceMin) {
				priceMin = fastMA[i]
			}
			if finance.GreaterThan(fastMA[i], priceMax) {
				priceMax = fastMA[i]
			}
		}
		if i < len(slowMA) && finance.IsPositive(slowMA[i]) {
			if finance.LessThan(slowMA[i], priceMin) {
				priceMin = slowMA[i]
			}
			if finance.GreaterThan(slowMA[i], priceMax) {
				priceMax = slowMA[i]
			}
		}
	}

	priceRange := priceMax - priceMin
	if finance.AlmostZero(priceRange) {
		priceRange = priceMax * 0.01
	}
	priceMin -= priceRange * 0.05
	priceMax += priceRange * 0.05
	priceRange = priceMax - priceMin

	chartHeight := height - 2
	if chartHeight < 4 {
		chartHeight = 4
	}

	canvas := make([][]rune, chartHeight)
	for i := range canvas {
		canvas[i] = make([]rune, width)
		for j := range canvas[i] {
			canvas[i][j] = ' '
		}
	}

	priceToRow := func(p float64) int {
		row := int((priceMax - p) / priceRange * float64(chartHeight-1))
		if row < 0 {
			row = 0
		}
		if row >= chartHeight {
			row = chartHeight - 1
		}
		return row
	}

	col := 8
	for i, c := range visible {
		if col >= width-2 {
			break
		}

		highRow := priceToRow(c.High)
		lowRow := priceToRow(c.Low)
		openRow := priceToRow(c.Open)
		closeRow := priceToRow(c.Close)

		for r := highRow; r <= lowRow; r++ {
			if r >= 0 && r < chartHeight {
				canvas[r][col] = '│'
			}
		}

		isUp := finance.GreaterOrEqual(c.Close, c.Open)
		bodyTop := openRow
		bodyBot := closeRow
		if isUp {
			bodyTop = closeRow
			bodyBot = openRow
		}
		for r := bodyTop; r <= bodyBot; r++ {
			if r >= 0 && r < chartHeight {
				canvas[r][col] = '█'
				if col+1 < width {
					canvas[r][col+1] = '█'
				}
			}
		}
		if !isUp {
			for r := bodyTop; r <= bodyBot; r++ {
				if r >= 0 && r < chartHeight {
					canvas[r][col] = '▓'
					if col+1 < width {
						canvas[r][col+1] = '▓'
					}
				}
			}
		}

		fastIdx := startIdx + i
		if fastIdx < len(fastMA) && finance.IsPositive(fastMA[fastIdx]) {
			maRow := priceToRow(fastMA[fastIdx])
			if maRow >= 0 && maRow < chartHeight {
				if canvas[maRow][col] == ' ' {
					canvas[maRow][col] = '·'
				}
				if col+1 < width && canvas[maRow][col+1] == ' ' {
					canvas[maRow][col+1] = '·'
				}
			}
		}

		if fastIdx < len(slowMA) && finance.IsPositive(slowMA[fastIdx]) {
			maRow := priceToRow(slowMA[fastIdx])
			if maRow >= 0 && maRow < chartHeight {
				if canvas[maRow][col] == ' ' {
					canvas[maRow][col] = '╌'
				}
				if col+1 < width && canvas[maRow][col+1] == ' ' {
					canvas[maRow][col+1] = '╌'
				}
			}
		}

		col += barWidth
	}

	var sb strings.Builder

	priceStep := priceRange / float64(chartHeight-1)
	for i := 0; i < chartHeight; i++ {
		price := priceMax - float64(i)*priceStep
		label := fmt.Sprintf("%8.2f│", price)
		sb.WriteString(label)
		for _, ch := range canvas[i][8:] {
			sb.WriteRune(ch)
		}
		sb.WriteRune('\n')
	}

	sb.WriteString(strings.Repeat("─", 8))
	sb.WriteRune('┴')
	sb.WriteString(strings.Repeat("─", width-8))
	sb.WriteRune('\n')

	labelStep := (width - 8) / 6
	if labelStep < 1 {
		labelStep = 1
	}
	sb.WriteString(strings.Repeat(" ", 8))
	for i := 0; i < len(visible); i += labelStep {
		dateStr := visible[i].Time.Format("01-02")
		padding := ""
		pos := i*barWidth + 8
		if pos < width {
			sb.WriteString(fmt.Sprintf("%*s", -labelStep*barWidth, dateStr))
		}
		_ = padding
	}
	sb.WriteRune('\n')

	sb.WriteString("\n  图例: █=阳线  ▓=阴线  │=影线  ·=快线EMA  ╌=慢线EMA\n")

	return sb.String()
}
