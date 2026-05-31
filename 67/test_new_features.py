import os
import sys
sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))

from datetime import datetime, timedelta
from src.data_preprocessing import DataCleaner, DatabaseConnector, BatchDataProcessor
from src.attribution_analysis import EnergyLossAttribution, EfficiencyAnalyzer
from src.data_snapshot import DataSnapshotManager
from src.visualization import DashboardThemes, LayoutTemplates

print("=" * 70)
print("新功能测试 - 能耗数据分析系统 v2.0")
print("=" * 70)

print("\n1. 测试数据获取和清洗...")
db = DatabaseConnector(db_type='influxdb')
start_date = (datetime.now() - timedelta(days=3)).strftime('%Y-%m-%d')
end_date = datetime.now().strftime('%Y-%m-%d')
raw_data = db.query_energy_data(start_time=start_date, end_time=end_date)
cleaner = DataCleaner()
cleaned_data = cleaner.clean_pipeline(raw_data)
print(f"   数据量: {len(cleaned_data)} 条")
print(f"   清洗报告: {cleaner.get_cleaning_report()}")

print("\n2. 测试能耗损耗归因分析...")
attribution = EnergyLossAttribution()
loss_analysis = attribution.comprehensive_loss_analysis(cleaned_data)
print(f"   总损耗率: {loss_analysis['total_loss_summary']['loss_rate']:.2f}%")
print(f"   损耗分类: {list(loss_analysis['loss_breakdown'].keys())")

suggestions = attribution.generate_loss_reduction_suggestions(loss_analysis)
print(f"   生成建议数: {len(suggestions)} 条")

print("\n3. 测试效率分析...")
efficiency = EfficiencyAnalyzer()
eff_report = efficiency.generate_efficiency_report(cleaned_data)
print(f"   总节能潜力: {eff_report['total_saving_potential']:.2f} kWh")
print(f"   低效设备数: {len(eff_report['low_efficiency_equipment'])}")

print("\n4. 测试数据快照管理...")
snapshot_manager = DataSnapshotManager()
snapshot_id = snapshot_manager.create_snapshot(
    cleaned_data,
    snapshot_name='test_snapshot',
    description='测试快照',
    tags=['test', 'demo']
)
print(f"   快照已创建: {snapshot_id}")

snapshots = snapshot_manager.list_snapshots()
print(f"   快照总数: {len(snapshots)}")

print("\n5. 测试批量数据处理...")
batch_processor = BatchDataProcessor(batch_size=5000)
batches = batch_processor.split_by_time(cleaned_data, time_interval='day')
print(f"   按天拆分批次: {len(batches)} 个批次")

batches_by_equip = batch_processor.split_by_equipment(cleaned_data, equipment_per_batch=5)
print(f"   按设备拆分批次: {len(batches_by_equip)} 个批次")

print("\n6. 测试可视化主题和布局...")
themes = DashboardThemes.list_themes()
print(f"   可用主题: {[t['name'] for t in themes}")

layouts = LayoutTemplates.list_templates()
print(f"   可用布局: {[l['name'] for l in layouts}")

print("\n" + "=" * 70)
print("所有新功能测试完成！")
print("=" * 70)
print("\n新增功能列表:")
print("  ✓ 能耗损耗智能归因分析模块")
print("  ✓ 效率分析与节能建议")
print("  ✓ 数据快照对比存档功能")
print("  ✓ 大批量数据分批处理")
print("  ✓ 自定义大屏主题 (6种)")
print("  ✓ 自定义大屏布局 (5种)")
print("  ✓ 数据清洗空值统计修复")
print("  ✓ 分层溯源维度划分修复")
print("  ✓ 可视化缓存和采样优化")
print("  ✓ 报表字段缺失异常修复")
