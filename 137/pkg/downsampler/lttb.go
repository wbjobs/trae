package downsampler

import (
	"math"
	"time"

	"github.com/prometheus/common/model"
)

type Point struct {
	Timestamp time.Time
	Value     float64
}

func (p Point) X() float64 {
	return float64(p.Timestamp.UnixNano()) / 1e9
}

type SamplePair struct {
	Timestamp model.Time
	Value     model.SampleValue
}

func LTTBSamplePair(data []SamplePair, threshold int) []SamplePair {
	return AdaptiveLTTBSamplePair(data, threshold)
}

func LTTBWithExtremesSamplePair(data []SamplePair, threshold int) []SamplePair {
	if len(data) <= threshold || threshold <= 2 {
		return data
	}

	extremes := findExtremeIndicesSamplePair(data)
	globalMaxIdx, globalMinIdx := findGlobalExtremesSamplePair(data)

	extremes[globalMaxIdx] = true
	extremes[globalMinIdx] = true

	sampled := make([]SamplePair, 0, threshold+len(extremes))
	sampled = append(sampled, data[0])

	extremeCount := 0
	for i := 1; i < len(data)-1; i++ {
		if extremes[i] {
			extremeCount++
		}
	}

	adjustedThreshold := threshold - extremeCount - 2
	if adjustedThreshold < 2 {
		adjustedThreshold = 2
	}

	bucketSize := float64(len(data)-2) / float64(adjustedThreshold)
	lastAddedIdx := 0

	for i := 0; i < adjustedThreshold; i++ {
		rangeStart := int(math.Floor(float64(i)*bucketSize)) + 1
		rangeEnd := int(math.Floor(float64(i+1)*bucketSize)) + 1
		if rangeEnd > len(data)-1 {
			rangeEnd = len(data) - 1
		}

		avgRangeStart := int(math.Floor(float64(i+1)*bucketSize)) + 1
		avgRangeEnd := int(math.Floor(float64(i+2)*bucketSize)) + 1
		if avgRangeEnd > len(data)-1 {
			avgRangeEnd = len(data) - 1
		}

		avgX, avgY := calculateAvgSamplePair(data, avgRangeStart, avgRangeEnd)

		pointA := sampled[len(sampled)-1]
		ax := float64(pointA.Timestamp.Unix())
		ay := float64(pointA.Value)

		hasExtreme := false
		extremeMaxIdx := rangeStart
		extremeMinIdx := rangeStart
		maxVal := float64(data[rangeStart].Value)
		minVal := float64(data[rangeStart].Value)

		for j := rangeStart; j < rangeEnd; j++ {
			val := float64(data[j].Value)
			if extremes[j] {
				hasExtreme = true
				if val > maxVal {
					maxVal = val
					extremeMaxIdx = j
				}
				if val < minVal {
					minVal = val
					extremeMinIdx = j
				}
			}
		}

		if hasExtreme {
			if extremeMaxIdx != extremeMinIdx {
				if extremeMaxIdx < extremeMinIdx {
					sampled = append(sampled, data[extremeMaxIdx])
					lastAddedIdx = extremeMaxIdx
					sampled = append(sampled, data[extremeMinIdx])
					lastAddedIdx = extremeMinIdx
				} else {
					sampled = append(sampled, data[extremeMinIdx])
					lastAddedIdx = extremeMinIdx
					sampled = append(sampled, data[extremeMaxIdx])
					lastAddedIdx = extremeMaxIdx
				}
				continue
			} else {
				sampled = append(sampled, data[extremeMaxIdx])
				lastAddedIdx = extremeMaxIdx
				continue
			}
		}

		maxArea := float64(-1)
		maxAreaIndex := rangeStart

		for j := rangeStart; j < rangeEnd; j++ {
			cx := float64(data[j].Timestamp.Unix())
			cy := float64(data[j].Value)

			area := triangleArea(ax, ay, avgX, avgY, cx, cy)
			if area > maxArea {
				maxArea = area
				maxAreaIndex = j
			}
		}

		sampled = append(sampled, data[maxAreaIndex])
		lastAddedIdx = maxAreaIndex
	}

	sampled = append(sampled, data[len(data)-1])

	sampled = deduplicateAndSortSamplePair(sampled)

	return sampled
}

func AdaptiveLTTBSamplePair(data []SamplePair, threshold int) []SamplePair {
	if len(data) <= threshold || threshold <= 2 {
		return data
	}

	changeRates := calculateChangeRatesSamplePair(data)

	extremes := findExtremeIndicesSamplePair(data)
	globalMaxIdx, globalMinIdx := findGlobalExtremesSamplePair(data)

	extremes[globalMaxIdx] = true
	extremes[globalMinIdx] = true

	highChangeIndices := findHighChangeIndices(changeRates, 0.7)
	for idx := range highChangeIndices {
		extremes[idx] = true
	}

	avgBucketSize := float64(len(data)-2) / float64(threshold-2)

	sampled := make([]SamplePair, 0, threshold*2)
	sampled = append(sampled, data[0])

	currentPos := 1
	totalDataPoints := len(data) - 2

	for currentPos < len(data)-1 {
		remainingPoints := len(data) - 1 - currentPos
		remainingBuckets := threshold - len(sampled) - 1

		if remainingBuckets <= 0 {
			break
		}

		localChange := calculateLocalChangeRate(changeRates, currentPos, avgBucketSize)
		adaptiveFactor := calculateAdaptiveFactor(localChange)

		bucketSize := avgBucketSize / adaptiveFactor
		bucketSize = math.Max(1.0, math.Min(bucketSize, float64(remainingPoints/remainingBuckets)*2))

		rangeEnd := currentPos + int(bucketSize)
		if rangeEnd > len(data)-1 {
			rangeEnd = len(data) - 1
		}

		hasExtreme := false
		extremeMaxIdx := currentPos
		extremeMinIdx := currentPos
		maxVal := float64(data[currentPos].Value)
		minVal := float64(data[currentPos].Value)

		for j := currentPos; j < rangeEnd; j++ {
			val := float64(data[j].Value)
			if extremes[j] {
				hasExtreme = true
				if val > maxVal {
					maxVal = val
					extremeMaxIdx = j
				}
				if val < minVal {
					minVal = val
					extremeMinIdx = j
				}
			}
		}

		if hasExtreme {
			if extremeMaxIdx != extremeMinIdx {
				if extremeMaxIdx < extremeMinIdx {
					sampled = append(sampled, data[extremeMaxIdx])
					sampled = append(sampled, data[extremeMinIdx])
					currentPos = extremeMinIdx + 1
				} else {
					sampled = append(sampled, data[extremeMinIdx])
					sampled = append(sampled, data[extremeMaxIdx])
					currentPos = extremeMaxIdx + 1
				}
			} else {
				sampled = append(sampled, data[extremeMaxIdx])
				currentPos = extremeMaxIdx + 1
			}
			continue
		}

		avgRangeStart := rangeEnd
		avgRangeEnd := avgRangeStart + int(avgBucketSize)
		if avgRangeEnd > len(data)-1 {
			avgRangeEnd = len(data) - 1
		}

		avgX, avgY := calculateAvgSamplePair(data, avgRangeStart, avgRangeEnd)

		pointA := sampled[len(sampled)-1]
		ax := float64(pointA.Timestamp.Unix())
		ay := float64(pointA.Value)

		maxArea := float64(-1)
		maxAreaIndex := currentPos

		for j := currentPos; j < rangeEnd; j++ {
			cx := float64(data[j].Timestamp.Unix())
			cy := float64(data[j].Value)

			area := triangleArea(ax, ay, avgX, avgY, cx, cy)
			if area > maxArea {
				maxArea = area
				maxAreaIndex = j
			}
		}

		sampled = append(sampled, data[maxAreaIndex])
		currentPos = maxAreaIndex + 1
	}

	if len(sampled) == 0 || sampled[len(sampled)-1].Timestamp != data[len(data)-1].Timestamp {
		sampled = append(sampled, data[len(data)-1])
	}

	sampled = deduplicateAndSortSamplePair(sampled)

	return sampled
}

func calculateChangeRatesSamplePair(data []SamplePair) []float64 {
	if len(data) < 2 {
		return make([]float64, len(data))
	}

	changeRates := make([]float64, len(data))
	changeRates[0] = 0

	for i := 1; i < len(data); i++ {
		currVal := float64(data[i].Value)
		prevVal := float64(data[i-1].Value)

		currTime := float64(data[i].Timestamp.Unix())
		prevTime := float64(data[i-1].Timestamp.Unix())

		timeDiff := currTime - prevTime
		if timeDiff > 0 {
			changeRates[i] = math.Abs(currVal-prevVal) / timeDiff
		}
	}

	return normalizeChangeRates(changeRates)
}

func normalizeChangeRates(rates []float64) []float64 {
	if len(rates) == 0 {
		return rates
	}

	maxRate := float64(0)
	for _, r := range rates {
		if r > maxRate {
			maxRate = r
		}
	}

	if maxRate == 0 {
		return rates
	}

	normalized := make([]float64, len(rates))
	for i, r := range rates {
		normalized[i] = r / maxRate
	}

	return normalized
}

func findHighChangeIndices(rates []float64, threshold float64) map[int]bool {
	highChange := make(map[int]bool)

	for i, rate := range rates {
		if rate >= threshold {
			highChange[i] = true
			if i > 0 {
				highChange[i-1] = true
			}
			if i < len(rates)-1 {
				highChange[i+1] = true
			}
		}
	}

	return highChange
}

func calculateLocalChangeRate(rates []float64, pos int, windowSize float64) float64 {
	start := pos
	end := pos + int(windowSize)
	if end > len(rates) {
		end = len(rates)
	}

	if start >= end {
		return 0
	}

	sum := float64(0)
	count := 0
	for i := start; i < end; i++ {
		sum += rates[i]
		count++
	}

	if count == 0 {
		return 0
	}

	return sum / float64(count)
}

func calculateAdaptiveFactor(localChangeRate float64) float64 {
	if localChangeRate < 0.1 {
		return 2.5
	} else if localChangeRate < 0.3 {
		return 1.8
	} else if localChangeRate < 0.5 {
		return 1.3
	} else if localChangeRate < 0.7 {
		return 1.0
	} else {
		return 0.6
	}
}

func findExtremeIndicesSamplePair(data []SamplePair) map[int]bool {
	extremes := make(map[int]bool)
	n := len(data)

	if n < 3 {
		return extremes
	}

	for i := 1; i < n-1; i++ {
		curr := float64(data[i].Value)
		prev := float64(data[i-1].Value)
		next := float64(data[i+1].Value)

		if (curr > prev && curr > next) || (curr < prev && curr < next) {
			extremes[i] = true
		}
	}

	windowSize := 5
	for i := windowSize; i < n-windowSize; i++ {
		curr := float64(data[i].Value)
		isLocalMax := true
		isLocalMin := true

		for j := i - windowSize; j <= i+windowSize; j++ {
			if j == i {
				continue
			}
			val := float64(data[j].Value)
			if val >= curr {
				isLocalMax = false
			}
			if val <= curr {
				isLocalMin = false
			}
		}

		if isLocalMax || isLocalMin {
			extremes[i] = true
		}
	}

	return extremes
}

func findGlobalExtremesSamplePair(data []SamplePair) (maxIdx, minIdx int) {
	if len(data) == 0 {
		return 0, 0
	}

	maxVal := float64(data[0].Value)
	minVal := float64(data[0].Value)
	maxIdx = 0
	minIdx = 0

	for i := 1; i < len(data); i++ {
		val := float64(data[i].Value)
		if val > maxVal {
			maxVal = val
			maxIdx = i
		}
		if val < minVal {
			minVal = val
			minIdx = i
		}
	}

	return maxIdx, minIdx
}

func deduplicateAndSortSamplePair(data []SamplePair) []SamplePair {
	if len(data) < 2 {
		return data
	}

	seen := make(map[model.Time]bool)
	result := make([]SamplePair, 0, len(data))

	for _, p := range data {
		if !seen[p.Timestamp] {
			seen[p.Timestamp] = true
			result = append(result, p)
		}
	}

	for i := 1; i < len(result); i++ {
		if result[i].Timestamp < result[i-1].Timestamp {
			for j := i; j > 0 && result[j].Timestamp < result[j-1].Timestamp; j-- {
				result[j], result[j-1] = result[j-1], result[j]
			}
		}
	}

	return result
}

func calculateAvgSamplePair(data []SamplePair, start, end int) (float64, float64) {
	if start >= end {
		return float64(data[start].Timestamp.Unix()), float64(data[start].Value)
	}

	sumX := float64(0)
	sumY := float64(0)
	count := end - start

	for i := start; i < end; i++ {
		sumX += float64(data[i].Timestamp.Unix())
		sumY += float64(data[i].Value)
	}

	return sumX / float64(count), sumY / float64(count)
}

func LTTB(data []Point, threshold int) []Point {
	return AdaptiveLTTB(data, threshold)
}

func LTTBWithExtremes(data []Point, threshold int) []Point {
	if len(data) <= threshold || threshold <= 2 {
		return data
	}

	extremes := findExtremeIndices(data)
	globalMaxIdx, globalMinIdx := findGlobalExtremes(data)

	extremes[globalMaxIdx] = true
	extremes[globalMinIdx] = true

	sampled := make([]Point, 0, threshold+len(extremes))
	sampled = append(sampled, data[0])

	extremeCount := 0
	for i := 1; i < len(data)-1; i++ {
		if extremes[i] {
			extremeCount++
		}
	}

	adjustedThreshold := threshold - extremeCount - 2
	if adjustedThreshold < 2 {
		adjustedThreshold = 2
	}

	bucketSize := float64(len(data)-2) / float64(adjustedThreshold)

	for i := 0; i < adjustedThreshold; i++ {
		rangeStart := int(math.Floor(float64(i)*bucketSize)) + 1
		rangeEnd := int(math.Floor(float64(i+1)*bucketSize)) + 1
		if rangeEnd > len(data)-1 {
			rangeEnd = len(data) - 1
		}

		avgRangeStart := int(math.Floor(float64(i+1)*bucketSize)) + 1
		avgRangeEnd := int(math.Floor(float64(i+2)*bucketSize)) + 1
		if avgRangeEnd > len(data)-1 {
			avgRangeEnd = len(data) - 1
		}

		avgX, avgY := calculateAvg(data, avgRangeStart, avgRangeEnd)

		pointA := sampled[len(sampled)-1]
		ax := pointA.X()
		ay := pointA.Value

		hasExtreme := false
		extremeMaxIdx := rangeStart
		extremeMinIdx := rangeStart
		maxVal := data[rangeStart].Value
		minVal := data[rangeStart].Value

		for j := rangeStart; j < rangeEnd; j++ {
			val := data[j].Value
			if extremes[j] {
				hasExtreme = true
				if val > maxVal {
					maxVal = val
					extremeMaxIdx = j
				}
				if val < minVal {
					minVal = val
					extremeMinIdx = j
				}
			}
		}

		if hasExtreme {
			if extremeMaxIdx != extremeMinIdx {
				if extremeMaxIdx < extremeMinIdx {
					sampled = append(sampled, data[extremeMaxIdx])
					sampled = append(sampled, data[extremeMinIdx])
				} else {
					sampled = append(sampled, data[extremeMinIdx])
					sampled = append(sampled, data[extremeMaxIdx])
				}
				continue
			} else {
				sampled = append(sampled, data[extremeMaxIdx])
				continue
			}
		}

		maxArea := float64(-1)
		maxAreaIndex := rangeStart

		for j := rangeStart; j < rangeEnd; j++ {
			cx := data[j].X()
			cy := data[j].Value

			area := triangleArea(ax, ay, avgX, avgY, cx, cy)
			if area > maxArea {
				maxArea = area
				maxAreaIndex = j
			}
		}

		sampled = append(sampled, data[maxAreaIndex])
	}

	sampled = append(sampled, data[len(data)-1])

	sampled = deduplicateAndSort(sampled)

	return sampled
}

func findExtremeIndices(data []Point) map[int]bool {
	extremes := make(map[int]bool)
	n := len(data)

	if n < 3 {
		return extremes
	}

	for i := 1; i < n-1; i++ {
		curr := data[i].Value
		prev := data[i-1].Value
		next := data[i+1].Value

		if (curr > prev && curr > next) || (curr < prev && curr < next) {
			extremes[i] = true
		}
	}

	windowSize := 5
	for i := windowSize; i < n-windowSize; i++ {
		curr := data[i].Value
		isLocalMax := true
		isLocalMin := true

		for j := i - windowSize; j <= i+windowSize; j++ {
			if j == i {
				continue
			}
			val := data[j].Value
			if val >= curr {
				isLocalMax = false
			}
			if val <= curr {
				isLocalMin = false
			}
		}

		if isLocalMax || isLocalMin {
			extremes[i] = true
		}
	}

	return extremes
}

func findGlobalExtremes(data []Point) (maxIdx, minIdx int) {
	if len(data) == 0 {
		return 0, 0
	}

	maxVal := data[0].Value
	minVal := data[0].Value
	maxIdx = 0
	minIdx = 0

	for i := 1; i < len(data); i++ {
		val := data[i].Value
		if val > maxVal {
			maxVal = val
			maxIdx = i
		}
		if val < minVal {
			minVal = val
			minIdx = i
		}
	}

	return maxIdx, minIdx
}

func deduplicateAndSort(data []Point) []Point {
	if len(data) < 2 {
		return data
	}

	seen := make(map[time.Time]bool)
	result := make([]Point, 0, len(data))

	for _, p := range data {
		if !seen[p.Timestamp] {
			seen[p.Timestamp] = true
			result = append(result, p)
		}
	}

	for i := 1; i < len(result); i++ {
		if result[i].Timestamp.Before(result[i-1].Timestamp) {
			for j := i; j > 0 && result[j].Timestamp.Before(result[j-1].Timestamp); j-- {
				result[j], result[j-1] = result[j-1], result[j]
			}
		}
	}

	return result
}

func calculateAvg(data []Point, start, end int) (float64, float64) {
	if start >= end {
		return data[start].X(), data[start].Value
	}

	sumX := float64(0)
	sumY := float64(0)
	count := end - start

	for i := start; i < end; i++ {
		sumX += data[i].X()
		sumY += data[i].Value
	}

	return sumX / float64(count), sumY / float64(count)
}

func triangleArea(ax, ay, bx, by, cx, cy float64) float64 {
	return math.Abs((ax*(by-cy) + bx*(cy-ay) + cx*(ay-by)) / 2.0)
}

func AdaptiveLTTB(data []Point, threshold int) []Point {
	if len(data) <= threshold || threshold <= 2 {
		return data
	}

	changeRates := calculateChangeRates(data)

	extremes := findExtremeIndices(data)
	globalMaxIdx, globalMinIdx := findGlobalExtremes(data)

	extremes[globalMaxIdx] = true
	extremes[globalMinIdx] = true

	highChangeIndices := findHighChangeIndices(changeRates, 0.7)
	for idx := range highChangeIndices {
		extremes[idx] = true
	}

	avgBucketSize := float64(len(data)-2) / float64(threshold-2)

	sampled := make([]Point, 0, threshold*2)
	sampled = append(sampled, data[0])

	currentPos := 1

	for currentPos < len(data)-1 {
		remainingPoints := len(data) - 1 - currentPos
		remainingBuckets := threshold - len(sampled) - 1

		if remainingBuckets <= 0 {
			break
		}

		localChange := calculateLocalChangeRate(changeRates, currentPos, avgBucketSize)
		adaptiveFactor := calculateAdaptiveFactor(localChange)

		bucketSize := avgBucketSize / adaptiveFactor
		bucketSize = math.Max(1.0, math.Min(bucketSize, float64(remainingPoints/remainingBuckets)*2))

		rangeEnd := currentPos + int(bucketSize)
		if rangeEnd > len(data)-1 {
			rangeEnd = len(data) - 1
		}

		hasExtreme := false
		extremeMaxIdx := currentPos
		extremeMinIdx := currentPos
		maxVal := data[currentPos].Value
		minVal := data[currentPos].Value

		for j := currentPos; j < rangeEnd; j++ {
			val := data[j].Value
			if extremes[j] {
				hasExtreme = true
				if val > maxVal {
					maxVal = val
					extremeMaxIdx = j
				}
				if val < minVal {
					minVal = val
					extremeMinIdx = j
				}
			}
		}

		if hasExtreme {
			if extremeMaxIdx != extremeMinIdx {
				if extremeMaxIdx < extremeMinIdx {
					sampled = append(sampled, data[extremeMaxIdx])
					sampled = append(sampled, data[extremeMinIdx])
					currentPos = extremeMinIdx + 1
				} else {
					sampled = append(sampled, data[extremeMinIdx])
					sampled = append(sampled, data[extremeMaxIdx])
					currentPos = extremeMaxIdx + 1
				}
			} else {
				sampled = append(sampled, data[extremeMaxIdx])
				currentPos = extremeMaxIdx + 1
			}
			continue
		}

		avgRangeStart := rangeEnd
		avgRangeEnd := avgRangeStart + int(avgBucketSize)
		if avgRangeEnd > len(data)-1 {
			avgRangeEnd = len(data) - 1
		}

		avgX, avgY := calculateAvg(data, avgRangeStart, avgRangeEnd)

		pointA := sampled[len(sampled)-1]
		ax := pointA.X()
		ay := pointA.Value

		maxArea := float64(-1)
		maxAreaIndex := currentPos

		for j := currentPos; j < rangeEnd; j++ {
			cx := data[j].X()
			cy := data[j].Value

			area := triangleArea(ax, ay, avgX, avgY, cx, cy)
			if area > maxArea {
				maxArea = area
				maxAreaIndex = j
			}
		}

		sampled = append(sampled, data[maxAreaIndex])
		currentPos = maxAreaIndex + 1
	}

	if len(sampled) == 0 || sampled[len(sampled)-1].Timestamp != data[len(data)-1].Timestamp {
		sampled = append(sampled, data[len(data)-1])
	}

	sampled = deduplicateAndSort(sampled)

	return sampled
}

func calculateChangeRates(data []Point) []float64 {
	if len(data) < 2 {
		return make([]float64, len(data))
	}

	changeRates := make([]float64, len(data))
	changeRates[0] = 0

	for i := 1; i < len(data); i++ {
		currVal := data[i].Value
		prevVal := data[i-1].Value

		currTime := data[i].X()
		prevTime := data[i-1].X()

		timeDiff := currTime - prevTime
		if timeDiff > 0 {
			changeRates[i] = math.Abs(currVal-prevVal) / timeDiff
		}
	}

	return normalizeChangeRates(changeRates)
}

func CalculateTargetPoints(start, end time.Time, granularity string) (int, error) {
	duration := end.Sub(start)

	var step time.Duration
	switch granularity {
	case "5m":
		step = 5 * time.Minute
	case "1h":
		step = time.Hour
	case "1d":
		step = 24 * time.Hour
	default:
		return 0, nil
	}

	targetPoints := int(duration / step)
	if targetPoints < 100 {
		return 100, nil
	}
	if targetPoints > 10000 {
		return 10000, nil
	}
	return targetPoints, nil
}
