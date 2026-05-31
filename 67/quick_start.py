import os
import sys
sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))

from datetime import datetime, timedelta
from src.data_preprocessing import DataCleaner, DatabaseConnector
from src.statistics import HierarchicalStatistics, EnergyTraceability
from src.anomaly_detection import AnomalyCluster
from src.visualization import EnergyDashboard
from src.reporting import ReportGenerator

print("=" * 60)
print("能耗数据分析系统 - 快速验证")
print("=" * 60)

print("\n1. 测试数据库连接和数据获取...")
db = DatabaseConnector(db_type='influxdb')
start_date = (datetime.now() - timedelta(days=1)).strftime('%Y-%m-%d')
end_date = datetime.now().strftime('%Y-%m-%d')
raw_data = db.query_energy_data(start_time=start_date, end_time=end_date)
print(f"   原始数据量: {len(raw_data)} 条")
print(f"   列名: {list(raw_data.columns)}")

print("\n2. 测试数据清洗...")
cleaner = DataCleaner()
cleaned_data = cleaner.clean_pipeline(raw_data)
print(f"   清洗后数据量: {len(cleaned_data)} 条")

print("\n3. 测试分层统计...")
stats = HierarchicalStatistics()
factory_stats = stats.get_factory_summary(cleaned_data, time_granularity='day')
print(f"   厂区统计行数: {len(factory_stats)}")
print(factory_stats[['factory', 'energy_sum', 'power_mean']].head())

print("\n4. 测试能耗溯源...")
traceability = EnergyTraceability()
hierarchy_tree = traceability.get_energy_hierarchy_tree(cleaned_data)
print(f"   厂区数量: {len(hierarchy_tree)}")
for factory in hierarchy_tree:
    print(f"   - {factory['name']}: {factory['value']:.2f} kWh ({factory['percentage']:.1f}%)")

print("\n5. 测试异常检测...")
anomaly_detector = AnomalyCluster(method='isolation_forest')
data_with_anomalies = anomaly_detector.detect_anomalies(cleaned_data)
anomaly_count = data_with_anomalies['is_anomaly'].sum()
print(f"   异常数据量: {anomaly_count} 条")
print(f"   异常率: {anomaly_count / len(cleaned_data) * 100:.2f}%")

print("\n6. 测试可视化大屏...")
dashboard = EnergyDashboard()
dashboard_path = dashboard.generate_html_dashboard(
    cleaned_data,
    anomaly_df=data_with_anomalies,
    output_path='test_dashboard.html'
)
print(f"   大屏已生成: {dashboard_path}")

print("\n7. 测试报表生成...")
reporter = ReportGenerator()
daily_report = reporter.generate_daily_report(cleaned_data, date=end_date)
if daily_report:
    print(f"   日报已生成: {daily_report['excel_path']}")

anomaly_report = reporter.generate_anomaly_report(cleaned_data)
if anomaly_report:
    print(f"   异常报告已生成: {anomaly_report['excel_path']}")

print("\n" + "=" * 60)
print("所有模块测试通过！")
print("=" * 60)
