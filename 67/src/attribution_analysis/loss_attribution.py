import pandas as pd
import numpy as np
from datetime import datetime, timedelta
from sklearn.linear_model import LinearRegression
from sklearn.ensemble import RandomForestRegressor
import warnings
warnings.filterwarnings('ignore')


class EnergyLossAttribution:
    def __init__(self):
        self.loss_categories = [
            '设备老化损耗',
            '运行效率损耗',
            '非工作时间损耗',
            '空载运行损耗',
            '电网波动损耗',
            '其他损耗'
        ]

    def calculate_total_loss(self, df, theoretical_energy=None):
        df = df.copy()
        
        if theoretical_energy is None:
            theoretical_energy = self._calculate_theoretical_energy(df)
        
        actual_energy = df['energy'].sum()
        total_loss = theoretical_energy - actual_energy
        loss_rate = total_loss / theoretical_energy * 100 if theoretical_energy > 0 else 0
        
        return {
            'theoretical_energy': theoretical_energy,
            'actual_energy': actual_energy,
            'total_loss': total_loss,
            'loss_rate': round(loss_rate, 2)
        }

    def _calculate_theoretical_energy(self, df):
        base_power = df['power'].median()
        total_hours = (df['timestamp'].max() - df['timestamp'].min()).total_seconds() / 3600
        equipment_count = df['equipment'].nunique()
        
        theoretical_energy = base_power * total_hours * equipment_count * 0.85
        return theoretical_energy

    def analyze_equipment_aging_loss(self, df):
        equipment_stats = df.groupby('equipment').agg({
            'power': ['mean', 'std', 'min', 'max'],
            'energy': 'sum',
            'power_factor': 'mean'
        }).reset_index()
        
        equipment_stats.columns = ['equipment', 'power_mean', 'power_std', 'power_min', 'power_max', 'energy_sum', 'power_factor_mean']
        
        baseline_power = equipment_stats['power_mean'].quantile(0.25)
        equipment_stats['aging_loss'] = equipment_stats.apply(
            lambda x: max(0, (x['power_mean'] - baseline_power) * 0.3), axis=1
        )
        equipment_stats['aging_factor'] = (equipment_stats['power_std'] / equipment_stats['power_mean'] * 100).round(2)
        
        return equipment_stats[['equipment', 'power_mean', 'power_factor_mean', 'aging_factor', 'aging_loss']]

    def analyze_efficiency_loss(self, df):
        df['efficiency'] = df.apply(
            lambda x: x['power'] / (x['voltage'] * x['current'] * x['power_factor'] / 1000) 
            if all([x['voltage'], x['current'], x['power_factor']]) else 1.0, axis=1
        )
        
        df['efficiency'] = df['efficiency'].clip(0.5, 1.5)
        
        efficiency_stats = df.groupby(['factory', 'workshop', 'equipment']).agg({
            'efficiency': ['mean', 'min', 'max'],
            'energy': 'sum'
        }).reset_index()
        
        efficiency_stats.columns = ['factory', 'workshop', 'equipment', 'efficiency_mean', 'efficiency_min', 'efficiency_max', 'energy_sum']
        
        efficiency_stats['efficiency_loss'] = efficiency_stats.apply(
            lambda x: max(0, (1 - min(x['efficiency_mean'], 1.0)) * x['energy_sum']), axis=1
        )
        
        return efficiency_stats

    def analyze_off_hours_loss(self, df):
        df = df.copy()
        df['timestamp'] = pd.to_datetime(df['timestamp'])
        df['hour'] = df['timestamp'].dt.hour
        df['is_work_hour'] = ((df['hour'] >= 8) & (df['hour'] < 22)).astype(int)
        df['is_weekend'] = (df['timestamp'].dt.weekday >= 5).astype(int)
        df['is_off_hours'] = ((df['is_work_hour'] == 0) | (df['is_weekend'] == 1)).astype(int)
        
        off_hours_stats = df.groupby(['factory', 'workshop', 'equipment']).apply(
            lambda x: pd.Series({
                'off_hours_energy': x[x['is_off_hours'] == 1]['energy'].sum(),
                'work_hours_energy': x[x['is_off_hours'] == 0]['energy'].sum(),
                'off_hours_count': len(x[x['is_off_hours'] == 1]),
                'total_count': len(x)
            })
        ).reset_index()
        
        off_hours_stats['off_hours_ratio'] = (
            off_hours_stats['off_hours_energy'] / 
            (off_hours_stats['off_hours_energy'] + off_hours_stats['work_hours_energy']) * 100
        ).round(2)
        
        return off_hours_stats

    def analyze_no_load_loss(self, df):
        df = df.copy()
        power_threshold = df['power'].quantile(0.1)
        df['is_no_load'] = (df['power'] < power_threshold).astype(int)
        
        no_load_stats = df.groupby(['factory', 'workshop', 'equipment']).agg({
            'is_no_load': ['sum', 'count'],
            'energy': lambda x: x[df['is_no_load'] == 1].sum()
        }).reset_index()
        
        no_load_stats.columns = ['factory', 'workshop', 'equipment', 'no_load_count', 'total_count', 'no_load_energy']
        no_load_stats['no_load_ratio'] = (no_load_stats['no_load_count'] / no_load_stats['total_count'] * 100).round(2)
        
        return no_load_stats

    def analyze_grid_fluctuation_loss(self, df):
        voltage_mean = df['voltage'].mean()
        df['voltage_deviation'] = abs(df['voltage'] - voltage_mean) / voltage_mean * 100
        
        grid_stats = df.groupby(['factory', 'workshop', 'equipment']).agg({
            'voltage': ['mean', 'std'],
            'voltage_deviation': 'mean',
            'energy': 'sum'
        }).reset_index()
        
        grid_stats.columns = ['factory', 'workshop', 'equipment', 'voltage_mean', 'voltage_std', 'voltage_deviation_mean', 'energy_sum']
        
        grid_stats['grid_loss'] = grid_stats.apply(
            lambda x: x['energy_sum'] * x['voltage_deviation_mean'] * 0.005, axis=1
        )
        
        return grid_stats

    def comprehensive_loss_analysis(self, df):
        loss_analysis = {}
        
        total_loss = self.calculate_total_loss(df)
        loss_analysis['total_loss_summary'] = total_loss
        
        aging_loss = self.analyze_equipment_aging_loss(df)
        loss_analysis['equipment_aging_loss'] = aging_loss
        loss_analysis['total_aging_loss'] = aging_loss['aging_loss'].sum()
        
        efficiency_loss = self.analyze_efficiency_loss(df)
        loss_analysis['efficiency_loss'] = efficiency_loss
        loss_analysis['total_efficiency_loss'] = efficiency_loss['efficiency_loss'].sum()
        
        off_hours_loss = self.analyze_off_hours_loss(df)
        loss_analysis['off_hours_loss'] = off_hours_loss
        loss_analysis['total_off_hours_loss'] = off_hours_loss['off_hours_energy'].sum()
        
        no_load_loss = self.analyze_no_load_loss(df)
        loss_analysis['no_load_loss'] = no_load_loss
        loss_analysis['total_no_load_loss'] = no_load_loss['no_load_energy'].sum()
        
        grid_loss = self.analyze_grid_fluctuation_loss(df)
        loss_analysis['grid_fluctuation_loss'] = grid_loss
        loss_analysis['total_grid_loss'] = grid_loss['grid_loss'].sum()
        
        loss_breakdown = {
            '设备老化损耗': loss_analysis['total_aging_loss'],
            '运行效率损耗': loss_analysis['total_efficiency_loss'],
            '非工作时间损耗': loss_analysis['total_off_hours_loss'],
            '空载运行损耗': loss_analysis['total_no_load_loss'],
            '电网波动损耗': loss_analysis['total_grid_loss']
        }
        
        total_calculated_loss = sum(loss_breakdown.values())
        if total_calculated_loss > 0:
            loss_analysis['loss_percentage'] = {
                k: round(v / total_calculated_loss * 100, 2) 
                for k, v in loss_breakdown.items()
            }
        
        loss_analysis['loss_breakdown'] = loss_breakdown
        
        return loss_analysis

    def generate_loss_reduction_suggestions(self, loss_analysis):
        suggestions = []
        
        if loss_analysis.get('total_aging_loss', 0) > 0:
            aging_equipment = loss_analysis['equipment_aging_loss'].nlargest(3, 'aging_loss')
            suggestions.append({
                'category': '设备老化',
                'priority': 'high' if loss_analysis['loss_percentage'].get('设备老化损耗', 0) > 30 else 'medium',
                'suggestion': f"建议对以下老化设备进行维护或更换: {', '.join(aging_equipment['equipment'].tolist())}",
                'estimated_saving': round(loss_analysis['total_aging_loss'] * 0.4, 2)
            })
        
        if loss_analysis.get('total_efficiency_loss', 0) > 0:
            low_efficiency = loss_analysis['efficiency_loss'].nsmallest(3, 'efficiency_mean')
            suggestions.append({
                'category': '运行效率',
                'priority': 'high' if loss_analysis['loss_percentage'].get('运行效率损耗', 0) > 30 else 'medium',
                'suggestion': f"以下设备运行效率偏低，建议优化运行参数: {', '.join(low_efficiency['equipment'].tolist())}",
                'estimated_saving': round(loss_analysis['total_efficiency_loss'] * 0.3, 2)
            })
        
        if loss_analysis.get('total_off_hours_loss', 0) > 0:
            high_off_hours = loss_analysis['off_hours_loss'].nlargest(3, 'off_hours_ratio')
            suggestions.append({
                'category': '非工作时间',
                'priority': 'high' if loss_analysis['loss_percentage'].get('非工作时间损耗', 0) > 30 else 'medium',
                'suggestion': f"建议加强以下设备非工作时间管理: {', '.join(high_off_hours['equipment'].tolist())}",
                'estimated_saving': round(loss_analysis['total_off_hours_loss'] * 0.8, 2)
            })
        
        if loss_analysis.get('total_no_load_loss', 0) > 0:
            high_no_load = loss_analysis['no_load_loss'].nlargest(3, 'no_load_ratio')
            suggestions.append({
                'category': '空载运行',
                'priority': 'medium' if loss_analysis['loss_percentage'].get('空载运行损耗', 0) > 15 else 'low',
                'suggestion': f"以下设备空载时间较长，建议安装自动停机装置: {', '.join(high_no_load['equipment'].tolist())}",
                'estimated_saving': round(loss_analysis['total_no_load_loss'] * 0.6, 2)
            })
        
        if loss_analysis.get('total_grid_loss', 0) > 0:
            high_grid_loss = loss_analysis['grid_fluctuation_loss'].nlargest(3, 'grid_loss')
            suggestions.append({
                'category': '电网波动',
                'priority': 'low',
                'suggestion': f"建议对以下设备安装稳压装置: {', '.join(high_grid_loss['equipment'].tolist())}",
                'estimated_saving': round(loss_analysis['total_grid_loss'] * 0.5, 2)
            })
        
        total_saving = sum(s['estimated_saving'] for s in suggestions)
        suggestions.append({
            'category': '综合',
            'priority': 'high',
            'suggestion': '建议建立能耗监控预警系统，实现实时能耗分析和异常预警',
            'estimated_saving': round(total_saving * 0.2, 2)
        })
        
        return suggestions
