package downsampler

import (
	"math"
	"testing"
	"time"

	"github.com/prometheus/common/model"
)

func TestLTTBWithExtremes_PeakPreservation(t *testing.T) {
	data := generateTestDataWithPeak(1000)

	originalMax := findMaxValueSamplePair(data)
	originalMin := findMinValueSamplePair(data)

	sampled := LTTBSamplePair(data, 100)

	sampledMax := findMaxValueSamplePair(sampled)
	sampledMin := findMinValueSamplePair(sampled)

	if math.Abs(float64(sampledMax-originalMax)) > 0.001 {
		t.Errorf("Max value not preserved. Original: %v, Sampled: %v", originalMax, sampledMax)
	}

	if math.Abs(float64(sampledMin-originalMin)) > 0.001 {
		t.Errorf("Min value not preserved. Original: %v, Sampled: %v", originalMin, sampledMin)
	}

	t.Logf("Original data points: %d", len(data))
	t.Logf("Sampled data points: %d", len(sampled))
	t.Logf("Original max: %v, Sampled max: %v", originalMax, sampledMax)
	t.Logf("Original min: %v, Sampled min: %v", originalMin, sampledMin)
}

func TestLTTBWithExtremes_LocalExtremes(t *testing.T) {
	data := generateTestDataWithLocalExtremes(1000)

	peaks := []int{100, 300, 500, 700, 900}
	originalPeakValues := make([]model.SampleValue, len(peaks))
	for i, peakIdx := range peaks {
		originalPeakValues[i] = data[peakIdx].Value
	}

	sampled := LTTBSamplePair(data, 100)

	sampledValues := make(map[model.Time]model.SampleValue)
	for _, p := range sampled {
		sampledValues[p.Timestamp] = p.Value
	}

	preservedCount := 0
	for i, peakIdx := range peaks {
		peakTime := data[peakIdx].Timestamp
		if val, ok := sampledValues[peakTime]; ok {
			if math.Abs(float64(val-originalPeakValues[i])) < 0.001 {
				preservedCount++
			}
		}
	}

	if preservedCount < len(peaks)/2 {
		t.Errorf("Too few local peaks preserved. Expected at least %d, got %d", len(peaks)/2, preservedCount)
	}

	t.Logf("Local peaks preserved: %d/%d", preservedCount, len(peaks))
}

func TestLTTBWithExtremes_EdgeCases(t *testing.T) {
	t.Run("SmallDataset", func(t *testing.T) {
		data := generateTestDataWithPeak(10)
		sampled := LTTBSamplePair(data, 5)
		if len(sampled) != len(data) {
			t.Errorf("Expected no downsampling for small dataset, got %d points", len(sampled))
		}
	})

	t.Run("SinglePoint", func(t *testing.T) {
		data := []SamplePair{{Timestamp: 1000, Value: 42}}
		sampled := LTTBSamplePair(data, 100)
		if len(sampled) != 1 {
			t.Errorf("Expected 1 point, got %d", len(sampled))
		}
	})

	t.Run("ThresholdTooSmall", func(t *testing.T) {
		data := generateTestDataWithPeak(100)
		sampled := LTTBSamplePair(data, 2)
		if len(sampled) != 2 {
			t.Errorf("Expected 2 points (first and last), got %d", len(sampled))
		}
	})
}

func TestLTTBWithExtremes_FirstAndLastPreserved(t *testing.T) {
	data := generateTestDataWithPeak(1000)
	sampled := LTTBSamplePair(data, 100)

	if sampled[0].Timestamp != data[0].Timestamp || sampled[0].Value != data[0].Value {
		t.Error("First point not preserved")
	}

	lastIdx := len(data) - 1
	lastSampledIdx := len(sampled) - 1
	if sampled[lastSampledIdx].Timestamp != data[lastIdx].Timestamp || sampled[lastSampledIdx].Value != data[lastIdx].Value {
		t.Error("Last point not preserved")
	}
}

func TestLTTBWithExtremes_Sorted(t *testing.T) {
	data := generateTestDataWithPeak(1000)
	sampled := LTTBSamplePair(data, 100)

	for i := 1; i < len(sampled); i++ {
		if sampled[i].Timestamp < sampled[i-1].Timestamp {
			t.Errorf("Result not sorted at index %d", i)
		}
	}
}

func BenchmarkLTTBWithExtremes(b *testing.B) {
	data := generateTestDataWithPeak(10000)
	b.ResetTimer()

	for i := 0; i < b.N; i++ {
		LTTBSamplePair(data, 1000)
	}
}

func generateTestDataWithPeak(n int) []SamplePair {
	data := make([]SamplePair, n)
	peakIdx := n / 2

	for i := 0; i < n; i++ {
		var val float64
		if i < peakIdx {
			val = float64(i) / float64(peakIdx) * 50
		} else {
			val = float64(n-i) / float64(n-peakIdx) * 50
		}

		if i == peakIdx {
			val = 100
		}

		data[i] = SamplePair{
			Timestamp: model.TimeFromUnix(int64(i * 60)),
			Value:     model.SampleValue(val),
		}
	}

	return data
}

func generateTestDataWithLocalExtremes(n int) []SamplePair {
	data := make([]SamplePair, n)

	for i := 0; i < n; i++ {
		val := 50 + 30*math.Sin(float64(i)/50*2*math.Pi)
		val += 10 * math.Sin(float64(i)/10*2*math.Pi)

		data[i] = SamplePair{
			Timestamp: model.TimeFromUnix(int64(i * 60)),
			Value:     model.SampleValue(val),
		}
	}

	return data
}

func findMaxValueSamplePair(data []SamplePair) model.SampleValue {
	if len(data) == 0 {
		return 0
	}
	maxVal := data[0].Value
	for _, p := range data {
		if p.Value > maxVal {
			maxVal = p.Value
		}
	}
	return maxVal
}

func findMinValueSamplePair(data []SamplePair) model.SampleValue {
	if len(data) == 0 {
		return 0
	}
	minVal := data[0].Value
	for _, p := range data {
		if p.Value < minVal {
			minVal = p.Value
		}
	}
	return minVal
}

func TestPointTypeLTTB(t *testing.T) {
	data := make([]Point, 1000)
	for i := 0; i < 1000; i++ {
		val := 50 + 30*math.Sin(float64(i)/100*2*math.Pi)
		if i == 500 {
			val = 100
		}
		data[i] = Point{
			Timestamp: time.Unix(int64(i*60), 0),
			Value:     val,
		}
	}

	originalMax := findMaxValuePoint(data)
	originalMin := findMinValuePoint(data)

	sampled := LTTB(data, 100)

	sampledMax := findMaxValuePoint(sampled)
	sampledMin := findMinValuePoint(sampled)

	if math.Abs(sampledMax-originalMax) > 0.001 {
		t.Errorf("Max value not preserved for Point type. Original: %v, Sampled: %v", originalMax, sampledMax)
	}

	if math.Abs(sampledMin-originalMin) > 0.001 {
		t.Errorf("Min value not preserved for Point type. Original: %v, Sampled: %v", originalMin, sampledMin)
	}
}

func findMaxValuePoint(data []Point) float64 {
	if len(data) == 0 {
		return 0
	}
	maxVal := data[0].Value
	for _, p := range data {
		if p.Value > maxVal {
			maxVal = p.Value
		}
	}
	return maxVal
}

func findMinValuePoint(data []Point) float64 {
	if len(data) == 0 {
		return 0
	}
	minVal := data[0].Value
	for _, p := range data {
		if p.Value < minVal {
			minVal = p.Value
		}
	}
	return minVal
}

func TestAdaptiveLTTB_VariableChangeRate(t *testing.T) {
	data := generateVariableChangeRateData(1000)

	originalMax := findMaxValueSamplePair(data)
	originalMin := findMinValueSamplePair(data)

	sampled := LTTBSamplePair(data, 100)

	sampledMax := findMaxValueSamplePair(sampled)
	sampledMin := findMinValueSamplePair(sampled)

	if math.Abs(float64(sampledMax-originalMax)) > 0.001 {
		t.Errorf("Max value not preserved in variable change rate data. Original: %v, Sampled: %v", originalMax, sampledMax)
	}

	if math.Abs(float64(sampledMin-originalMin)) > 0.001 {
		t.Errorf("Min value not preserved in variable change rate data. Original: %v, Sampled: %v", originalMin, sampledMin)
	}

	rapidChangeCount := 0
	for i := 400; i < 600; i++ {
		if i < len(data)-1 {
			if math.Abs(float64(data[i].Value)-float64(data[i+1].Value)) > 1 {
				rapidChangeCount++
			}
		}
	}

	t.Logf("Data points in rapid change region: %d", rapidChangeCount)
	t.Logf("Total sampled points: %d", len(sampled))
}

func TestAdaptiveLTTB_FirstAndLastPreserved(t *testing.T) {
	data := generateVariableChangeRateData(1000)
	sampled := LTTBSamplePair(data, 100)

	if sampled[0].Timestamp != data[0].Timestamp || sampled[0].Value != data[0].Value {
		t.Error("First point not preserved in adaptive LTTB")
	}

	lastIdx := len(data) - 1
	lastSampledIdx := len(sampled) - 1
	if sampled[lastSampledIdx].Timestamp != data[lastIdx].Timestamp || sampled[lastSampledIdx].Value != data[lastIdx].Value {
		t.Error("Last point not preserved in adaptive LTTB")
	}
}

func TestAdaptiveLTTB_Sorted(t *testing.T) {
	data := generateVariableChangeRateData(1000)
	sampled := LTTBSamplePair(data, 100)

	for i := 1; i < len(sampled); i++ {
		if sampled[i].Timestamp < sampled[i-1].Timestamp {
			t.Errorf("Result not sorted at index %d", i)
		}
	}
}

func TestAdaptiveLTTB_PointType(t *testing.T) {
	data := make([]Point, 1000)
	for i := 0; i < 1000; i++ {
		var val float64
		if i < 400 {
			val = 50 + 10*math.Sin(float64(i)/50*2*math.Pi)
		} else if i < 600 {
			val = 50 + 50*math.Sin(float64(i)/5*2*math.Pi)
		} else {
			val = 50 + 10*math.Sin(float64(i)/50*2*math.Pi)
		}
		data[i] = Point{
			Timestamp: time.Unix(int64(i*60), 0),
			Value:     val,
		}
	}

	originalMax := findMaxValuePoint(data)
	originalMin := findMinValuePoint(data)

	sampled := LTTB(data, 100)

	sampledMax := findMaxValuePoint(sampled)
	sampledMin := findMinValuePoint(sampled)

	if math.Abs(sampledMax-originalMax) > 0.001 {
		t.Errorf("Max value not preserved for Point type adaptive. Original: %v, Sampled: %v", originalMax, sampledMax)
	}

	if math.Abs(sampledMin-originalMin) > 0.001 {
		t.Errorf("Min value not preserved for Point type adaptive. Original: %v, Sampled: %v", originalMin, sampledMin)
	}
}

func BenchmarkAdaptiveLTTB(b *testing.B) {
	data := generateVariableChangeRateData(10000)
	b.ResetTimer()

	for i := 0; i < b.N; i++ {
		LTTBSamplePair(data, 1000)
	}
}

func generateVariableChangeRateData(n int) []SamplePair {
	data := make([]SamplePair, n)

	for i := 0; i < n; i++ {
		var val float64
		if i < 400 {
			val = 50 + 10*math.Sin(float64(i)/50*2*math.Pi)
		} else if i < 600 {
			val = 50 + 50*math.Sin(float64(i)/5*2*math.Pi)
		} else {
			val = 50 + 10*math.Sin(float64(i)/50*2*math.Pi)
		}

		data[i] = SamplePair{
			Timestamp: model.TimeFromUnix(int64(i * 60)),
			Value:     model.SampleValue(val),
		}
	}

	return data
}
