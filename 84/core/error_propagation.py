import numpy as np
from dataclasses import dataclass, field
from typing import List, Dict, Optional, Tuple, Any, Callable
from enum import Enum
from scipy import stats


class ErrorSource(Enum):
    """误差来源"""
    NUMERICAL = "numerical"
    OBSERVATION = "observation"
    MODEL = "model"
    PERTURBATION = "perturbation"
    INITIAL_CONDITION = "initial_condition"
    INTEGRATION = "integration"
    UNIT_CONVERSION = "unit_conversion"


class ErrorSeverity(Enum):
    """误差严重程度"""
    NEGLIGIBLE = "negligible"
    MINOR = "minor"
    MODERATE = "moderate"
    SIGNIFICANT = "significant"
    CRITICAL = "critical"


@dataclass
class ErrorContribution:
    """误差贡献"""
    source: ErrorSource
    name: str
    value: float
    relative_contribution: float
    uncertainty: float
    severity: ErrorSeverity
    description: str = ""


@dataclass
class ErrorTraceResult:
    """误差溯源结果"""
    total_error: float
    contributions: List[ErrorContribution]
    dominant_source: ErrorSource
    confidence_interval: Tuple[float, float]
    error_propagation_chain: List[str]
    mitigation_suggestions: List[str]
    timestamp: float = field(default_factory=lambda: np.datetime64('now').astype(float))


@dataclass
class UncertaintyBudget:
    """不确定度预算"""
    parameter_name: str
    nominal_value: float
    absolute_uncertainty: float
    relative_uncertainty: float
    probability_distribution: str = "normal"
    degrees_of_freedom: int = 100
    sensitivity_coefficient: float = 1.0


@dataclass
class ErrorBudget:
    """误差预算"""
    name: str
    uncertainty_components: List[UncertaintyBudget] = field(default_factory=list)
    correlation_matrix: Optional[np.ndarray] = None
    
    def total_uncertainty(self) -> float:
        """计算总不确定度（RSS方法）"""
        total = 0.0
        for uc in self.uncertainty_components:
            total += (uc.sensitivity_coefficient * uc.absolute_uncertainty) ** 2
        
        if self.correlation_matrix is not None:
            n = len(self.uncertainty_components)
            for i in range(n):
                for j in range(i + 1, n):
                    ui = self.uncertainty_components[i]
                    uj = self.uncertainty_components[j]
                    total += 2 * self.correlation_matrix[i, j] * \
                             ui.sensitivity_coefficient * ui.absolute_uncertainty * \
                             uj.sensitivity_coefficient * uj.absolute_uncertainty
        
        return np.sqrt(total)


class ErrorPropagationAnalyzer:
    """误差传播分析器"""
    
    def __init__(self, confidence_level: float = 0.95):
        self.confidence_level = confidence_level
        self.z_score = stats.norm.ppf((1 + confidence_level) / 2)
    
    def analyze_propagation_result(
        self,
        nominal_result: np.ndarray,
        perturbed_results: List[np.ndarray],
        parameter_perturbations: Dict[str, List[float]]
    ) -> ErrorTraceResult:
        """分析传播结果的误差来源"""
        nominal = np.asarray(nominal_result)
        errors = []
        
        for result in perturbed_results:
            result = np.asarray(result)
            error = np.linalg.norm(result - nominal)
            errors.append(error)
        
        total_error = np.mean(errors) if errors else 0.0
        total_std = np.std(errors) if len(errors) > 1 else 0.0
        
        contributions = []
        for param_name, perturbations in parameter_perturbations.items():
            if len(perturbations) < 2:
                continue
            
            perturbation_range = max(perturbations) - min(perturbations)
            param_error = self._estimate_parameter_sensitivity(
                nominal, perturbed_results, perturbations
            )
            
            relative_contribution = param_error / total_error if total_error > 0 else 0.0
            
            severity = self._classify_severity(relative_contribution)
            
            contribution = ErrorContribution(
                source=self._identify_error_source(param_name),
                name=param_name,
                value=param_error,
                relative_contribution=relative_contribution,
                uncertainty=total_std,
                severity=severity,
                description=f"参数 {param_name} 的误差贡献"
            )
            contributions.append(contribution)
        
        contributions.sort(key=lambda c: c.relative_contribution, reverse=True)
        
        dominant_source = contributions[0].source if contributions else ErrorSource.NUMERICAL
        
        confidence_interval = (
            total_error - self.z_score * total_std,
            total_error + self.z_score * total_std
        )
        
        error_chain = self._build_error_chain(contributions)
        suggestions = self._generate_mitigation_suggestions(contributions)
        
        return ErrorTraceResult(
            total_error=total_error,
            contributions=contributions,
            dominant_source=dominant_source,
            confidence_interval=confidence_interval,
            error_propagation_chain=error_chain,
            mitigation_suggestions=suggestions
        )
    
    def monte_carlo_propagation(
        self,
        func: Callable[[Dict[str, float]], np.ndarray],
        nominal_parameters: Dict[str, float],
        parameter_uncertainties: Dict[str, float],
        num_samples: int = 1000,
        correlation_matrix: Optional[np.ndarray] = None
    ) -> Tuple[np.ndarray, np.ndarray, Dict[str, float]]:
        """蒙特卡洛误差传播分析
        
        Args:
            func: 计算函数
            nominal_parameters: 名义参数值
            parameter_uncertainties: 参数不确定度
            num_samples: 采样数
            correlation_matrix: 相关矩阵
            
        Returns:
            结果均值, 结果标准差, 各参数贡献
        """
        param_names = list(nominal_parameters.keys())
        n_params = len(param_names)
        
        samples = {}
        for name in param_names:
            nominal = nominal_parameters[name]
            sigma = parameter_uncertainties[name]
            samples[name] = np.random.normal(nominal, sigma, num_samples)
        
        if correlation_matrix is not None:
            L = np.linalg.cholesky(correlation_matrix)
            base_samples = np.random.normal(0, 1, (n_params, num_samples))
            correlated_samples = L @ base_samples
            
            for i, name in enumerate(param_names):
                nominal = nominal_parameters[name]
                sigma = parameter_uncertainties[name]
                samples[name] = nominal + sigma * correlated_samples[i]
        
        results = []
        for i in range(num_samples):
            params = {name: samples[name][i] for name in param_names}
            try:
                result = func(params)
                results.append(result)
            except Exception:
                continue
        
        results = np.array(results)
        mean_result = np.mean(results, axis=0)
        std_result = np.std(results, axis=0)
        
        sensitivity_indices = self._compute_sobol_indices(
            func, nominal_parameters, parameter_uncertainties, num_samples // 10
        )
        
        return mean_result, std_result, sensitivity_indices
    
    def _compute_sobol_indices(
        self,
        func: Callable[[Dict[str, float]], float],
        nominal_parameters: Dict[str, float],
        parameter_uncertainties: Dict[str, float],
        num_samples: int = 100
    ) -> Dict[str, float]:
        """计算Sobol一阶敏感性指数"""
        param_names = list(nominal_parameters.keys())
        n_params = len(param_names)
        
        base_samples = {}
        for name in param_names:
            nominal = nominal_parameters[name]
            sigma = parameter_uncertainties[name]
            base_samples[name] = np.random.normal(nominal, sigma, num_samples)
        
        y_base = []
        for i in range(num_samples):
            params = {name: base_samples[name][i] for name in param_names}
            try:
                y_base.append(float(func(params)))
            except Exception:
                y_base.append(0.0)
        
        y_base = np.array(y_base)
        var_total = np.var(y_base) if len(y_base) > 1 else 1.0
        
        sensitivity_indices = {}
        
        for name in param_names:
            y_fixed = []
            other_samples = {n: base_samples[n].copy() for n in param_names}
            
            for i in range(num_samples):
                params = {}
                for n in param_names:
                    if n == name:
                        params[n] = nominal_parameters[n]
                    else:
                        params[n] = other_samples[n][i]
                try:
                    y_fixed.append(float(func(params)))
                except Exception:
                    y_fixed.append(0.0)
            
            y_fixed = np.array(y_fixed)
            var_fixed = np.var(y_fixed) if len(y_fixed) > 1 else 0.0
            sensitivity_indices[name] = max(0.0, (var_total - var_fixed) / var_total) if var_total > 0 else 0.0
        
        return sensitivity_indices
    
    def first_order_propagation(
        self,
        partial_derivatives: np.ndarray,
        covariance_matrix: np.ndarray
    ) -> np.ndarray:
        """一阶误差传播（方差协方差法）
        
        Args:
            partial_derivatives: 偏导数向量 (∂f/∂x_i)
            covariance_matrix: 参数协方差矩阵
            
        Returns:
            结果协方差矩阵
        """
        partial_derivatives = np.asarray(partial_derivatives)
        covariance_matrix = np.asarray(covariance_matrix)
        
        if partial_derivatives.ndim == 1:
            result_variance = partial_derivatives @ covariance_matrix @ partial_derivatives
            return np.array([[result_variance]])
        else:
            return partial_derivatives @ covariance_matrix @ partial_derivatives.T
    
    def analyze_orbit_uncertainty(
        self,
        initial_state: np.ndarray,
        initial_covariance: np.ndarray,
        state_transition_matrix: np.ndarray,
        process_noise: Optional[np.ndarray] = None
    ) -> np.ndarray:
        """分析轨道不确定度传播
        
        Args:
            initial_state: 初始状态向量
            initial_covariance: 初始协方差矩阵
            state_transition_matrix: 状态转移矩阵 Φ
            process_noise: 过程噪声协方差
            
        Returns:
            传播后的协方差矩阵
        """
        Phi = np.asarray(state_transition_matrix)
        P0 = np.asarray(initial_covariance)
        
        P = Phi @ P0 @ Phi.T
        
        if process_noise is not None:
            P += process_noise
        
        return P
    
    def compute_crlb(
        self,
        fisher_information: np.ndarray
    ) -> np.ndarray:
        """计算Cramér-Rao下界
        
        Args:
            fisher_information: Fisher信息矩阵
            
        Returns:
            CRLB协方差矩阵
        """
        try:
            return np.linalg.inv(fisher_information)
        except np.linalg.LinAlgError:
            return np.linalg.pinv(fisher_information)
    
    def _estimate_parameter_sensitivity(
        self,
        nominal: np.ndarray,
        results: List[np.ndarray],
        perturbations: List[float]
    ) -> float:
        """估计参数灵敏度"""
        if len(results) != len(perturbations) or len(perturbations) < 2:
            return 0.0
        
        errors = []
        for result, perturbation in zip(results, perturbations):
            error = np.linalg.norm(np.asarray(result) - nominal)
            errors.append(error)
        
        errors = np.array(errors)
        perturbations = np.array(perturbations)
        
        if np.std(perturbations) == 0:
            return 0.0
        
        correlation = np.corrcoef(perturbations, errors)[0, 1]
        if np.isnan(correlation):
            correlation = 0.0
        
        return abs(correlation) * np.std(errors)
    
    def _classify_severity(self, relative_contribution: float) -> ErrorSeverity:
        """分类严重程度"""
        if relative_contribution < 0.01:
            return ErrorSeverity.NEGLIGIBLE
        elif relative_contribution < 0.05:
            return ErrorSeverity.MINOR
        elif relative_contribution < 0.2:
            return ErrorSeverity.MODERATE
        elif relative_contribution < 0.5:
            return ErrorSeverity.SIGNIFICANT
        else:
            return ErrorSeverity.CRITICAL
    
    def _identify_error_source(self, param_name: str) -> ErrorSource:
        """识别误差来源"""
        param_lower = param_name.lower()
        
        if any(kw in param_lower for kw in ['step', 'integrat', 'rk4', 'rk78']):
            return ErrorSource.INTEGRATION
        elif any(kw in param_lower for kw in ['j2', 'j3', 'j4', 'drag', 'solar', 'radiation']):
            return ErrorSource.PERTURBATION
        elif any(kw in param_lower for kw in ['obs', 'measure', 'data']):
            return ErrorSource.OBSERVATION
        elif any(kw in param_lower for kw in ['model', 'assume', 'simplif']):
            return ErrorSource.MODEL
        elif any(kw in param_lower for kw in ['init', 'initial', 'start']):
            return ErrorSource.INITIAL_CONDITION
        elif any(kw in param_lower for kw in ['unit', 'convert', 'scale']):
            return ErrorSource.UNIT_CONVERSION
        else:
            return ErrorSource.NUMERICAL
    
    def _build_error_chain(self, contributions: List[ErrorContribution]) -> List[str]:
        """构建误差传播链"""
        chain = []
        for contribution in contributions:
            if contribution.severity in [ErrorSeverity.SIGNIFICANT, ErrorSeverity.CRITICAL]:
                chain.append(
                    f"{contribution.source.value} → {contribution.name}: "
                    f"{contribution.relative_contribution:.1%}"
                )
        return chain
    
    def _generate_mitigation_suggestions(
        self,
        contributions: List[ErrorContribution]
    ) -> List[str]:
        """生成误差缓解建议"""
        suggestions = []
        
        for contribution in contributions[:3]:
            if contribution.source == ErrorSource.INTEGRATION:
                suggestions.append(
                    f"积分误差显著（{contribution.relative_contribution:.1%}），"
                    f"建议减小积分步长或使用更高阶积分方法"
                )
            elif contribution.source == ErrorSource.PERTURBATION:
                suggestions.append(
                    f"摄动模型误差显著（{contribution.relative_contribution:.1%}），"
                    f"建议增加 {contribution.name} 摄动模型精度"
                )
            elif contribution.source == ErrorSource.OBSERVATION:
                suggestions.append(
                    f"观测数据误差显著（{contribution.relative_contribution:.1%}），"
                    f"建议增加观测数据量或使用更高精度的观测设备"
                )
            elif contribution.source == ErrorSource.INITIAL_CONDITION:
                suggestions.append(
                    f"初始条件误差显著（{contribution.relative_contribution:.1%}），"
                    f"建议提高初始轨道确定精度"
                )
            elif contribution.source == ErrorSource.NUMERICAL:
                suggestions.append(
                    f"数值误差显著（{contribution.relative_contribution:.1%}），"
                    f"建议使用更高精度的浮点运算（如float128）或Kahan求和"
                )
        
        return suggestions


class CovariancePropagator:
    """协方差传播器"""
    
    def __init__(self, state_dimension: int = 6):
        self.state_dim = state_dimension
        self.process_noise = np.zeros((state_dimension, state_dimension))
    
    def set_process_noise(self, noise_spectral_density: np.ndarray, dt: float):
        """设置过程噪声（使用Q矩阵离散化）"""
        q = np.asarray(noise_spectral_density)
        self.process_noise = q * dt
    
    def propagate_covariance(
        self,
        P: np.ndarray,
        Phi: np.ndarray,
        Q: Optional[np.ndarray] = None
    ) -> np.ndarray:
        """传播协方差矩阵"""
        P = np.asarray(P)
        Phi = np.asarray(Phi)
        
        P_new = Phi @ P @ Phi.T
        
        if Q is not None:
            P_new += Q
        elif np.any(self.process_noise != 0):
            P_new += self.process_noise
        
        return P_new
    
    def compute_position_uncertainty(self, P: np.ndarray) -> float:
        """计算位置不确定度（3σ）"""
        if P.shape[0] >= 3:
            return 3 * np.sqrt(np.trace(P[:3, :3]))
        return 0.0
    
    def compute_velocity_uncertainty(self, P: np.ndarray) -> float:
        """计算速度不确定度（3σ）"""
        if P.shape[0] >= 6:
            return 3 * np.sqrt(np.trace(P[3:6, 3:6]))
        return 0.0


class UncertaintyBudgetManager:
    """不确定度预算管理器"""
    
    def __init__(self):
        self.budgets: Dict[str, ErrorBudget] = {}
    
    def create_budget(
        self,
        name: str,
        parameters: Dict[str, Tuple[float, float]],
        sensitivity_coefficients: Optional[Dict[str, float]] = None
    ) -> ErrorBudget:
        """创建误差预算"""
        components = []
        for param_name, (nominal, uncertainty) in parameters.items():
            rel_unc = abs(uncertainty / nominal) if nominal != 0 else 0.0
            sensitivity = 1.0
            if sensitivity_coefficients and param_name in sensitivity_coefficients:
                sensitivity = sensitivity_coefficients[param_name]
            
            component = UncertaintyBudget(
                parameter_name=param_name,
                nominal_value=nominal,
                absolute_uncertainty=uncertainty,
                relative_uncertainty=rel_unc,
                sensitivity_coefficient=sensitivity
            )
            components.append(component)
        
        budget = ErrorBudget(name=name, uncertainty_components=components)
        self.budgets[name] = budget
        return budget
    
    def update_component(
        self,
        budget_name: str,
        parameter_name: str,
        new_uncertainty: float
    ):
        """更新不确定度分量"""
        if budget_name not in self.budgets:
            return
        
        budget = self.budgets[budget_name]
        for component in budget.uncertainty_components:
            if component.parameter_name == parameter_name:
                component.absolute_uncertainty = new_uncertainty
                if component.nominal_value != 0:
                    component.relative_uncertainty = abs(new_uncertainty / component.nominal_value)
                break
    
    def get_contribution_report(self, budget_name: str) -> str:
        """生成贡献报告"""
        if budget_name not in self.budgets:
            return f"未找到预算: {budget_name}"
        
        budget = self.budgets[budget_name]
        total = budget.total_uncertainty()
        
        report = f"不确定度预算报告: {budget.name}\n"
        report += "=" * 50 + "\n"
        report += f"总合成不确定度: {total:.6e}\n\n"
        report += f"{'参数':<20} {'名义值':<15} {'绝对不确定度':<15} {'相对贡献':<10}\n"
        report += "-" * 60 + "\n"
        
        for component in sorted(
            budget.uncertainty_components,
            key=lambda c: c.absolute_uncertainty * c.sensitivity_coefficient,
            reverse=True
        ):
            contribution = component.absolute_uncertainty * component.sensitivity_coefficient
            rel_contribution = (contribution ** 2) / (total ** 2) if total > 0 else 0
            report += f"{component.parameter_name:<20} {component.nominal_value:<15.6e} {component.absolute_uncertainty:<15.6e} {rel_contribution:<10.1%}\n"
        
        return report
