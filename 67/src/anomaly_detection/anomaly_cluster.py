import pandas as pd
import numpy as np
from datetime import datetime, timedelta
import warnings
warnings.filterwarnings('ignore')

from .clustering import ClusteringAnalyzer
from config.config import ANOMALY_CONFIG


class AnomalyCluster:
    def __init__(self, method='isolation_forest'):
        self.clustering = ClusteringAnalyzer(method=method)
        self.anomaly_threshold = ANOMALY_CONFIG.get('anomaly_threshold', 2.0)

    def detect_anomalies(self, df, features=None, group_by=None):
        df = df.copy()
        df['is_anomaly'] = 0
        df['anomaly_score'] = 0.0
        df['cluster'] = -1
        
        if group_by and group_by in df.columns:
            groups = df.groupby(group_by)
            
            for group_name, group_data in groups:
                if len(group_data) < 10:
                    continue
                
                try:
                    result = self.clustering.fit(group_data, features=features)
                    mask = df[group_by] == group_name
                    df.loc[mask, 'is_anomaly'] = result['is_anomaly'].values
                    df.loc[mask, 'anomaly_score'] = result.get('anomaly_score', 0).values if 'anomaly_score' in result.columns else 0
                    df.loc[mask, 'cluster'] = result['cluster'].values
                except Exception as e:
                    print(f"群组 {group_name} 异常检测失败: {e}")
        else:
            result = self.clustering.fit(df, features=features)
            df['is_anomaly'] = result['is_anomaly']
            if 'anomaly_score' in result.columns:
                df['anomaly_score'] = result['anomaly_score']
            df['cluster'] = result['cluster']
        
        return df

    def detect_by_statistics(self, df, columns=None, method='zscore'):
        df = df.copy()
        
        if columns is None:
            columns = ['power', 'current', 'energy']
        
        df['is_anomaly_stat'] = 0
        
        for col in columns:
            if col not in df.columns:
                continue
            
            if method == 'zscore':
                mean = df[col].mean()
                std = df[col].std()
                z_scores = abs((df[col] - mean) / std)
                df[f'{col}_zscore'] = z_scores
                df.loc[z_scores > self.anomaly_threshold, 'is_anomaly_stat'] = 1
            
            elif method == 'iqr':
                Q1 = df[col].quantile(0.25)
                Q3 = df[col].quantile(0.75)
                IQR = Q3 - Q1
                lower = Q1 - 1.5 * IQR
                upper = Q3 + 1.5 * IQR
                df[f'{col}_iqr_anomaly'] = ((df[col] < lower) | (df[col] > upper)).astype(int)
                df.loc[df[f'{col}_iqr_anomaly'] == 1, 'is_anomaly_stat'] = 1
        
        return df

    def detect_temporal_anomalies(self, df, level='equipment'):
        df = df.copy()
        df['timestamp'] = pd.to_datetime(df['timestamp'])
        df = df.sort_values([level, 'timestamp'])
        
        df['power_diff'] = df.groupby(level)['power'].diff()
        df['power_pct_change'] = df.groupby(level)['power'].pct_change()
        
        df['is_spike'] = 0
        spike_threshold = df['power_pct_change'].quantile(0.99)
        df.loc[df['power_pct_change'].abs() > spike_threshold, 'is_spike'] = 1
        
        df['is_anomaly_temporal'] = df['is_spike']
        
        return df

    def get_anomaly_summary(self, df):
        total_records = len(df)
        anomaly_count = df['is_anomaly'].sum()
        anomaly_rate = anomaly_count / total_records * 100
        
        summary = {
            'total_records': total_records,
            'anomaly_count': int(anomaly_count),
            'anomaly_rate': round(anomaly_rate, 2),
            'normal_count': int(total_records - anomaly_count),
        }
        
        if 'cluster' in df.columns:
            cluster_stats = df.groupby('cluster').agg({
                'is_anomaly': ['count', 'sum'],
                'power': 'mean',
                'energy': 'sum'
            }).reset_index()
            cluster_stats.columns = ['cluster', 'count', 'anomaly_count', 'avg_power', 'total_energy']
            summary['cluster_details'] = cluster_stats.to_dict('records')
        
        return summary

    def get_anomaly_by_level(self, df, level='equipment'):
        anomaly_by_level = df.groupby([level, 'factory', 'workshop']).agg({
            'is_anomaly': ['count', 'sum'],
            'anomaly_score': 'mean',
            'power': 'mean',
            'energy': 'sum'
        }).reset_index()
        
        anomaly_by_level.columns = [
            level, 'factory', 'workshop', 'total_records', 
            'anomaly_count', 'avg_anomaly_score', 'avg_power', 'total_energy'
        ]
        
        anomaly_by_level['anomaly_rate'] = (
            anomaly_by_level['anomaly_count'] / anomaly_by_level['total_records'] * 100
        ).round(2)
        
        anomaly_by_level = anomaly_by_level.sort_values('anomaly_count', ascending=False)
        
        return anomaly_by_level

    def get_anomaly_timeline(self, df, time_granularity='hour'):
        df = df.copy()
        df['timestamp'] = pd.to_datetime(df['timestamp'])
        
        if time_granularity == 'hour':
            df['time_period'] = df['timestamp'].dt.to_period('H')
        elif time_granularity == 'day':
            df['time_period'] = df['timestamp'].dt.to_period('D')
        elif time_granularity == 'week':
            df['time_period'] = df['timestamp'].dt.to_period('W')
        
        timeline = df.groupby('time_period').agg({
            'is_anomaly': ['count', 'sum'],
            'energy': 'sum'
        }).reset_index()
        
        timeline.columns = ['time_period', 'total_records', 'anomaly_count', 'total_energy']
        timeline['anomaly_rate'] = (timeline['anomaly_count'] / timeline['total_records'] * 100).round(2)
        timeline['time_period'] = timeline['time_period'].astype(str)
        
        return timeline

    def analyze_anomaly_patterns(self, df):
        anomalies = df[df['is_anomaly'] == 1].copy()
        
        patterns = {}
        
        patterns['by_factory'] = anomalies.groupby('factory').size().sort_values(ascending=False).to_dict()
        patterns['by_workshop'] = anomalies.groupby(['factory', 'workshop']).size().sort_values(ascending=False).to_dict()
        patterns['by_equipment'] = anomalies.groupby(['factory', 'workshop', 'equipment']).size().sort_values(ascending=False).head(10).to_dict()
        
        anomalies['hour'] = anomalies['timestamp'].dt.hour
        patterns['by_hour'] = anomalies.groupby('hour').size().sort_values(ascending=False).to_dict()
        
        anomalies['weekday'] = anomalies['timestamp'].dt.weekday
        patterns['by_weekday'] = anomalies.groupby('weekday').size().to_dict()
        
        return patterns

    def generate_anomaly_alerts(self, df, min_anomalies=5, min_rate=1.0):
        alerts = []
        
        equipment_stats = self.get_anomaly_by_level(df, level='equipment')
        
        high_risk = equipment_stats[
            (equipment_stats['anomaly_count'] >= min_anomalies) & 
            (equipment_stats['anomaly_rate'] >= min_rate)
        ]
        
        for _, row in high_risk.iterrows():
            alert = {
                'level': 'equipment',
                'factory': row['factory'],
                'workshop': row['workshop'],
                'equipment': row['equipment'],
                'anomaly_count': row['anomaly_count'],
                'anomaly_rate': row['anomaly_rate'],
                'avg_anomaly_score': row['avg_anomaly_score'],
                'severity': self._calculate_severity(row['anomaly_rate']),
                'alert_time': datetime.now().strftime('%Y-%m-%d %H:%M:%S')
            }
            alerts.append(alert)
        
        return alerts

    def _calculate_severity(self, anomaly_rate):
        if anomaly_rate >= 10:
            return 'critical'
        elif anomaly_rate >= 5:
            return 'high'
        elif anomaly_rate >= 2:
            return 'medium'
        else:
            return 'low'

    def mark_anomalies(self, df, features=None):
        df_with_anomalies = self.detect_anomalies(df, features=features)
        df_with_anomalies = self.detect_by_statistics(df_with_anomalies)
        df_with_anomalies = self.detect_temporal_anomalies(df_with_anomalies)
        
        df_with_anomalies['final_anomaly'] = (
            (df_with_anomalies['is_anomaly'] == 1) | 
            (df_with_anomalies['is_anomaly_stat'] == 1) | 
            (df_with_anomalies['is_anomaly_temporal'] == 1)
        ).astype(int)
        
        return df_with_anomalies
