import numpy as np
from dataclasses import dataclass, field
from typing import List, Dict, Optional, Tuple, Callable, Union
from enum import Enum
from scipy import optimize, interpolate, signal, stats
from scipy.fft import fft, fftfreq, ifft


class FittingMethod(Enum):
    """拟合方法枚举"""
    POLYNOMIAL = "polynomial"
    FOURIER = "fourier"
    SPLINE = "spline"
    EXPONENTIAL = "exponential"
    POWER_LAW = "power_law"
    LINEAR_REGRESSION = "linear"
    MULTIVARIATE = "multivariate"


class ForecastModel(Enum):
    """预测模型枚举"""
    ARIMA = "arima"
    EXPONENTIAL_SMOOTHING = "exponential_smoothing"
    TREND_EXTRAPOLATION = "trend_extrapolation"
    FOURIER_EXTRAPOLATION = "fourier_extrapolation"


@dataclass
class DeviationData:
    """偏差数据容器"""
    time: np.ndarray
    deviation: np.ndarray
    reference: Optional[np.ndarray] = None
    uncertainty: Optional[np.ndarray] = None
    body_name: str = ""
    element_type: str = ""


@dataclass
class FittingResult:
    """拟合结果容器"""
    method: FittingMethod
    coefficients: np.ndarray
    residuals: np.ndarray
    rmse: float
    r_squared: float
    model: Callable[[np.ndarray], np.ndarray]
    metadata: Dict = field(default_factory=dict)


@dataclass
class ForecastResult:
    """预测结果容器"""
    time: np.ndarray
    forecast: np.ndarray
    confidence_lower: np.ndarray
    confidence_upper: np.ndarray
    model: ForecastModel
    parameters: Dict = field(default_factory=dict)


class DeviationAnalyzer:
    """偏差分析与拟合器"""
    
    def __init__(self):
        self.deviations: Dict[str, DeviationData] = {}
        self.fitting_results: Dict[str, FittingResult] = {}
        self.forecasts: Dict[str, ForecastResult] = {}
    
    def add_deviation_data(
        self,
        key: str,
        time: np.ndarray,
        deviation: np.ndarray,
        reference: np.ndarray = None,
        uncertainty: np.ndarray = None,
        body_name: str = "",
        element_type: str = ""
    ):
        """添加偏差数据"""
        self.deviations[key] = DeviationData(
            time=np.asarray(time),
            deviation=np.asarray(deviation),
            reference=reference,
            uncertainty=uncertainty,
            body_name=body_name,
            element_type=element_type
        )
    
    def remove_outliers(
        self,
        data: DeviationData,
        method: str = "iqr",
        threshold: float = 1.5
    ) -> DeviationData:
        """去除异常值"""
        y = data.deviation
        
        if method == "iqr":
            q1, q3 = np.percentile(y, [25, 75])
            iqr = q3 - q1
            lower = q1 - threshold * iqr
            upper = q3 + threshold * iqr
            mask = (y >= lower) & (y <= upper)
        elif method == "zscore":
            z = np.abs((y - np.mean(y)) / np.std(y))
            mask = z < threshold
        elif method == "median":
            med = np.median(y)
            mad = np.median(np.abs(y - med))
            mask = np.abs(y - med) < threshold * mad
        else:
            return data
        
        return DeviationData(
            time=data.time[mask],
            deviation=data.deviation[mask],
            reference=data.reference[mask] if data.reference is not None else None,
            uncertainty=data.uncertainty[mask] if data.uncertainty is not None else None,
            body_name=data.body_name,
            element_type=data.element_type
        )
    
    def smooth_data(
        self,
        data: DeviationData,
        method: str = "savgol",
        window_size: int = 11,
        poly_order: int = 3
    ) -> DeviationData:
        """数据平滑处理"""
        y = data.deviation
        
        if method == "savgol":
            smoothed = signal.savgol_filter(y, window_size, poly_order)
        elif method == "moving_average":
            kernel = np.ones(window_size) / window_size
            smoothed = np.convolve(y, kernel, mode='same')
        elif method == "gaussian":
            sigma = window_size / 4
            x = np.linspace(-window_size//2, window_size//2, window_size)
            kernel = np.exp(-x**2 / (2 * sigma**2))
            kernel /= kernel.sum()
            smoothed = np.convolve(y, kernel, mode='same')
        elif method == "lowess":
            try:
                from statsmodels.nonparametric.smoothers_lowess import lowess
                smoothed = lowess(y, data.time, frac=0.1, return_sorted=False)
            except ImportError:
                smoothed = signal.savgol_filter(y, window_size, poly_order)
        else:
            smoothed = y
        
        return DeviationData(
            time=data.time,
            deviation=smoothed,
            reference=data.reference,
            uncertainty=data.uncertainty,
            body_name=data.body_name,
            element_type=data.element_type
        )
    
    def fit_polynomial(
        self,
        data: DeviationData,
        degree: int = 3
    ) -> FittingResult:
        """多项式拟合（带时间归一化以避免精度丢失）"""
        x_orig = np.asarray(data.time, dtype=np.float64)
        y = np.asarray(data.deviation, dtype=np.float64)
        
        x_mean = np.mean(x_orig)
        x_std = np.std(x_orig) if np.std(x_orig) > 0 else 1.0
        x_norm = (x_orig - x_mean) / x_std
        
        coeffs, cov = np.polyfit(x_norm, y, degree, cov=True)
        poly_norm = np.poly1d(coeffs)
        
        def model(t):
            t = np.asarray(t, dtype=np.float64)
            t_norm = (t - x_mean) / x_std
            return poly_norm(t_norm)
        
        y_pred = model(x_orig)
        residuals = y - y_pred
        rmse = np.sqrt(np.mean(residuals ** 2))
        ss_res = np.sum(residuals ** 2)
        ss_tot = np.sum((y - np.mean(y)) ** 2)
        r_squared = 1 - (ss_res / ss_tot) if ss_tot != 0 else 0
        
        return FittingResult(
            method=FittingMethod.POLYNOMIAL,
            coefficients=coeffs,
            residuals=residuals,
            rmse=rmse,
            r_squared=r_squared,
            model=model,
            metadata={
                'degree': degree,
                'covariance': cov,
                'x_mean': x_mean,
                'x_std': x_std
            }
        )
    
    def fit_fourier(
        self,
        data: DeviationData,
        num_harmonics: int = 10
    ) -> FittingResult:
        """傅里叶级数拟合"""
        x, y = data.time, data.deviation
        n = len(x)
        
        y_fft = fft(y)
        freqs = fftfreq(n, d=x[1] - x[0] if len(x) > 1 else 1)
        
        mask = np.zeros(n, dtype=bool)
        mask[0] = True
        mask[1:num_harmonics+1] = True
        mask[-num_harmonics:] = True
        
        y_fft_filtered = np.zeros_like(y_fft)
        y_fft_filtered[mask] = y_fft[mask]
        y_reconstructed = ifft(y_fft_filtered).real
        
        residuals = y - y_reconstructed
        rmse = np.sqrt(np.mean(residuals ** 2))
        ss_res = np.sum(residuals ** 2)
        ss_tot = np.sum((y - np.mean(y)) ** 2)
        r_squared = 1 - (ss_res / ss_tot) if ss_tot != 0 else 0
        
        def model(t):
            t_idx = np.searchsorted(x, t, side='right') - 1
            t_idx = np.clip(t_idx, 0, n - 1)
            return y_reconstructed[t_idx]
        
        dominant_freqs = freqs[mask][np.argsort(np.abs(y_fft[mask]))[::-1]]
        
        return FittingResult(
            method=FittingMethod.FOURIER,
            coefficients=np.abs(y_fft[mask]),
            residuals=residuals,
            rmse=rmse,
            r_squared=r_squared,
            model=model,
            metadata={
                'num_harmonics': num_harmonics,
                'frequencies': freqs,
                'fft_values': y_fft,
                'dominant_frequencies': dominant_freqs[:num_harmonics]
            }
        )
    
    def fit_spline(
        self,
        data: DeviationData,
        degree: int = 3,
        smoothing: float = 0.0
    ) -> FittingResult:
        """样条插值拟合"""
        x, y = data.time, data.deviation
        
        tck = interpolate.splrep(x, y, k=degree, s=smoothing)
        
        y_pred = interpolate.splev(x, tck)
        residuals = y - y_pred
        rmse = np.sqrt(np.mean(residuals ** 2))
        ss_res = np.sum(residuals ** 2)
        ss_tot = np.sum((y - np.mean(y)) ** 2)
        r_squared = 1 - (ss_res / ss_tot) if ss_tot != 0 else 0
        
        def model(t):
            return interpolate.splev(t, tck)
        
        return FittingResult(
            method=FittingMethod.SPLINE,
            coefficients=np.array(tck[1]),
            residuals=residuals,
            rmse=rmse,
            r_squared=r_squared,
            model=model,
            metadata={'tck': tck, 'degree': degree, 'smoothing': smoothing}
        )
    
    def fit_exponential(
        self,
        data: DeviationData
    ) -> FittingResult:
        """指数拟合: y = a * exp(b * x) + c（带时间归一化）"""
        x_orig = np.asarray(data.time, dtype=np.float64)
        y = np.asarray(data.deviation, dtype=np.float64)
        
        x_mean = np.mean(x_orig)
        x_std = np.std(x_orig) if np.std(x_orig) > 0 else 1.0
        x_norm = (x_orig - x_mean) / x_std
        
        def exp_model(t_norm, a, b, c):
            return a * np.exp(b * t_norm) + c
        
        try:
            y_range = np.max(y) - np.min(y) if np.max(y) != np.min(y) else 1.0
            p0 = [y_range, 0.0, np.mean(y)]
            coeffs, cov = optimize.curve_fit(exp_model, x_norm, y, p0=p0, maxfev=10000)
        except (RuntimeError, ValueError):
            coeffs = np.array([0.0, 0.0, np.mean(y)])
            cov = np.eye(3)
        
        def model(t):
            t = np.asarray(t, dtype=np.float64)
            t_norm = (t - x_mean) / x_std
            return exp_model(t_norm, *coeffs)
        
        y_pred = model(x_orig)
        residuals = y - y_pred
        rmse = np.sqrt(np.mean(residuals ** 2))
        ss_res = np.sum(residuals ** 2)
        ss_tot = np.sum((y - np.mean(y)) ** 2)
        r_squared = 1 - (ss_res / ss_tot) if ss_tot != 0 else 0
        
        return FittingResult(
            method=FittingMethod.EXPONENTIAL,
            coefficients=coeffs,
            residuals=residuals,
            rmse=rmse,
            r_squared=r_squared,
            model=model,
            metadata={
                'covariance': cov,
                'x_mean': x_mean,
                'x_std': x_std
            }
        )
    
    def fit_power_law(
        self,
        data: DeviationData
    ) -> FittingResult:
        """幂律拟合: y = a * x^b + c（带时间归一化）"""
        x_orig = np.asarray(data.time, dtype=np.float64)
        y = np.asarray(data.deviation, dtype=np.float64)
        
        x_mean = np.mean(x_orig)
        x_std = np.std(x_orig) if np.std(x_orig) > 0 else 1.0
        x_norm = (x_orig - x_mean) / x_std
        
        x_norm_shifted = x_norm - np.min(x_norm) + 1.0
        
        def power_model(t_shifted, a, b, c):
            return a * np.power(t_shifted, b) + c
        
        try:
            mask = x_norm_shifted > 0
            p0 = [y[mask][0] / (x_norm_shifted[mask][0] ** 0.5) if len(y[mask]) > 0 else 1.0, 0.5, np.min(y)]
            coeffs, cov = optimize.curve_fit(power_model, x_norm_shifted, y, p0=p0, maxfev=10000)
        except (RuntimeError, ValueError):
            coeffs = np.array([0.0, 0.0, np.mean(y)])
            cov = np.eye(3)
        
        def model(t):
            t = np.asarray(t, dtype=np.float64)
            t_norm = (t - x_mean) / x_std
            t_shifted = t_norm - np.min(x_norm) + 1.0
            return power_model(t_shifted, *coeffs)
        
        y_pred = model(x_orig)
        residuals = y - y_pred
        rmse = np.sqrt(np.mean(residuals ** 2))
        ss_res = np.sum(residuals ** 2)
        ss_tot = np.sum((y - np.mean(y)) ** 2)
        r_squared = 1 - (ss_res / ss_tot) if ss_tot != 0 else 0
        
        return FittingResult(
            method=FittingMethod.POWER_LAW,
            coefficients=coeffs,
            residuals=residuals,
            rmse=rmse,
            r_squared=r_squared,
            model=model,
            metadata={
                'covariance': cov,
                'x_mean': x_mean,
                'x_std': x_std,
                'x_min_norm': np.min(x_norm)
            }
        )
    
    def auto_fit(
        self,
        data_key: str,
        preprocess: bool = True
    ) -> Dict[FittingMethod, FittingResult]:
        """自动尝试多种拟合方法，返回全部结果"""
        if data_key not in self.deviations:
            raise ValueError(f"未找到偏差数据: {data_key}")
        
        data = self.deviations[data_key]
        
        if preprocess:
            data = self.remove_outliers(data)
            data = self.smooth_data(data)
        
        results = {}
        
        for degree in [1, 2, 3, 4, 5]:
            result = self.fit_polynomial(data, degree=degree)
            results[f"polynomial_deg{degree}"] = result
        
        results['fourier'] = self.fit_fourier(data)
        results['spline'] = self.fit_spline(data)
        
        try:
            results['exponential'] = self.fit_exponential(data)
        except Exception:
            pass
        
        try:
            results['power_law'] = self.fit_power_law(data)
        except Exception:
            pass
        
        return results
    
    def select_best_fit(
        self,
        results: Dict[str, FittingResult],
        criterion: str = 'r_squared'
    ) -> Tuple[str, FittingResult]:
        """根据评价指标选择最佳拟合"""
        best_key = None
        best_result = None
        
        for key, result in results.items():
            if criterion == 'r_squared':
                if best_result is None or result.r_squared > best_result.r_squared:
                    best_key = key
                    best_result = result
            elif criterion == 'rmse':
                if best_result is None or result.rmse < best_result.rmse:
                    best_key = key
                    best_result = result
        
        return best_key, best_result
    
    def forecast_trend(
        self,
        data: DeviationData,
        forecast_time: np.ndarray,
        method: ForecastModel = ForecastModel.TREND_EXTRAPOLATION,
        confidence_level: float = 0.95
    ) -> ForecastResult:
        """基于拟合模型进行预测（带时间归一化）"""
        x_orig = np.asarray(data.time, dtype=np.float64)
        y = np.asarray(data.deviation, dtype=np.float64)
        
        fit_result = self.fit_polynomial(data, degree=3)
        
        x_mean = fit_result.metadata.get('x_mean', np.mean(x_orig))
        x_std = fit_result.metadata.get('x_std', np.std(x_orig) if np.std(x_orig) > 0 else 1.0)
        
        forecast = fit_result.model(forecast_time)
        
        n = len(y)
        p = len(fit_result.coefficients)
        dof = max(n - p, 1)
        
        mse = np.sum(fit_result.residuals ** 2) / dof
        ss_xx = np.sum(((x_orig - x_mean) / x_std) ** 2)
        
        prediction_errors = []
        for t in forecast_time:
            t_norm = (t - x_mean) / x_std
            if ss_xx == 0:
                error = np.sqrt(mse)
            else:
                error = np.sqrt(mse * (1 + 1/n + (t_norm)**2 / ss_xx))
            prediction_errors.append(error)
        
        prediction_errors = np.array(prediction_errors)
        t_stat = stats.t.ppf((1 + confidence_level) / 2, dof) if dof > 1 else stats.norm.ppf((1 + confidence_level) / 2)
        margin = t_stat * prediction_errors
        
        return ForecastResult(
            time=forecast_time,
            forecast=forecast,
            confidence_lower=forecast - margin,
            confidence_upper=forecast + margin,
            model=method,
            parameters={
                'degree': 3,
                'confidence_level': confidence_level,
                'x_mean': x_mean,
                'x_std': x_std
            }
        )
    
    def forecast_fourier(
        self,
        data: DeviationData,
        forecast_time: np.ndarray,
        num_harmonics: int = 20,
        confidence_level: float = 0.95
    ) -> ForecastResult:
        """基于傅里叶分析的周期性预测（带时间归一化）"""
        x_orig = np.asarray(data.time, dtype=np.float64)
        y = np.asarray(data.deviation, dtype=np.float64)
        n = len(x_orig)
        
        if n < 4:
            forecast = np.full_like(forecast_time, np.mean(y), dtype=float)
            return ForecastResult(
                time=forecast_time,
                forecast=forecast,
                confidence_lower=forecast,
                confidence_upper=forecast,
                model=ForecastModel.FOURIER_EXTRAPOLATION,
                parameters={'num_harmonics': num_harmonics, 'confidence_level': confidence_level, 'note': '数据不足'}
            )
        
        dt = np.median(np.diff(x_orig)) if n > 1 else 1.0
        if dt == 0:
            dt = 1.0
        
        x_norm = np.arange(n, dtype=np.float64)
        
        y_fft = fft(y - np.mean(y))
        freqs = fftfreq(n, d=1.0)
        
        amplitude = np.abs(y_fft) / n
        phase = np.angle(y_fft)
        
        num_harmonics = min(num_harmonics, n // 2)
        top_indices = np.argsort(amplitude)[-num_harmonics:]
        
        fit_result = self.fit_fourier(data, num_harmonics=num_harmonics)
        
        forecast_norm = (forecast_time - x_orig[0]) / dt
        forecast = np.full_like(forecast_time, np.mean(y), dtype=float)
        
        for idx in top_indices:
            if idx == 0:
                continue
            freq = freqs[idx]
            amp = amplitude[idx]
            ph = phase[idx]
            forecast += 2 * amp * np.cos(2 * np.pi * freq * forecast_norm + ph)
        
        residuals = y - fit_result.model(x_orig)
        sigma = np.std(residuals) if len(residuals) > 1 else 0.0
        z_score = stats.norm.ppf((1 + confidence_level) / 2)
        margin = z_score * sigma
        
        return ForecastResult(
            time=forecast_time,
            forecast=forecast,
            confidence_lower=forecast - margin,
            confidence_upper=forecast + margin,
            model=ForecastModel.FOURIER_EXTRAPOLATION,
            parameters={
                'num_harmonics': num_harmonics,
                'confidence_level': confidence_level,
                'dt': dt,
                'x0': x_orig[0]
            }
        )
    
    def calculate_statistics(
        self,
        data: DeviationData
    ) -> Dict:
        """计算偏差数据的统计特征"""
        y = data.deviation
        
        return {
            'mean': np.mean(y),
            'median': np.median(y),
            'std': np.std(y),
            'var': np.var(y),
            'min': np.min(y),
            'max': np.max(y),
            'range': np.max(y) - np.min(y),
            'skewness': stats.skew(y),
            'kurtosis': stats.kurtosis(y),
            'rmse': np.sqrt(np.mean(y ** 2)),
            'mae': np.mean(np.abs(y)),
            'count': len(y)
        }
    
    def analyze_periodicity(
        self,
        data: DeviationData
    ) -> Dict:
        """分析数据的周期性特征"""
        x, y = data.time, data.deviation
        n = len(x)
        
        if n < 4:
            return {'has_periodicity': False, 'message': '数据点不足'}
        
        dt = x[1] - x[0] if len(x) > 1 else 1
        
        y_fft = fft(y - np.mean(y))
        freqs = fftfreq(n, d=dt)
        power = np.abs(y_fft) ** 2
        
        positive_mask = freqs > 0
        freqs_pos = freqs[positive_mask]
        power_pos = power[positive_mask]
        
        if len(power_pos) == 0:
            return {'has_periodicity': False, 'message': '无法分析频率'}
        
        peak_idx = np.argmax(power_pos)
        dominant_freq = freqs_pos[peak_idx]
        dominant_period = 1 / dominant_freq if dominant_freq > 0 else np.inf
        
        total_power = np.sum(power_pos)
        peak_power_ratio = power_pos[peak_idx] / total_power if total_power > 0 else 0
        
        f, pxx = signal.periodogram(y - np.mean(y), fs=1/dt)
        lomb_power = None
        try:
            f_lomb, pxx_lomb = signal.lombscargle(x, y - np.mean(y), f * 2 * np.pi, normalize=True)
            lomb_power = pxx_lomb
        except Exception:
            pass
        
        return {
            'has_periodicity': peak_power_ratio > 0.1,
            'dominant_frequency': dominant_freq,
            'dominant_period': dominant_period,
            'peak_power_ratio': peak_power_ratio,
            'fft_frequencies': freqs,
            'fft_power': power,
            'periodogram': {'frequencies': f, 'power': pxx},
            'lomb_scargle': lomb_power is not None,
            'lomb_power': lomb_power
        }
