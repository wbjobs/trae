import pandas as pd
import numpy as np
from datetime import datetime, timedelta
from sklearn.linear_model import LinearRegression
import warnings
warnings.filterwarnings('ignore')


class EfficiencyAnalyzer:
    def __init__(self):
        self.benchmark_thresholds = {
            'excellent': 0.95,
            'good': 0.85,
            'average': 0.75,
            'poor': 0.6
        }

    def calculate_energy_efficiency(self, df):
        df = df.copy()
        
        df['theoretical_power'] = df['voltage'] * df['current'] * df['power_factor'] / 1000
        df['energy_efficiency'] = df.apply(
            lambda x: x['power'] / x['theoretical_power'] 
            if x['theoretical_power'] > 0 else 1.0, axis=1
        )
        
        df['energy_efficiency'] = df['energy_efficiency'].clip(0.5, 1.2)
        
        return df

    def benchmark_analysis(self, df, level='equipment'):
        df_with_efficiency = self.calculate_energy_efficiency(df)
        
        if level == 'factory':
            group_cols = ['factory']
        elif level == 'workshop':
            group_cols = ['factory', 'workshop']
        elif level == 'equipment':
            group_cols = ['factory', 'workshop', 'equipment']
        else:
            group_cols = [level]
        
        efficiency_stats = df_with_efficiency.groupby(group_cols).agg({
            'energy_efficiency': ['mean', 'median', 'min', 'max', 'std'],
            'energy': 'sum',
            'power': 'mean'
        }).reset_index()
        
        efficiency_stats.columns = [
            '_'.join(col).strip('_') for col in efficiency_stats.columns.values
        ]
        
        efficiency_stats['efficiency_level'] = pd.cut(
            efficiency_stats['energy_efficiency_mean'],
            bins=[0, 0.75, 0.85, 0.95, 1.0],
            labels=['低效', '一般', '良好', '优秀']
        )
        
        return efficiency_stats

    def calculate_energy_saving_potential(self, df):
        efficiency_stats = self.benchmark_analysis(df, level='equipment')
        
        industry_benchmark = efficiency_stats['energy_efficiency_mean'].quantile(0.75)
        
        efficiency_stats['saving_potential'] = efficiency_stats.apply(
            lambda x: x['energy_sum'] * (industry_benchmark - x['energy_efficiency_mean']) / x['energy_efficiency_mean']
            if x['energy_efficiency_mean'] < industry_benchmark else 0, axis=1
        )
        
        efficiency_stats['saving_potential'] = efficiency_stats['saving_potential'].clip(lower=0)
        
        return efficiency_stats.sort_values('saving_potential', ascending=False)

    def analyze_efficiency_trend(self, df, equipment_id=None, time_granularity='day'):
        df = df.copy()
        df['timestamp'] = pd.to_datetime(df['timestamp'])
        
        if equipment_id:
            df = df[df['equipment'] == equipment_id]
        
        df_with_efficiency = self.calculate_energy_efficiency(df)
        
        if time_granularity == 'hour':
            df_with_efficiency['time_period'] = df_with_efficiency['timestamp'].dt.to_period('H')
        elif time_granularity == 'day':
            df_with_efficiency['time_period'] = df_with_efficiency['timestamp'].dt.to_period('D')
        elif time_granularity == 'week':
            df_with_efficiency['time_period'] = df_with_efficiency['timestamp'].dt.to_period('W')
        elif time_granularity == 'month':
            df_with_efficiency['time_period'] = df_with_efficiency['timestamp'].dt.to_period('M')
        
        trend_data = df_with_efficiency.groupby('time_period').agg({
            'energy_efficiency': ['mean', 'std'],
            'energy': 'sum'
        }).reset_index()
        
        trend_data.columns = ['time_period', 'efficiency_mean', 'efficiency_std', 'energy_sum']
        trend_data['time_period'] = trend_data['time_period'].astype(str)
        
        return trend_data

    def predict_efficiency(self, df, equipment_id, periods=7):
        equipment_data = df[df['equipment'] == equipment_id].copy()
        equipment_data = self.calculate_energy_efficiency(equipment_data)
        
        daily_efficiency = equipment_data.groupby(
            equipment_data['timestamp'].dt.date
        )['energy_efficiency'].mean().reset_index()
        
        daily_efficiency.columns = ['date', 'efficiency']
        daily_efficiency = daily_efficiency.sort_values('date')
        
        X = np.arange(len(daily_efficiency)).reshape(-1, 1)
        y = daily_efficiency['efficiency'].values
        
        model = LinearRegression()
        model.fit(X, y)
        
        future_X = np.arange(len(daily_efficiency), len(daily_efficiency) + periods).reshape(-1, 1)
        predictions = model.predict(future_X)
        
        last_date = daily_efficiency['date'].max()
        future_dates = [last_date + timedelta(days=i+1) for i in range(periods)]
        
        prediction_df = pd.DataFrame({
            'date': future_dates,
            'predicted_efficiency': predictions,
            'trend': model.coef_[0]
        })
        
        return prediction_df

    def identify_efficiency_anomalies(self, df, window_size=7, threshold=2):
        df = df.copy()
        df['timestamp'] = pd.to_datetime(df['timestamp'])
        df = self.calculate_energy_efficiency(df)
        
        results = []
        
        for equipment in df['equipment'].unique():
            equip_data = df[df['equipment'] == equipment].copy()
            equip_data = equip_data.sort_values('timestamp')
            
            equip_data['rolling_mean'] = equip_data['energy_efficiency'].rolling(window=window_size).mean()
            equip_data['rolling_std'] = equip_data['energy_efficiency'].rolling(window=window_size).std()
            
            equip_data['upper_bound'] = equip_data['rolling_mean'] + threshold * equip_data['rolling_std']
            equip_data['lower_bound'] = equip_data['rolling_mean'] - threshold * equip_data['rolling_std']
            
            equip_data['is_efficiency_anomaly'] = (
                (equip_data['energy_efficiency'] < equip_data['lower_bound']) |
                (equip_data['energy_efficiency'] > equip_data['upper_bound'])
            ).astype(int)
            
            anomaly_count = equip_data['is_efficiency_anomaly'].sum()
            if anomaly_count > 0:
                results.append({
                    'equipment': equipment,
                    'anomaly_count': anomaly_count,
                    'anomaly_ratio': anomaly_count / len(equip_data) * 100,
                    'avg_efficiency': equip_data['energy_efficiency'].mean()
                })
        
        return pd.DataFrame(results)

    def generate_efficiency_report(self, df):
        report = {}
        
        report['overall_efficiency'] = self.benchmark_analysis(df, level='factory')
        report['equipment_efficiency'] = self.benchmark_analysis(df, level='equipment')
        report['saving_potential'] = self.calculate_energy_saving_potential(df)
        
        low_efficiency = report['equipment_efficiency'][
            report['equipment_efficiency']['energy_efficiency_mean'] < 0.85
        ]
        report['low_efficiency_equipment'] = low_efficiency
        
        report['total_saving_potential'] = report['saving_potential']['saving_potential'].sum()
        
        report['efficiency_anomalies'] = self.identify_efficiency_anomalies(df)
        
        return report
