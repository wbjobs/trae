package data

import (
	"encoding/csv"
	"fmt"
	"os"
	"stockbacktest/internal/finance"
	"strconv"
	"strings"
	"time"
)

type Candle struct {
	Time   time.Time
	Open   float64
	High   float64
	Low    float64
	Close  float64
	Volume float64
}

func LoadCSV(path string) ([]Candle, error) {
	f, err := os.Open(path)
	if err != nil {
		return nil, fmt.Errorf("打开 CSV 文件失败: %w", err)
	}
	defer f.Close()

	reader := csv.NewReader(f)
	records, err := reader.ReadAll()
	if err != nil {
		return nil, fmt.Errorf("读取 CSV 失败: %w", err)
	}

	if len(records) < 2 {
		return nil, fmt.Errorf("CSV 数据不足（至少需要表头+1行）")
	}

	header := strings.ToLower(strings.Join(records[0], ","))
	colIdx := mapHeaders(records[0])

	var candles []Candle
	for i, row := range records[1:] {
		if len(row) < 5 {
			continue
		}

		c, err := parseRow(row, colIdx)
		if err != nil {
			return nil, fmt.Errorf("第 %d 行解析失败: %w", i+2, err)
		}
		candles = append(candles, c)
	}

	_ = header
	return candles, nil
}

func mapHeaders(headers []string) map[string]int {
	m := make(map[string]int)
	for i, h := range headers {
		key := strings.ToLower(strings.TrimSpace(h))
		m[key] = i
	}
	return m
}

func parseRow(row []string, colIdx map[string]int) (Candle, error) {
	var c Candle

	timeIdx, ok := colIdx["date"]
	if !ok {
		timeIdx, ok = colIdx["time"]
	}
	if !ok {
		timeIdx, ok = colIdx["datetime"]
	}
	if !ok {
		timeIdx = 0
	}
	t, err := parseDate(row[timeIdx])
	if err != nil {
		return c, err
	}
	c.Time = t

	openIdx, ok := colIdx["open"]
	if !ok {
		openIdx = 1
	}
	c.Open, err = strconv.ParseFloat(strings.TrimSpace(row[openIdx]), 64)
	if err != nil {
		return c, fmt.Errorf("解析 open 失败: %w", err)
	}
	c.Open = finance.Round(c.Open, 4)

	highIdx, ok := colIdx["high"]
	if !ok {
		highIdx = 2
	}
	c.High, err = strconv.ParseFloat(strings.TrimSpace(row[highIdx]), 64)
	if err != nil {
		return c, fmt.Errorf("解析 high 失败: %w", err)
	}
	c.High = finance.Round(c.High, 4)

	lowIdx, ok := colIdx["low"]
	if !ok {
		lowIdx = 3
	}
	c.Low, err = strconv.ParseFloat(strings.TrimSpace(row[lowIdx]), 64)
	if err != nil {
		return c, fmt.Errorf("解析 low 失败: %w", err)
	}
	c.Low = finance.Round(c.Low, 4)

	closeIdx, ok := colIdx["close"]
	if !ok {
		closeIdx = 4
	}
	c.Close, err = strconv.ParseFloat(strings.TrimSpace(row[closeIdx]), 64)
	if err != nil {
		return c, fmt.Errorf("解析 close 失败: %w", err)
	}
	c.Close = finance.Round(c.Close, 4)

	volIdx, ok := colIdx["volume"]
	if ok && volIdx < len(row) {
		c.Volume, _ = strconv.ParseFloat(strings.TrimSpace(row[volIdx]), 64)
		c.Volume = finance.Round(c.Volume, 0)
	}

	return c, nil
}

func parseDate(s string) (time.Time, error) {
	s = strings.TrimSpace(s)
	layouts := []string{
		"2006-01-02",
		"2006/01/02",
		"2006-01-02 15:04:05",
		"2006/01/02 15:04:05",
		"01/02/2006",
		"02-01-2006",
		"20060102",
		time.RFC3339,
	}
	for _, layout := range layouts {
		if t, err := time.Parse(layout, s); err == nil {
			return t, nil
		}
	}
	return time.Time{}, fmt.Errorf("无法解析日期: %s", s)
}
