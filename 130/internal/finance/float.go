package finance

const Epsilon = 1e-9

func AlmostEqual(a, b float64) bool {
	if a == b {
		return true
	}
	diff := abs(a - b)
	if diff < Epsilon {
		return true
	}
	return diff/(abs(a)+abs(b)) < Epsilon
}

func AlmostZero(x float64) bool {
	return abs(x) < Epsilon
}

func GreaterThan(a, b float64) bool {
	return a > b && !AlmostEqual(a, b)
}

func LessThan(a, b float64) bool {
	return a < b && !AlmostEqual(a, b)
}

func GreaterOrEqual(a, b float64) bool {
	return a > b || AlmostEqual(a, b)
}

func LessOrEqual(a, b float64) bool {
	return a < b || AlmostEqual(a, b)
}

func IsPositive(x float64) bool {
	return x > Epsilon
}

func IsNegative(x float64) bool {
	return x < -Epsilon
}

func Round(x float64, decimals int) float64 {
	factor := pow10(decimals)
	return float64(int64(x*factor+0.5)) / factor
}

func abs(x float64) float64 {
	if x < 0 {
		return -x
	}
	return x
}

func pow10(n int) float64 {
	result := 1.0
	for i := 0; i < n; i++ {
		result *= 10
	}
	return result
}
