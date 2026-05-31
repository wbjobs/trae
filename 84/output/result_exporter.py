import numpy as np
import pandas as pd
from dataclasses import dataclass, field
from typing import List, Dict, Optional, Any, Union
from enum import Enum
import json
import csv
import logging
from pathlib import Path
from datetime import datetime

from core import (
    PropagationResult,
    OrbitDeviationAnalysis,
    FittingResult,
    ForecastResult,
    const
)
from data_io import ObservationData, EphemerisData


class OutputFormat(Enum):
    """输出格式枚举"""
    CSV = "csv"
    JSON = "json"
    HDF5 = "hdf5"
    TXT = "txt"
    CUSTOM = "custom"


class ReportFormat(Enum):
    """报告格式枚举"""
    TEXT = "text"
    HTML = "html"
    MARKDOWN = "markdown"


@dataclass
class ExportConfig:
    """导出配置"""
    output_dir: str = "output"
    format: OutputFormat = OutputFormat.CSV
    include_metadata: bool = True
    precision: int = 15
    compression: bool = False
    separate_files: bool = True


class ResultExporter:
    """结果导出器"""
    
    def __init__(self, config: ExportConfig = None):
        self.config = config or ExportConfig()
        self.output_dir = Path(self.config.output_dir)
        self.output_dir.mkdir(parents=True, exist_ok=True)
        self.logger = logging.getLogger(__name__)
    
    def export_propagation_result(
        self,
        result: PropagationResult,
        filename: Optional[str] = None,
        format: Optional[OutputFormat] = None
    ) -> Path:
        """导出轨道传播结果"""
        format = format or self.config.format
        filename = filename or f"{result.body_name}_propagation"
        filepath = self.output_dir / f"{filename}.{format.value}"
        
        data = {
            'time_mjd': result.time,
            'pos_x_m': result.position[:, 0],
            'pos_y_m': result.position[:, 1],
            'pos_z_m': result.position[:, 2],
            'vel_x_ms': result.velocity[:, 0],
            'vel_y_ms': result.velocity[:, 1],
            'vel_z_ms': result.velocity[:, 2]
        }
        
        if result.elements:
            for i, elem in enumerate(result.elements):
                data[f'element_{i}'] = elem
        
        df = pd.DataFrame(data)
        
        if format == OutputFormat.CSV:
            df.to_csv(filepath, index=False, float_format=f'%.{self.config.precision}g')
        elif format == OutputFormat.JSON:
            output = {
                'body_name': result.body_name,
                'metadata': result.metadata,
                'data': {
                    'time_mjd': result.time.tolist(),
                    'position_m': result.position.tolist(),
                    'velocity_ms': result.velocity.tolist()
                }
            }
            if result.elements is not None:
                output['elements'] = [e.__dict__ for e in result.elements]
            with open(filepath, 'w', encoding='utf-8') as f:
                json.dump(output, f, indent=2, default=str)
        
        self.logger.info(f"已导出传播结果: {filepath}")
        return filepath
    
    def export_deviation_analysis(
        self,
        analysis: OrbitDeviationAnalysis,
        filename: Optional[str] = None,
        format: Optional[OutputFormat] = None
    ) -> Path:
        """导出偏差分析结果"""
        format = format or self.config.format
        filename = filename or f"{analysis.body_name}_deviation"
        filepath = self.output_dir / f"{filename}.{format.value}"
        
        data = {
            'time_mjd': analysis.time,
            'position_deviation_m': analysis.position_deviation,
            'velocity_deviation_ms': analysis.velocity_deviation
        }
        
        for elem_name, elem_dev in analysis.element_deviations.items():
            data[f'{elem_name}_deviation'] = elem_dev
        
        df = pd.DataFrame(data)
        
        if format == OutputFormat.CSV:
            df.to_csv(filepath, index=False, float_format=f'%.{self.config.precision}g')
        elif format == OutputFormat.JSON:
            output = {
                'body_name': analysis.body_name,
                'statistics': self._make_serializable(analysis.statistics),
                'periodicity': self._make_serializable(analysis.periodicity),
                'data': {
                    'time_mjd': analysis.time.tolist(),
                    'position_deviation_m': analysis.position_deviation.tolist(),
                    'velocity_deviation_ms': analysis.velocity_deviation.tolist(),
                    'element_deviations': {k: v.tolist() for k, v in analysis.element_deviations.items()}
                }
            }
            with open(filepath, 'w', encoding='utf-8') as f:
                json.dump(output, f, indent=2, default=str)
        
        self.logger.info(f"已导出偏差分析结果: {filepath}")
        return filepath
    
    def export_fitting_result(
        self,
        fitting: FittingResult,
        body_name: str,
        element_type: str,
        filename: Optional[str] = None,
        format: Optional[OutputFormat] = None
    ) -> Path:
        """导出拟合结果"""
        format = format or self.config.format
        filename = filename or f"{body_name}_{element_type}_fitting"
        filepath = self.output_dir / f"{filename}.{format.value}"
        
        output = {
            'body_name': body_name,
            'element_type': element_type,
            'method': fitting.method.value,
            'rmse': fitting.rmse,
            'r_squared': fitting.r_squared,
            'coefficients': fitting.coefficients.tolist(),
            'residuals': fitting.residuals.tolist(),
            'metadata': self._make_serializable(fitting.metadata)
        }
        
        with open(filepath, 'w', encoding='utf-8') as f:
            json.dump(output, f, indent=2, default=str)
        
        self.logger.info(f"已导出拟合结果: {filepath}")
        return filepath
    
    def export_forecast_result(
        self,
        forecast: ForecastResult,
        body_name: str,
        element_type: str,
        filename: Optional[str] = None,
        format: Optional[OutputFormat] = None
    ) -> Path:
        """导出预测结果"""
        format = format or self.config.format
        filename = filename or f"{body_name}_{element_type}_forecast"
        filepath = self.output_dir / f"{filename}.{format.value}"
        
        data = {
            'time_mjd': forecast.time,
            'forecast': forecast.forecast,
            'confidence_lower': forecast.confidence_lower,
            'confidence_upper': forecast.confidence_upper
        }
        df = pd.DataFrame(data)
        
        if format == OutputFormat.CSV:
            df.to_csv(filepath, index=False, float_format=f'%.{self.config.precision}g')
        elif format == OutputFormat.JSON:
            output = {
                'body_name': body_name,
                'element_type': element_type,
                'model': forecast.model.value,
                'parameters': self._make_serializable(forecast.parameters),
                'data': {
                    'time_mjd': forecast.time.tolist(),
                    'forecast': forecast.forecast.tolist(),
                    'confidence_lower': forecast.confidence_lower.tolist(),
                    'confidence_upper': forecast.confidence_upper.tolist()
                }
            }
            with open(filepath, 'w', encoding='utf-8') as f:
                json.dump(output, f, indent=2, default=str)
        
        self.logger.info(f"已导出预测结果: {filepath}")
        return filepath
    
    def export_observation_data(
        self,
        data: ObservationData,
        filename: Optional[str] = None,
        format: Optional[OutputFormat] = None
    ) -> Path:
        """导出观测数据"""
        format = format or self.config.format
        filename = filename or f"{data.body_name}_observations"
        filepath = self.output_dir / f"{filename}.{format.value}"
        
        data_dict = {
            'time_mjd': data.time,
            'pos_x_m': data.position[:, 0],
            'pos_y_m': data.position[:, 1],
            'pos_z_m': data.position[:, 2]
        }
        
        if data.velocity is not None:
            data_dict['vel_x_ms'] = data.velocity[:, 0]
            data_dict['vel_y_ms'] = data.velocity[:, 1]
            data_dict['vel_z_ms'] = data.velocity[:, 2]
        
        if data.uncertainty is not None:
            data_dict['uncertainty_m'] = data.uncertainty
        
        df = pd.DataFrame(data_dict)
        
        if format == OutputFormat.CSV:
            df.to_csv(filepath, index=False, float_format=f'%.{self.config.precision}g')
        elif format == OutputFormat.JSON:
            output = {
                'body_name': data.body_name,
                'source': data.source,
                'observation_type': data.observation_type,
                'data': data_dict
            }
            with open(filepath, 'w', encoding='utf-8') as f:
                json.dump(output, f, indent=2, default=str)
        
        self.logger.info(f"已导出观测数据: {filepath}")
        return filepath
    
    def generate_report(
        self,
        analysis: OrbitDeviationAnalysis,
        format: ReportFormat = ReportFormat.MARKDOWN,
        filename: Optional[str] = None
    ) -> Path:
        """生成分析报告"""
        filename = filename or f"{analysis.body_name}_report"
        filepath = self.output_dir / f"{filename}.{format.value}"
        
        stats = analysis.statistics
        periodicity = analysis.periodicity
        
        if format == ReportFormat.MARKDOWN:
            content = self._generate_markdown_report(analysis, stats, periodicity)
        elif format == ReportFormat.TEXT:
            content = self._generate_text_report(analysis, stats, periodicity)
        else:
            content = self._generate_html_report(analysis, stats, periodicity)
        
        with open(filepath, 'w', encoding='utf-8') as f:
            f.write(content)
        
        self.logger.info(f"已生成报告: {filepath}")
        return filepath
    
    def _generate_markdown_report(
        self,
        analysis: OrbitDeviationAnalysis,
        stats: Dict,
        periodicity: Dict
    ) -> str:
        """生成Markdown格式报告"""
        report = f"""# 轨道摄动偏差分析报告
## 天体: {analysis.body_name}
生成时间: {datetime.now().isoformat()}

---

## 1. 统计特征

| 指标 | 数值 | 单位 |
|------|------|------|
| 平均值 | {stats.get('mean', 'N/A'):.6e} | m |
| 中位数 | {stats.get('median', 'N/A'):.6e} | m |
| 标准差 | {stats.get('std', 'N/A'):.6e} | m |
| 最小值 | {stats.get('min', 'N/A'):.6e} | m |
| 最大值 | {stats.get('max', 'N/A'):.6e} | m |
| 范围 | {stats.get('range', 'N/A'):.6e} | m |
| RMSE | {stats.get('rmse', 'N/A'):.6e} | m |
| MAE | {stats.get('mae', 'N/A'):.6e} | m |
| 偏度 | {stats.get('skewness', 'N/A'):.6f} | - |
| 峰度 | {stats.get('kurtosis', 'N/A'):.6f} | - |
| 样本数 | {stats.get('count', 'N/A')} | - |

## 2. 周期性分析

- 主导周期: {periodicity.get('dominant_period', 'N/A'):.2f} 天
- 主导频率: {periodicity.get('dominant_frequency', 'N/A'):.6e} Hz
- 峰值功率比: {periodicity.get('peak_power_ratio', 'N/A'):.4f}
- 存在周期性: {'是' if periodicity.get('has_periodicity', False) else '否'}

## 3. 拟合结果

"""
        
        for name, fitting in analysis.fitting_results.items():
            report += f"""
### {name}
- RMSE: {fitting.rmse:.6e} m
- R²: {fitting.r_squared:.6f}
"""
        
        report += """
## 4. 预测结果

"""
        
        for elem_type, forecast in analysis.forecast_results.items():
            report += f"""
### {elem_type}
- 预测模型: {forecast.model.value}
- 预测时长: {forecast.time[-1] - forecast.time[0]:.2f} 天
"""
        
        return report
    
    def _generate_text_report(
        self,
        analysis: OrbitDeviationAnalysis,
        stats: Dict,
        periodicity: Dict
    ) -> str:
        """生成纯文本报告"""
        report = f"""
========================================
轨道摄动偏差分析报告
天体: {analysis.body_name}
生成时间: {datetime.now().isoformat()}
========================================

【统计特征】
  平均值: {stats.get('mean', 'N/A'):.6e} m
  中位数: {stats.get('median', 'N/A'):.6e} m
  标准差: {stats.get('std', 'N/A'):.6e} m
  最小值: {stats.get('min', 'N/A'):.6e} m
  最大值: {stats.get('max', 'N/A'):.6e} m
  范围:   {stats.get('range', 'N/A'):.6e} m
  RMSE:   {stats.get('rmse', 'N/A'):.6e} m
  MAE:    {stats.get('mae', 'N/A'):.6e} m
  偏度:   {stats.get('skewness', 'N/A'):.6f}
  峰度:   {stats.get('kurtosis', 'N/A'):.6f}
  样本数: {stats.get('count', 'N/A')}

【周期性分析】
  主导周期: {periodicity.get('dominant_period', 'N/A'):.2f} 天
  主导频率: {periodicity.get('dominant_frequency', 'N/A'):.6e} Hz
  峰值功率比: {periodicity.get('peak_power_ratio', 'N/A'):.4f}
  存在周期性: {'是' if periodicity.get('has_periodicity', False) else '否'}

【拟合结果】
"""
        
        for name, fitting in analysis.fitting_results.items():
            report += f"  {name}: RMSE={fitting.rmse:.6e} m, R²={fitting.r_squared:.6f}\n"
        
        return report
    
    def _generate_html_report(
        self,
        analysis: OrbitDeviationAnalysis,
        stats: Dict,
        periodicity: Dict
    ) -> str:
        """生成HTML格式报告"""
        html = f"""<!DOCTYPE html>
<html lang="zh-CN">
<head>
    <meta charset="UTF-8">
    <title>轨道摄动偏差分析报告 - {analysis.body_name}</title>
    <style>
        body {{ font-family: Arial, sans-serif; margin: 20px; }}
        h1 {{ color: #333; }}
        table {{ border-collapse: collapse; width: 100%; }}
        th, td {{ border: 1px solid #ddd; padding: 8px; text-align: left; }}
        th {{ background-color: #4CAF50; color: white; }}
        tr:nth-child(even) {{ background-color: #f2f2f2; }}
    </style>
</head>
<body>
    <h1>轨道摄动偏差分析报告</h1>
    <p><strong>天体:</strong> {analysis.body_name}</p>
    <p><strong>生成时间:</strong> {datetime.now().isoformat()}</p>
    
    <h2>1. 统计特征</h2>
    <table>
        <tr><th>指标</th><th>数值</th><th>单位</th></tr>
        <tr><td>平均值</td><td>{stats.get('mean', 'N/A'):.6e}</td><td>m</td></tr>
        <tr><td>中位数</td><td>{stats.get('median', 'N/A'):.6e}</td><td>m</td></tr>
        <tr><td>标准差</td><td>{stats.get('std', 'N/A'):.6e}</td><td>m</td></tr>
        <tr><td>最小值</td><td>{stats.get('min', 'N/A'):.6e}</td><td>m</td></tr>
        <tr><td>最大值</td><td>{stats.get('max', 'N/A'):.6e}</td><td>m</td></tr>
        <tr><td>范围</td><td>{stats.get('range', 'N/A'):.6e}</td><td>m</td></tr>
        <tr><td>RMSE</td><td>{stats.get('rmse', 'N/A'):.6e}</td><td>m</td></tr>
        <tr><td>MAE</td><td>{stats.get('mae', 'N/A'):.6e}</td><td>m</td></tr>
        <tr><td>偏度</td><td>{stats.get('skewness', 'N/A'):.6f}</td><td>-</td></tr>
        <tr><td>峰度</td><td>{stats.get('kurtosis', 'N/A'):.6f}</td><td>-</td></tr>
        <tr><td>样本数</td><td>{stats.get('count', 'N/A')}</td><td>-</td></tr>
    </table>
    
    <h2>2. 周期性分析</h2>
    <ul>
        <li><strong>主导周期:</strong> {periodicity.get('dominant_period', 'N/A'):.2f} 天</li>
        <li><strong>主导频率:</strong> {periodicity.get('dominant_frequency', 'N/A'):.6e} Hz</li>
        <li><strong>峰值功率比:</strong> {periodicity.get('peak_power_ratio', 'N/A'):.4f}</li>
        <li><strong>存在周期性:</strong> {'是' if periodicity.get('has_periodicity', False) else '否'}</li>
    </ul>
</body>
</html>
"""
        return html
    
    def export_batch_results(
        self,
        results: Dict[str, Any],
        filename: str = "batch_results",
        format: Optional[OutputFormat] = None
    ) -> Path:
        """批量导出结果"""
        format = format or self.config.format
        filepath = self.output_dir / f"{filename}.{format.value}"
        
        if format == OutputFormat.JSON:
            serializable = self._make_serializable(results)
            with open(filepath, 'w', encoding='utf-8') as f:
                json.dump(serializable, f, indent=2, default=str)
        else:
            summary = []
            for name, result in results.items():
                if hasattr(result, '__dict__'):
                    summary.append({
                        'name': name,
                        **{k: v for k, v in result.__dict__.items()
                           if isinstance(v, (int, float, str, bool)}
                })
            df = pd.DataFrame(summary)
            df.to_csv(filepath, index=False)
        
        self.logger.info(f"已导出批量结果: {filepath}")
        return filepath
    
    def list_output_files(self) -> List[str]:
        """列出输出目录中的文件"""
        return [f.name for f in self.output_dir.iterdir() if f.is_file()]
    
    def _make_serializable(self, obj: Any) -> Any:
        """将对象转换为可序列化的格式"""
        if isinstance(obj, (np.ndarray,)):
            return obj.tolist()
        elif isinstance(obj, dict):
            return {k: self._make_serializable(v) for k, v in obj.items()}
        elif isinstance(obj, (list, tuple)):
            return [self._make_serializable(i) for i in obj]
        elif hasattr(obj, '__dict__'):
            return {k: self._make_serializable(v) for k, v in obj.__dict__.items()
                    if not k.startswith('_')}
        else:
            return obj
