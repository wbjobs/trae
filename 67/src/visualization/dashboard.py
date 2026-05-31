import pandas as pd
import numpy as np
from plotly.subplots import make_subplots
import plotly.graph_objects as go
from datetime import datetime, timedelta
import json
import warnings
warnings.filterwarnings('ignore')

from .charts import ChartRenderer
from config.config import VISUALIZATION_CONFIG


class EnergyDashboard:
    def __init__(self, max_data_points=10000, enable_cache=True):
        self.renderer = ChartRenderer()
        self.title = VISUALIZATION_CONFIG['dashboard_title']
        self.refresh_interval = VISUALIZATION_CONFIG['refresh_interval']
        self.charts = {}
        self.max_data_points = max_data_points
        self.enable_cache = enable_cache
        self._cache = {}
        self._cache_timestamp = None

    def _sample_data(self, df):
        if len(df) <= self.max_data_points:
            return df
        
        sample_rate = max(1, len(df) // self.max_data_points)
        sampled = df.iloc[::sample_rate].copy()
        print(f"数据采样: {len(df)} -> {len(sampled)} 条 (采样率 1/{sample_rate})")
        return sampled

    def _get_cache_key(self, df, anomaly_df=None):
        if not self.enable_cache:
            return None
        
        key_parts = [
            str(len(df)),
            str(df['timestamp'].min()),
            str(df['timestamp'].max()),
            str(df['energy'].sum())
        ]
        if anomaly_df is not None:
            key_parts.append(str(len(anomaly_df)))
            key_parts.append(str(anomaly_df['is_anomaly'].sum()))
        
        return '_'.join(key_parts)

    def prepare_dashboard_data(self, df, anomaly_df=None, use_sampling=True):
        cache_key = self._get_cache_key(df, anomaly_df)
        
        if self.enable_cache and cache_key and cache_key in self._cache:
            print("使用缓存数据")
            return self._cache[cache_key]
        
        df_working = self._sample_data(df) if use_sampling else df.copy()
        df_working['timestamp'] = pd.to_datetime(df_working['timestamp'])
        
        dashboard_data = {}
        
        dashboard_data['total_energy'] = float(df['energy'].sum())
        dashboard_data['avg_power'] = float(df['power'].mean())
        dashboard_data['peak_power'] = float(df['power'].max())
        dashboard_data['equipment_count'] = int(df['equipment'].nunique())
        
        if anomaly_df is not None:
            dashboard_data['anomaly_count'] = int(anomaly_df['is_anomaly'].sum())
            dashboard_data['anomaly_rate'] = float(anomaly_df['is_anomaly'].mean() * 100)
        
        hourly_data = df.groupby(df['timestamp'].dt.hour)['energy'].sum().reset_index()
        hourly_data.columns = ['hour', 'energy']
        dashboard_data['hourly_trend'] = hourly_data
        
        daily_data = df.groupby(df['timestamp'].dt.date)['energy'].sum().reset_index()
        daily_data.columns = ['date', 'energy']
        daily_data['date'] = daily_data['date'].astype(str)
        dashboard_data['daily_trend'] = daily_data
        
        factory_data = df.groupby('factory')['energy'].sum().reset_index()
        dashboard_data['factory_distribution'] = factory_data
        
        workshop_data = df.groupby(['factory', 'workshop'])['energy'].sum().reset_index()
        dashboard_data['workshop_distribution'] = workshop_data
        
        top_equipment = df.groupby('equipment')['energy'].sum().sort_values(ascending=False).head(10).reset_index()
        dashboard_data['top_equipment'] = top_equipment
        
        if anomaly_df is not None:
            anomaly_timeline = anomaly_df.groupby(anomaly_df['timestamp'].dt.date)['is_anomaly'].sum().reset_index()
            anomaly_timeline.columns = ['date', 'anomaly_count']
            anomaly_timeline['date'] = anomaly_timeline['date'].astype(str)
            dashboard_data['anomaly_timeline'] = anomaly_timeline
        
        if self.enable_cache and cache_key:
            self._cache[cache_key] = dashboard_data
            self._cache_timestamp = datetime.now()
            if len(self._cache) > 10:
                self._cache.clear()
        
        return dashboard_data

    def create_kpi_section(self, dashboard_data):
        kpi_figures = {}
        
        kpi_figures['total_energy'] = self.renderer.create_kpi_card(
            title='总能耗',
            value=f"{dashboard_data['total_energy']:.2f}",
            subtitle='kWh',
            delta='较昨日 +5.2%'
        )
        
        kpi_figures['avg_power'] = self.renderer.create_kpi_card(
            title='平均功率',
            value=f"{dashboard_data['avg_power']:.1f}",
            subtitle='kW',
            delta='较昨日 -2.1%'
        )
        
        kpi_figures['peak_power'] = self.renderer.create_kpi_card(
            title='峰值功率',
            value=f"{dashboard_data['peak_power']:.1f}",
            subtitle='kW'
        )
        
        kpi_figures['equipment_count'] = self.renderer.create_kpi_card(
            title='监控设备',
            value=dashboard_data['equipment_count'],
            subtitle='台'
        )
        
        if 'anomaly_count' in dashboard_data:
            kpi_figures['anomaly_count'] = self.renderer.create_kpi_card(
                title='异常记录',
                value=dashboard_data['anomaly_count'],
                subtitle=f"异常率: {dashboard_data['anomaly_rate']:.1f}%"
            )
        
        return kpi_figures

    def create_trend_charts(self, dashboard_data):
        trend_figures = {}
        
        trend_figures['hourly_trend'] = self.renderer.create_line_chart(
            dashboard_data['hourly_trend'],
            x_col='hour',
            y_col='energy',
            title='24小时能耗趋势',
            x_title='小时',
            y_title='能耗 (kWh)'
        )
        
        trend_figures['daily_trend'] = self.renderer.create_bar_chart(
            dashboard_data['daily_trend'],
            x_col='date',
            y_col='energy',
            title='每日能耗统计',
            x_title='日期',
            y_title='能耗 (kWh)'
        )
        
        return trend_figures

    def create_distribution_charts(self, dashboard_data):
        dist_figures = {}
        
        dist_figures['factory_pie'] = self.renderer.create_pie_chart(
            dashboard_data['factory_distribution'],
            labels_col='factory',
            values_col='energy',
            title='各厂区能耗占比'
        )
        
        dist_figures['workshop_bar'] = self.renderer.create_bar_chart(
            dashboard_data['workshop_distribution'],
            x_col='workshop',
            y_col='energy',
            title='各车间能耗对比',
            x_title='车间',
            y_title='能耗 (kWh)'
        )
        
        dist_figures['top_equipment'] = self.renderer.create_bar_chart(
            dashboard_data['top_equipment'],
            x_col='equipment',
            y_col='energy',
            title='Top 10 高能耗设备',
            x_title='设备',
            y_title='能耗 (kWh)'
        )
        
        return dist_figures

    def create_anomaly_charts(self, dashboard_data, anomaly_df):
        anomaly_figures = {}
        
        if 'anomaly_timeline' in dashboard_data:
            anomaly_figures['anomaly_timeline'] = self.renderer.create_line_chart(
                dashboard_data['anomaly_timeline'],
                x_col='date',
                y_col='anomaly_count',
                title='异常事件时间分布',
                x_title='日期',
                y_title='异常次数'
            )
        
        if anomaly_df is not None and len(anomaly_df) > 0:
            sample_df = anomaly_df.sample(min(1000, len(anomaly_df)))
            anomaly_figures['anomaly_scatter'] = self.renderer.create_anomaly_scatter(
                sample_df,
                x_col='timestamp',
                y_col='power',
                anomaly_col='is_anomaly',
                title='功率异常分布'
            )
        
        return anomaly_figures

    def create_full_dashboard(self, df, anomaly_df=None, lazy_load=False):
        dashboard_data = self.prepare_dashboard_data(df, anomaly_df)
        
        dashboard = {
            'title': self.title,
            'generated_at': datetime.now().strftime('%Y-%m-%d %H:%M:%S'),
            'refresh_interval': self.refresh_interval,
            'kpi_cards': self.create_kpi_section(dashboard_data),
            'data': dashboard_data
        }
        
        if not lazy_load:
            dashboard['trend_charts'] = self.create_trend_charts(dashboard_data)
            dashboard['distribution_charts'] = self.create_distribution_charts(dashboard_data)
            
            if anomaly_df is not None:
                dashboard['anomaly_charts'] = self.create_anomaly_charts(dashboard_data, anomaly_df)
        else:
            dashboard['lazy_load'] = True
            dashboard['available_charts'] = ['trend_charts', 'distribution_charts']
            if anomaly_df is not None:
                dashboard['available_charts'].append('anomaly_charts')
        
        return dashboard

    def load_charts_lazy(self, dashboard_data, anomaly_df=None, chart_types=None):
        result = {}
        
        if chart_types is None or 'trend_charts' in chart_types:
            result['trend_charts'] = self.create_trend_charts(dashboard_data)
        
        if chart_types is None or 'distribution_charts' in chart_types:
            result['distribution_charts'] = self.create_distribution_charts(dashboard_data)
        
        if chart_types is None or 'anomaly_charts' in chart_types:
            if anomaly_df is not None:
                result['anomaly_charts'] = self.create_anomaly_charts(dashboard_data, anomaly_df)
        
        return result

    def generate_html_dashboard(self, df, anomaly_df=None, output_path='dashboard.html'):
        dashboard = self.create_full_dashboard(df, anomaly_df)
        
        html_content = f"""
<!DOCTYPE html>
<html>
<head>
    <title>{dashboard['title']}</title>
    <meta charset="utf-8">
    <style>
        body {{
            margin: 0;
            padding: 20px;
            background-color: {self.renderer.bg_color};
            color: {self.renderer.text_color};
            font-family: Arial, sans-serif;
        }}
        .header {{
            text-align: center;
            margin-bottom: 30px;
        }}
        .kpi-section {{
            display: grid;
            grid-template-columns: repeat(auto-fit, minmax(200px, 1fr));
            gap: 20px;
            margin-bottom: 30px;
        }}
        .kpi-card {{
            background: rgba(255,255,255,0.05);
            padding: 20px;
            border-radius: 10px;
            text-align: center;
        }}
        .kpi-value {{
            font-size: 36px;
            font-weight: bold;
            color: {self.renderer.colors[1]};
        }}
        .kpi-title {{
            font-size: 14px;
            margin-bottom: 10px;
        }}
        .charts-grid {{
            display: grid;
            grid-template-columns: 1fr 1fr;
            gap: 20px;
            margin-bottom: 30px;
        }}
        .chart-container {{
            background: rgba(255,255,255,0.05);
            padding: 20px;
            border-radius: 10px;
        }}
        @media (max-width: 1200px) {{
            .charts-grid {{
                grid-template-columns: 1fr;
            }}
        }}
    </style>
</head>
<body>
    <div class="header">
        <h1>{dashboard['title']}</h1>
        <p>生成时间: {dashboard['generated_at']}</p>
    </div>
    
    <div class="kpi-section">
        <div class="kpi-card">
            <div class="kpi-title">总能耗</div>
            <div class="kpi-value">{dashboard['data']['total_energy']:.2f} kWh</div>
        </div>
        <div class="kpi-card">
            <div class="kpi-title">平均功率</div>
            <div class="kpi-value">{dashboard['data']['avg_power']:.1f} kW</div>
        </div>
        <div class="kpi-card">
            <div class="kpi-title">峰值功率</div>
            <div class="kpi-value">{dashboard['data']['peak_power']:.1f} kW</div>
        </div>
        <div class="kpi-card">
            <div class="kpi-title">监控设备</div>
            <div class="kpi-value">{dashboard['data']['equipment_count']} 台</div>
        </div>
        {'<div class="kpi-card"><div class="kpi-title">异常记录</div><div class="kpi-value">' + str(dashboard['data'].get('anomaly_count', 0)) + '</div></div>' if anomaly_df is not None else ''}
    </div>
    
    <div id="charts-container"></div>
    
    <script src="https://cdn.plot.ly/plotly-latest.min.js"></script>
    <script>
        const dashboardData = {json.dumps(self._serialize_figures(dashboard))};
        
        function renderCharts() {{
            const container = document.getElementById('charts-container');
            
            let allCharts = {{
                ...dashboardData.trend_charts,
                ...dashboardData.distribution_charts,
                ...(dashboardData.anomaly_charts || {{}})
            }};
            
            Object.keys(allCharts).forEach((key, index) => {{
                const chartDiv = document.createElement('div');
                chartDiv.className = 'chart-container';
                chartDiv.id = `chart-${{key}}`;
                container.appendChild(chartDiv);
                
                Plotly.newPlot(`chart-${{key}}`, allCharts[key].data, allCharts[key].layout);
            }});
        }}
        
        renderCharts();
    </script>
</body>
</html>
"""
        
        with open(output_path, 'w', encoding='utf-8') as f:
            f.write(html_content)
        
        print(f"大屏可视化已生成: {output_path}")
        return output_path

    def _serialize_figures(self, dashboard):
        serialized = {
            'trend_charts': {},
            'distribution_charts': {},
            'anomaly_charts': {}
        }
        
        for key, fig in dashboard['trend_charts'].items():
            serialized['trend_charts'][key] = fig.to_dict()
        
        for key, fig in dashboard['distribution_charts'].items():
            serialized['distribution_charts'][key] = fig.to_dict()
        
        if 'anomaly_charts' in dashboard:
            for key, fig in dashboard['anomaly_charts'].items():
                serialized['anomaly_charts'][key] = fig.to_dict()
        
        return serialized

    def get_realtime_data_callback(self, data_source_func):
        def callback():
            df = data_source_func()
            dashboard_data = self.prepare_dashboard_data(df)
            return {
                'timestamp': datetime.now().strftime('%Y-%m-%d %H:%M:%S'),
                'data': dashboard_data
            }
        return callback
