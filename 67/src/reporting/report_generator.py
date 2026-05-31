import pandas as pd
import numpy as np
import os
from datetime import datetime, timedelta
import warnings
warnings.filterwarnings('ignore')

from .export_utils import ExportUtils
from src.statistics import HierarchicalStatistics, EnergyTraceability
from src.anomaly_detection import AnomalyCluster


class ReportGenerator:
    def __init__(self):
        self.exporter = ExportUtils()
        self.stats = HierarchicalStatistics()
        self.traceability = EnergyTraceability()
        self.anomaly_detector = AnomalyCluster()

    def generate_daily_report(self, df, date=None):
        if date is None:
            date = datetime.now().strftime('%Y-%m-%d')
        
        df['timestamp'] = pd.to_datetime(df['timestamp'])
        daily_df = df[df['timestamp'].dt.date == pd.to_datetime(date).date()].copy()
        
        if len(daily_df) == 0:
            print(f"日期 {date} 没有数据")
            return None
        
        report_data = self._build_report_data(daily_df, 'daily', date)
        
        filename = f"能耗日报_{date}"
        return self._export_report(report_data, filename)

    def generate_weekly_report(self, df, year, week):
        df['timestamp'] = pd.to_datetime(df['timestamp'])
        weekly_df = df[
            (df['timestamp'].dt.isocalendar().year == year) & 
            (df['timestamp'].dt.isocalendar().week == week)
        ].copy()
        
        if len(weekly_df) == 0:
            print(f"{year}年第{week}周没有数据")
            return None
        
        report_data = self._build_report_data(weekly_df, 'weekly', f"{year}年第{week}周")
        
        filename = f"能耗周报_{year}W{week}"
        return self._export_report(report_data, filename)

    def generate_monthly_report(self, df, year, month):
        df['timestamp'] = pd.to_datetime(df['timestamp'])
        monthly_df = df[
            (df['timestamp'].dt.year == year) & 
            (df['timestamp'].dt.month == month)
        ].copy()
        
        if len(monthly_df) == 0:
            print(f"{year}年{month}月没有数据")
            return None
        
        report_data = self._build_report_data(monthly_df, 'monthly', f"{year}年{month}月")
        
        filename = f"能耗月报_{year}{month:02d}"
        return self._export_report(report_data, filename)

    def generate_custom_report(self, df, start_date, end_date, report_name='custom'):
        df['timestamp'] = pd.to_datetime(df['timestamp'])
        custom_df = df[
            (df['timestamp'] >= start_date) & 
            (df['timestamp'] <= end_date)
        ].copy()
        
        if len(custom_df) == 0:
            print(f"时间段 {start_date} 至 {end_date} 没有数据")
            return None
        
        period = f"{start_date} 至 {end_date}"
        report_data = self._build_report_data(custom_df, 'custom', period)
        
        filename = f"能耗自定义报表_{report_name}"
        return self._export_report(report_data, filename)

    def _safe_get(self, df, col, default=0):
        if col in df.columns:
            return df[col]
        return default

    def _safe_numeric(self, value, default=0.0):
        if pd.isna(value) or value is None:
            return default
        try:
            return float(value)
        except:
            return default

    def _build_report_data(self, df, report_type, period):
        report_data = {}
        
        report_data['report_info'] = {
            'report_type': report_type,
            'period': period,
            'generated_at': datetime.now().strftime('%Y-%m-%d %H:%M:%S'),
            'data_points': len(df)
        }
        
        summary = {}
        summary['total_energy'] = self._safe_numeric(df['energy'].sum() if 'energy' in df.columns else 0)
        summary['avg_power'] = self._safe_numeric(df['power'].mean() if 'power' in df.columns else 0)
        summary['peak_power'] = self._safe_numeric(df['power'].max() if 'power' in df.columns else 0)
        summary['equipment_count'] = int(df['equipment'].nunique() if 'equipment' in df.columns else 0)
        summary['factory_count'] = int(df['factory'].nunique() if 'factory' in df.columns else 0)
        summary['workshop_count'] = int(df['workshop'].nunique() if 'workshop' in df.columns else 0)
        report_data['summary'] = summary
        
        try:
            report_data['factory_stats'] = self.stats.get_factory_summary(df, time_granularity='day')
        except Exception as e:
            print(f"厂区统计生成失败: {e}")
            report_data['factory_stats'] = pd.DataFrame()
        
        try:
            report_data['workshop_stats'] = self.stats.get_workshop_summary(df, time_granularity='day')
        except Exception as e:
            print(f"车间统计生成失败: {e}")
            report_data['workshop_stats'] = pd.DataFrame()
        
        try:
            report_data['top_consumers'] = self.stats.get_top_n_consumers(df, level='equipment', n=10)
        except Exception as e:
            print(f"Top设备统计生成失败: {e}")
            report_data['top_consumers'] = pd.DataFrame()
        
        try:
            report_data['energy_benchmark'] = self.stats.get_energy_benchmark(df, level='workshop')
        except Exception as e:
            print(f"能耗基准生成失败: {e}")
            report_data['energy_benchmark'] = pd.DataFrame()
        
        try:
            report_data['time_distribution'] = self.stats.get_time_distribution(df, level='factory')
        except Exception as e:
            print(f"时间分布生成失败: {e}")
            report_data['time_distribution'] = pd.DataFrame()
        
        try:
            df_with_anomaly = self.anomaly_detector.mark_anomalies(df)
            anomaly_summary = self.anomaly_detector.get_anomaly_summary(df_with_anomaly)
            report_data['anomaly_summary'] = anomaly_summary
            
            if anomaly_summary.get('anomaly_count', 0) > 0:
                try:
                    report_data['anomaly_by_equipment'] = self.anomaly_detector.get_anomaly_by_level(
                        df_with_anomaly, level='equipment'
                    ).head(10)
                except Exception as e:
                    print(f"异常设备统计生成失败: {e}")
                
                try:
                    report_data['anomaly_alerts'] = self.anomaly_detector.generate_anomaly_alerts(df_with_anomaly)
                except Exception as e:
                    print(f"异常告警生成失败: {e}")
        except Exception as e:
            print(f"异常检测失败: {e}")
            report_data['anomaly_summary'] = {'anomaly_count': 0, 'anomaly_rate': 0}
        
        try:
            report_data['hierarchy_tree'] = self.traceability.get_energy_hierarchy_tree(df)
        except Exception as e:
            print(f"层级树生成失败: {e}")
            report_data['hierarchy_tree'] = []
        
        try:
            report_data['energy_hotspots'] = self.traceability.identify_energy_hotspots(df, top_n=5)
        except Exception as e:
            print(f"热点识别失败: {e}")
            report_data['energy_hotspots'] = []
        
        try:
            if 'timestamp' in df.columns and 'energy' in df.columns:
                daily_trend = df.groupby(df['timestamp'].dt.date)['energy'].sum().reset_index()
                daily_trend.columns = ['date', 'energy']
                daily_trend['date'] = daily_trend['date'].astype(str)
                report_data['daily_trend'] = daily_trend
        except Exception as e:
            print(f"每日趋势生成失败: {e}")
            report_data['daily_trend'] = pd.DataFrame()
        
        try:
            if 'timestamp' in df.columns and 'energy' in df.columns:
                hourly_trend = df.groupby(df['timestamp'].dt.hour)['energy'].sum().reset_index()
                hourly_trend.columns = ['hour', 'energy']
                report_data['hourly_trend'] = hourly_trend
        except Exception as e:
            print(f"小时趋势生成失败: {e}")
            report_data['hourly_trend'] = pd.DataFrame()
        
        return report_data

    def _export_report(self, report_data, filename):
        export_data = {}
        
        try:
            summary_df = pd.DataFrame([report_data.get('summary', {})])
            export_data['报告概览'] = summary_df
        except Exception as e:
            print(f"报告概览导出失败: {e}")
        
        try:
            factory_stats = report_data.get('factory_stats', pd.DataFrame())
            if not factory_stats.empty:
                export_data['厂区统计'] = factory_stats
        except Exception as e:
            print(f"厂区统计导出失败: {e}")
        
        try:
            workshop_stats = report_data.get('workshop_stats', pd.DataFrame())
            if not workshop_stats.empty:
                export_data['车间统计'] = workshop_stats
        except Exception as e:
            print(f"车间统计导出失败: {e}")
        
        try:
            top_consumers = report_data.get('top_consumers', pd.DataFrame())
            if not top_consumers.empty:
                export_data['Top10高能耗设备'] = top_consumers
        except Exception as e:
            print(f"Top设备导出失败: {e}")
        
        try:
            energy_benchmark = report_data.get('energy_benchmark', pd.DataFrame())
            if not energy_benchmark.empty:
                export_data['能耗基准'] = energy_benchmark
        except Exception as e:
            print(f"能耗基准导出失败: {e}")
        
        try:
            time_distribution = report_data.get('time_distribution', pd.DataFrame())
            if not time_distribution.empty:
                export_data['时间分布'] = time_distribution.reset_index() if hasattr(time_distribution, 'reset_index') else time_distribution
        except Exception as e:
            print(f"时间分布导出失败: {e}")
        
        try:
            anomaly_summary = report_data.get('anomaly_summary', {})
            if anomaly_summary:
                anomaly_df = pd.DataFrame([anomaly_summary])
                export_data['异常概览'] = anomaly_df
        except Exception as e:
            print(f"异常概览导出失败: {e}")
        
        try:
            anomaly_by_equipment = report_data.get('anomaly_by_equipment', pd.DataFrame())
            if not anomaly_by_equipment.empty:
                export_data['异常设备'] = anomaly_by_equipment
        except Exception as e:
            print(f"异常设备导出失败: {e}")
        
        try:
            daily_trend = report_data.get('daily_trend', pd.DataFrame())
            if not daily_trend.empty:
                export_data['每日趋势'] = daily_trend
        except Exception as e:
            print(f"每日趋势导出失败: {e}")
        
        try:
            hourly_trend = report_data.get('hourly_trend', pd.DataFrame())
            if not hourly_trend.empty:
                export_data['小时趋势'] = hourly_trend
        except Exception as e:
            print(f"小时趋势导出失败: {e}")
        
        try:
            excel_path = self.exporter.to_excel(export_data, filename)
        except Exception as e:
            print(f"Excel导出失败: {e}")
            excel_path = None
        
        try:
            json_path = self.exporter.to_json(report_data, filename)
        except Exception as e:
            print(f"JSON导出失败: {e}")
            json_path = None
        
        return {
            'report_data': report_data,
            'excel_path': excel_path,
            'json_path': json_path
        }

    def generate_anomaly_report(self, df, output_filename=None):
        df_with_anomaly = self.anomaly_detector.mark_anomalies(df)
        
        anomaly_data = df_with_anomaly[df_with_anomaly['final_anomaly'] == 1].copy()
        
        if len(anomaly_data) == 0:
            print("没有发现异常数据")
            return None
        
        report_data = {}
        report_data['report_info'] = {
            'report_type': 'anomaly',
            'generated_at': datetime.now().strftime('%Y-%m-%d %H:%M:%S'),
            'total_anomalies': len(anomaly_data),
            'anomaly_rate': len(anomaly_data) / len(df) * 100
        }
        
        report_data['anomaly_summary'] = self.anomaly_detector.get_anomaly_summary(df_with_anomaly)
        report_data['anomaly_by_equipment'] = self.anomaly_detector.get_anomaly_by_level(
            df_with_anomaly, level='equipment'
        )
        report_data['anomaly_by_workshop'] = self.anomaly_detector.get_anomaly_by_level(
            df_with_anomaly, level='workshop'
        )
        report_data['anomaly_by_factory'] = self.anomaly_detector.get_anomaly_by_level(
            df_with_anomaly, level='factory'
        )
        report_data['anomaly_timeline'] = self.anomaly_detector.get_anomaly_timeline(
            df_with_anomaly, time_granularity='day'
        )
        report_data['anomaly_patterns'] = self.anomaly_detector.analyze_anomaly_patterns(df_with_anomaly)
        report_data['anomaly_alerts'] = self.anomaly_detector.generate_anomaly_alerts(df_with_anomaly)
        report_data['anomaly_details'] = anomaly_data[[
            'timestamp', 'factory', 'workshop', 'equipment',
            'power', 'current', 'voltage', 'energy',
            'is_anomaly', 'anomaly_score', 'cluster'
        ]]
        
        if output_filename is None:
            output_filename = f"异常能耗报告_{datetime.now().strftime('%Y%m%d')}"
        
        export_data = {
            '异常概览': pd.DataFrame([report_data['anomaly_summary']]),
            '设备异常统计': report_data['anomaly_by_equipment'],
            '车间异常统计': report_data['anomaly_by_workshop'],
            '厂区异常统计': report_data['anomaly_by_factory'],
            '异常时间线': report_data['anomaly_timeline'],
            '异常告警': pd.DataFrame(report_data['anomaly_alerts']),
            '异常详情': report_data['anomaly_details']
        }
        
        excel_path = self.exporter.to_excel(export_data, output_filename)
        json_path = self.exporter.to_json(report_data, output_filename)
        
        return {
            'report_data': report_data,
            'excel_path': excel_path,
            'json_path': json_path
        }

    def generate_energy_traceability_report(self, df, equipment_id=None, output_filename=None):
        if equipment_id:
            trace_path = self.traceability.get_contribution_path(df, equipment_id)
            drill_down = self.traceability.drill_down_analysis(df, equipment=equipment_id)
            
            report_data = {
                'equipment_id': equipment_id,
                'trace_path': trace_path,
                'drill_down': drill_down
            }
        else:
            hierarchy_tree = self.traceability.get_energy_hierarchy_tree(df)
            hotspots = self.traceability.identify_energy_hotspots(df)
            
            report_data = {
                'hierarchy_tree': hierarchy_tree,
                'hotspots': hotspots
            }
        
        if output_filename is None:
            output_filename = f"能耗溯源报告_{datetime.now().strftime('%Y%m%d')}"
        
        json_path = self.exporter.to_json(report_data, output_filename)
        
        return {
            'report_data': report_data,
            'json_path': json_path
        }
