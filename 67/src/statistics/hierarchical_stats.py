import pandas as pd
import numpy as np
from datetime import datetime, timedelta
import warnings
warnings.filterwarnings('ignore')

from config.config import HIERARCHY_CONFIG, TIME_CONFIG


class HierarchicalStatistics:
    def __init__(self):
        self.levels = HIERARCHY_CONFIG['levels']
        self.level_names = HIERARCHY_CONFIG['level_names']

    def aggregate_by_level(self, df, level='factory', time_granularity='day', metrics=None):
        if metrics is None:
            metrics = ['power', 'current', 'voltage', 'power_factor', 'energy']
        
        df = df.copy()
        df['timestamp'] = pd.to_datetime(df['timestamp'])
        
        if time_granularity == 'hour':
            df['time_period'] = df['timestamp'].dt.to_period('H')
        elif time_granularity == 'day':
            df['time_period'] = df['timestamp'].dt.to_period('D')
        elif time_granularity == 'week':
            df['time_period'] = df['timestamp'].dt.to_period('W')
        elif time_granularity == 'month':
            df['time_period'] = df['timestamp'].dt.to_period('M')
        else:
            raise ValueError(f"不支持的时间粒度: {time_granularity}")
        
        group_cols = [level, 'time_period']
        
        agg_dict = {}
        for metric in metrics:
            if metric in df.columns:
                if metric in ['power', 'current', 'voltage', 'power_factor']:
                    agg_dict[metric] = ['mean', 'max', 'min', 'std']
                elif metric == 'energy':
                    agg_dict[metric] = ['sum', 'mean']
        
        result = df.groupby(group_cols).agg(agg_dict).reset_index()
        result.columns = [f"{col[0]}_{col[1]}" if col[1] else col[0] for col in result.columns]
        
        result['time_period'] = result['time_period'].astype(str)
        result['level'] = level
        
        return result

    def hierarchical_rollup(self, df, metrics=None):
        if metrics is None:
            metrics = ['power', 'current', 'voltage', 'power_factor', 'energy']
        
        results = {}
        
        for level in self.levels:
            results[level] = self.aggregate_by_level(df, level=level, metrics=metrics)
        
        return results

    def get_factory_summary(self, df, time_granularity='day'):
        return self.aggregate_by_level(df, level='factory', time_granularity=time_granularity)

    def get_workshop_summary(self, df, factory=None, time_granularity='day'):
        df_filtered = df.copy()
        if factory:
            df_filtered = df_filtered[df_filtered['factory'] == factory]
        return self.aggregate_by_level(df_filtered, level='workshop', time_granularity=time_granularity)

    def get_equipment_summary(self, df, factory=None, workshop=None, time_granularity='day'):
        df_filtered = df.copy()
        if factory:
            df_filtered = df_filtered[df_filtered['factory'] == factory]
        if workshop:
            df_filtered = df_filtered[df_filtered['workshop'] == workshop]
        return self.aggregate_by_level(df_filtered, level='equipment', time_granularity=time_granularity)

    def compare_periods(self, df, level='factory', metrics=None, compare_type='yoy'):
        if metrics is None:
            metrics = ['energy', 'power']
        
        df = df.copy()
        df['timestamp'] = pd.to_datetime(df['timestamp'])
        df['date'] = df['timestamp'].dt.date
        
        current_data = self.aggregate_by_level(df, level=level, time_granularity='day', metrics=metrics)
        
        if compare_type == 'yoy':
            df['date'] = df['date'].apply(lambda x: x.replace(year=x.year - 1))
        elif compare_type == 'mom':
            df['date'] = df['date'].apply(lambda x: x.replace(month=x.month - 1) if x.month > 1 else x.replace(year=x.year - 1, month=12))
        elif compare_type == 'wod':
            df['date'] = df['date'] - timedelta(days=7)
        else:
            raise ValueError(f"不支持的对比类型: {compare_type}")
        
        df['timestamp'] = pd.to_datetime(df['date'])
        compare_data = self.aggregate_by_level(df, level=level, time_granularity='day', metrics=metrics)
        
        merged = pd.merge(
            current_data,
            compare_data,
            on=[level, 'time_period'],
            suffixes=('_current', '_compare'),
            how='outer'
        )
        
        for metric in metrics:
            current_col = f"{metric}_sum_current" if metric == 'energy' else f"{metric}_mean_current"
            compare_col = f"{metric}_sum_compare" if metric == 'energy' else f"{metric}_mean_compare"
            
            if current_col in merged.columns and compare_col in merged.columns:
                merged[f"{metric}_change_rate"] = (
                    (merged[current_col] - merged[compare_col]) / merged[compare_col] * 100
                ).round(2)
        
        return merged

    def get_top_n_consumers(self, df, level='equipment', n=10, metric='energy'):
        df = df.copy()
        
        agg_func = 'sum' if metric == 'energy' else 'mean'
        
        if level == 'factory':
            group_cols = ['factory']
        elif level == 'workshop':
            group_cols = ['factory', 'workshop']
        elif level == 'equipment':
            group_cols = ['factory', 'workshop', 'equipment']
        else:
            group_cols = [level]
        
        result = df.groupby(group_cols)[metric].agg(agg_func).reset_index()
        result = result.sort_values(metric, ascending=False).head(n)
        
        total = result[metric].sum()
        result[f'{metric}_percentage'] = (result[metric] / total * 100).round(2)
        
        return result

    def get_energy_benchmark(self, df, level='workshop'):
        df = df.copy()
        
        stats = df.groupby(level)['energy'].agg([
            'mean', 'median', 'std', 'min', 'max'
        ]).reset_index()
        
        overall_mean = df['energy'].mean()
        stats['efficiency_score'] = (overall_mean / stats['mean'] * 100).round(2)
        stats['efficiency_level'] = pd.cut(
            stats['efficiency_score'],
            bins=[0, 80, 95, 100, float('inf')],
            labels=['低效', '一般', '高效', '优秀']
        )
        
        return stats

    def get_time_distribution(self, df, level='factory'):
        df = df.copy()
        df['timestamp'] = pd.to_datetime(df['timestamp'])
        df['hour'] = df['timestamp'].dt.hour
        df['is_work_hour'] = ((df['hour'] >= 8) & (df['hour'] < 22)).astype(int)
        
        group_cols = []
        if level == 'factory':
            group_cols = ['factory']
        elif level == 'workshop':
            group_cols = ['factory', 'workshop']
        elif level == 'equipment':
            group_cols = ['factory', 'workshop', 'equipment']
        else:
            group_cols = [level]
        
        group_cols.append('is_work_hour')
        
        result = df.groupby(group_cols)['energy'].sum().unstack()
        
        if 0 not in result.columns:
            result[0] = 0
        if 1 not in result.columns:
            result[1] = 0
        
        result.columns = ['非工作时间', '工作时间']
        result['总能耗'] = result.sum(axis=1)
        result['工作时间占比'] = (result['工作时间'] / result['总能耗'] * 100).round(2)
        result['非工作时间占比'] = (result['非工作时间'] / result['总能耗'] * 100).round(2)
        
        return result

    def calculate_cumulative_energy(self, df, level='factory', time_granularity='day'):
        df = df.copy()
        df['timestamp'] = pd.to_datetime(df['timestamp'])
        
        if time_granularity == 'hour':
            df['time_period'] = df['timestamp'].dt.to_period('H')
        elif time_granularity == 'day':
            df['time_period'] = df['timestamp'].dt.to_period('D')
        elif time_granularity == 'week':
            df['time_period'] = df['timestamp'].dt.to_period('W')
        elif time_granularity == 'month':
            df['time_period'] = df['timestamp'].dt.to_period('M')
        
        if level == 'factory':
            group_cols = ['factory', 'time_period']
            cum_group_cols = ['factory']
        elif level == 'workshop':
            group_cols = ['factory', 'workshop', 'time_period']
            cum_group_cols = ['factory', 'workshop']
        elif level == 'equipment':
            group_cols = ['factory', 'workshop', 'equipment', 'time_period']
            cum_group_cols = ['factory', 'workshop', 'equipment']
        else:
            group_cols = [level, 'time_period']
            cum_group_cols = [level]
        
        daily_energy = df.groupby(group_cols)['energy'].sum().reset_index()
        daily_energy = daily_energy.sort_values(group_cols)
        daily_energy['cumulative_energy'] = daily_energy.groupby(cum_group_cols)['energy'].cumsum()
        daily_energy['time_period'] = daily_energy['time_period'].astype(str)
        
        return daily_energy
