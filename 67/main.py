import os
import sys
import pandas as pd
from datetime import datetime, timedelta
import warnings
warnings.filterwarnings('ignore')

sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))

from src.data_preprocessing import DataCleaner, DatabaseConnector, BatchDataProcessor
from src.statistics import HierarchicalStatistics, EnergyTraceability
from src.anomaly_detection import AnomalyCluster
from src.visualization import EnergyDashboard, DashboardThemes, LayoutTemplates
from src.reporting import ReportGenerator
from src.attribution_analysis import EnergyLossAttribution, EfficiencyAnalyzer
from src.data_snapshot import DataSnapshotManager


class EnergyAnalysisPipeline:
    def __init__(self):
        self.cleaner = DataCleaner()
        self.db_connector = DatabaseConnector(db_type='influxdb')
        self.stats = HierarchicalStatistics()
        self.traceability = EnergyTraceability()
        self.anomaly_detector = AnomalyCluster()
        self.dashboard = EnergyDashboard()
        self.report_generator = ReportGenerator()
        self.loss_attribution = EnergyLossAttribution()
        self.efficiency_analyzer = EfficiencyAnalyzer()
        self.snapshot_manager = DataSnapshotManager()
        self.batch_processor = BatchDataProcessor()

    def run_full_pipeline(self, start_date=None, end_date=None, generate_reports=True):
        print("=" * 60)
        print("能耗数据分析全流程开始执行")
        print("=" * 60)
        
        if start_date is None:
            start_date = (datetime.now() - timedelta(days=7)).strftime('%Y-%m-%d')
        if end_date is None:
            end_date = datetime.now().strftime('%Y-%m-%d')
        
        print(f"\n1. 数据获取 (时间段: {start_date} 至 {end_date})")
        raw_data = self.db_connector.query_energy_data(
            start_time=start_date,
            end_time=end_date
        )
        print(f"   获取原始数据: {len(raw_data)} 条")
        
        print("\n2. 数据清洗")
        cleaned_data = self.cleaner.clean_pipeline(raw_data)
        print(f"   清洗后数据: {len(cleaned_data)} 条")
        
        print("\n3. 分层统计分析")
        factory_stats = self.stats.get_factory_summary(cleaned_data)
        workshop_stats = self.stats.get_workshop_summary(cleaned_data)
        equipment_stats = self.stats.get_equipment_summary(cleaned_data)
        print(f"   厂区统计: {len(factory_stats)} 条")
        print(f"   车间统计: {len(workshop_stats)} 条")
        print(f"   设备统计: {len(equipment_stats)} 条")
        
        print("\n4. 能耗溯源分析")
        hierarchy_tree = self.traceability.get_energy_hierarchy_tree(cleaned_data)
        hotspots = self.traceability.identify_energy_hotspots(cleaned_data, top_n=5)
        print(f"   识别能耗热点: {len(hotspots)} 个")
        
        print("\n5. 异常能耗检测")
        data_with_anomalies = self.anomaly_detector.mark_anomalies(cleaned_data)
        anomaly_summary = self.anomaly_detector.get_anomaly_summary(data_with_anomalies)
        print(f"   发现异常记录: {anomaly_summary['anomaly_count']} 条")
        print(f"   异常率: {anomaly_summary['anomaly_rate']:.2f}%")
        
        print("\n6. 生成大屏可视化")
        dashboard_path = self.dashboard.generate_html_dashboard(
            cleaned_data,
            anomaly_df=data_with_anomalies,
            output_path='energy_dashboard.html'
        )
        print(f"   大屏已生成: {dashboard_path}")
        
        if generate_reports:
            print("\n7. 生成报表")
            
            daily_report = self.report_generator.generate_daily_report(
                cleaned_data,
                date=end_date
            )
            if daily_report:
                print(f"   日报已生成: {daily_report['excel_path']}")
            
            anomaly_report = self.report_generator.generate_anomaly_report(
                cleaned_data
            )
            if anomaly_report:
                print(f"   异常报告已生成: {anomaly_report['excel_path']}")
        
        print("\n" + "=" * 60)
        print("能耗数据分析全流程执行完成")
        print("=" * 60)
        
        return {
            'raw_data': raw_data,
            'cleaned_data': cleaned_data,
            'factory_stats': factory_stats,
            'workshop_stats': workshop_stats,
            'equipment_stats': equipment_stats,
            'hierarchy_tree': hierarchy_tree,
            'hotspots': hotspots,
            'data_with_anomalies': data_with_anomalies,
            'anomaly_summary': anomaly_summary,
            'dashboard_path': dashboard_path,
            'daily_report': daily_report if generate_reports else None,
            'anomaly_report': anomaly_report if generate_reports else None
        }

    def run_realtime_monitoring(self, callback=None):
        print("启动实时能耗监测...")
        print("按 Ctrl+C 停止监测")
        
        try:
            for data in self.db_connector.consume_realtime_data():
                if callback:
                    callback(data)
                print(f"[{datetime.now().strftime('%Y-%m-%d %H:%M:%S')}] "
                      f"设备: {data.get('equipment', '未知')}, "
                      f"功率: {data.get('power', 0):.1f} kW")
        except KeyboardInterrupt:
            print("\n实时监测已停止")

    def generate_custom_report(self, start_date, end_date, report_name):
        print(f"\n生成自定义报表: {report_name}")
        print(f"时间段: {start_date} 至 {end_date}")
        
        raw_data = self.db_connector.query_energy_data(
            start_time=start_date,
            end_time=end_date
        )
        
        cleaned_data = self.cleaner.clean_pipeline(raw_data)
        
        report = self.report_generator.generate_custom_report(
            cleaned_data,
            start_date=start_date,
            end_date=end_date,
            report_name=report_name
        )
        
        if report:
            print(f"报表已生成: {report['excel_path']}")
        
        return report

    def analyze_equipment(self, equipment_id, start_date=None, end_date=None):
        print(f"\n设备能耗分析: {equipment_id}")
        
        if start_date is None:
            start_date = (datetime.now() - timedelta(days=30)).strftime('%Y-%m-%d')
        if end_date is None:
            end_date = datetime.now().strftime('%Y-%m-%d')
        
        raw_data = self.db_connector.query_energy_data(
            start_time=start_date,
            end_time=end_date
        )
        
        cleaned_data = self.cleaner.clean_pipeline(raw_data)
        
        equipment_data = cleaned_data[cleaned_data['equipment'] == equipment_id].copy()
        
        if len(equipment_data) == 0:
            print(f"未找到设备 {equipment_id} 的数据")
            return None
        
        trace_path = self.traceability.get_contribution_path(cleaned_data, equipment_id)
        drill_down = self.traceability.drill_down_analysis(
            cleaned_data,
            equipment=equipment_id
        )
        
        equipment_anomalies = self.anomaly_detector.mark_anomalies(equipment_data)
        
        print(f"总能耗: {drill_down['total_energy']:.2f} kWh")
        print(f"平均功率: {drill_down['avg_power']:.1f} kW")
        print(f"异常记录: {equipment_anomalies['final_anomaly'].sum()} 条")
        
        return {
            'equipment_data': equipment_data,
            'trace_path': trace_path,
            'drill_down': drill_down,
            'anomalies': equipment_anomalies
        }

    def run_loss_attribution_analysis(self, start_date=None, end_date=None):
        print("\n" + "=" * 60)
        print("能耗损耗归因分析")
        print("=" * 60)
        
        if start_date is None:
            start_date = (datetime.now() - timedelta(days=7)).strftime('%Y-%m-%d')
        if end_date is None:
            end_date = datetime.now().strftime('%Y-%m-%d')
        
        raw_data = self.db_connector.query_energy_data(start_time=start_date, end_time=end_date)
        cleaned_data = self.cleaner.clean_pipeline(raw_data)
        
        print("\n正在分析能耗损耗...")
        loss_analysis = self.loss_attribution.comprehensive_loss_analysis(cleaned_data)
        
        print(f"\n总损耗率: {loss_analysis['total_loss_summary']['loss_rate']:.2f}%")
        print(f"理论能耗: {loss_analysis['total_loss_summary']['theoretical_energy']:.2f} kWh")
        print(f"实际能耗: {loss_analysis['total_loss_summary']['actual_energy']:.2f} kWh")
        
        print("\n损耗分类:")
        for category, percentage in loss_analysis.get('loss_percentage', {}).items():
            loss_value = loss_analysis['loss_breakdown'].get(category, 0)
            print(f"  {category}: {percentage:.1f}% ({loss_value:.2f} kWh)")
        
        print("\n生成节能建议...")
        suggestions = self.loss_attribution.generate_loss_reduction_suggestions(loss_analysis)
        
        print("\n节能建议:")
        for i, s in enumerate(suggestions, 1):
            print(f"\n{i}. [{s['priority'].upper()}] {s['category']}")
            print(f"   建议: {s['suggestion']}")
            print(f"   预计节能: {s['estimated_saving']:.2f} kWh")
        
        efficiency_report = self.efficiency_analyzer.generate_efficiency_report(cleaned_data)
        print(f"\n总节能潜力: {efficiency_report['total_saving_potential']:.2f} kWh")
        
        return {
            'loss_analysis': loss_analysis,
            'suggestions': suggestions,
            'efficiency_report': efficiency_report
        }

    def manage_snapshots(self):
        print("\n" + "=" * 60)
        print("数据快照管理")
        print("=" * 60)
        
        print("\n1. 创建快照")
        print("2. 查看快照列表")
        print("3. 加载快照")
        print("4. 对比快照")
        print("5. 删除快照")
        print("6. 返回")
        
        choice = input("\n请选择操作 (1-6): ").strip()
        
        if choice == '1':
            start_date = input("请输入开始日期 (YYYY-MM-DD): ").strip()
            end_date = input("请输入结束日期 (YYYY-MM-DD): ").strip()
            snapshot_name = input("请输入快照名称: ").strip()
            description = input("请输入快照描述 (可选): ").strip()
            tags = input("请输入标签 (逗号分隔, 可选): ").strip()
            
            if start_date and end_date:
                raw_data = self.db_connector.query_energy_data(start_time=start_date, end_time=end_date)
                cleaned_data = self.cleaner.clean_pipeline(raw_data)
                
                tag_list = tags.split(',') if tags else None
                snapshot_id = self.snapshot_manager.create_snapshot(
                    cleaned_data,
                    snapshot_name=snapshot_name,
                    description=description,
                    tags=tag_list
                )
                print(f"快照已创建: {snapshot_id}")
        
        elif choice == '2':
            snapshots = self.snapshot_manager.list_snapshots()
            print(f"\n共 {len(snapshots)} 个快照:")
            for s in snapshots:
                print(f"\n- {s['snapshot_name']} ({s['snapshot_id']})")
                print(f"  创建时间: {s['created_at']}")
                print(f"  数据量: {s['data_shape'][0]} 条")
                if s.get('description'):
                    print(f"  描述: {s['description']}")
        
        elif choice == '3':
            snapshot_id = input("请输入快照ID: ").strip()
            if snapshot_id:
                df = self.snapshot_manager.load_snapshot(snapshot_id)
                if df is not None:
                    print(f"快照加载成功，共 {len(df)} 条数据")
        
        elif choice == '4':
            snapshot_id_1 = input("请输入第一个快照ID: ").strip()
            snapshot_id_2 = input("请输入第二个快照ID: ").strip()
            if snapshot_id_1 and snapshot_id_2:
                comparison = self.snapshot_manager.compare_snapshots(snapshot_id_1, snapshot_id_2)
                if comparison:
                    print(f"\n对比结果:")
                    print(f"  能耗变化: {comparison.get('energy_diff', 0):.2f} kWh")
                    print(f"  变化率: {comparison.get('energy_change_rate', 0):.2f}%")
        
        elif choice == '5':
            snapshot_id = input("请输入要删除的快照ID: ").strip()
            if snapshot_id:
                self.snapshot_manager.delete_snapshot(snapshot_id)
        
        elif choice == '6':
            return

    def generate_themed_dashboard(self, start_date=None, end_date=None):
        print("\n" + "=" * 60)
        print("自定义大屏可视化")
        print("=" * 60)
        
        print("\n可用主题:")
        themes = DashboardThemes.list_themes()
        for t in themes:
            print(f"  {t['id']}: {t['name']}")
        
        print("\n可用布局:")
        layouts = LayoutTemplates.list_templates()
        for l in layouts:
            print(f"  {l['id']}: {l['name']}")
        
        theme_choice = input("\n请选择主题 (默认dark): ").strip() or 'dark'
        layout_choice = input("请选择布局 (默认standard): ").strip() or 'standard'
        
        if start_date is None:
            start_date = input("请输入开始日期 (YYYY-MM-DD, 默认7天前): ").strip()
            start_date = start_date or (datetime.now() - timedelta(days=7)).strftime('%Y-%m-%d')
        if end_date is None:
            end_date = input("请输入结束日期 (YYYY-MM-DD, 默认今天): ").strip()
            end_date = end_date or datetime.now().strftime('%Y-%m-%d')
        
        raw_data = self.db_connector.query_energy_data(start_time=start_date, end_time=end_date)
        cleaned_data = self.cleaner.clean_pipeline(raw_data)
        
        data_with_anomalies = self.anomaly_detector.mark_anomalies(cleaned_data)
        
        DashboardThemes.apply_theme(self.dashboard.renderer, theme_choice)
        
        theme = DashboardThemes.get_theme(theme_choice)
        output_file = f"dashboard_{theme_choice}_{layout_choice}.html"
        
        dashboard_path = self.dashboard.generate_html_dashboard(
            cleaned_data,
            anomaly_df=data_with_anomalies,
            output_path=output_file
        )
        
        print(f"\n大屏已生成: {dashboard_path}")
        print(f"主题: {theme['name']}, 布局: {layout_choice}")
        
        return dashboard_path

    def process_large_data(self, filepath=None):
        print("\n" + "=" * 60)
        print("大批量数据处理")
        print("=" * 60)
        
        if filepath is None:
            filepath = input("请输入大文件路径 (CSV): ").strip()
        
        if not filepath or not os.path.exists(filepath):
            print("文件不存在")
            return None
        
        print(f"\n开始处理文件: {filepath}")
        
        results = self.batch_processor.process_large_file(filepath, clean=True)
        
        stats = self.batch_processor.get_processing_stats(results)
        print(f"\n处理完成:")
        print(f"  总批次: {stats['total_batches']}")
        print(f"  原始数据: {stats['total_original_rows']} 条")
        print(f"  处理后: {stats['total_processed_rows']} 条")
        print(f"  移除数据: {stats['rows_removed']} 条")
        
        merge_choice = input("\n是否合并批次文件? (y/n): ").strip().lower()
        if merge_choice == 'y':
            batch_files = [r['output_path'] for r in results]
            merged_df = self.batch_processor.merge_batches(batch_files)
            print(f"合并完成，共 {len(merged_df)} 条数据")
        
        return results


def main():
    pipeline = EnergyAnalysisPipeline()
    
    print("\n" + "=" * 60)
    print("能耗数据分析系统 v2.0")
    print("=" * 60)
    print("\n请选择操作:")
    print("1. 运行完整数据分析流程")
    print("2. 生成自定义时间段报表")
    print("3. 分析指定设备")
    print("4. 能耗损耗归因分析")
    print("5. 数据快照管理")
    print("6. 自定义大屏可视化")
    print("7. 大批量数据处理")
    print("8. 启动实时监测")
    print("9. 退出")
    
    choice = input("\n请输入选项 (1-9): ").strip()
    
    if choice == '1':
        start_date = input("请输入开始日期 (YYYY-MM-DD, 默认7天前): ").strip()
        end_date = input("请输入结束日期 (YYYY-MM-DD, 默认今天): ").strip()
        
        if not start_date:
            start_date = None
        if not end_date:
            end_date = None
        
        pipeline.run_full_pipeline(
            start_date=start_date,
            end_date=end_date,
            generate_reports=True
        )
    
    elif choice == '2':
        start_date = input("请输入开始日期 (YYYY-MM-DD): ").strip()
        end_date = input("请输入结束日期 (YYYY-MM-DD): ").strip()
        report_name = input("请输入报表名称: ").strip() or 'custom'
        
        pipeline.generate_custom_report(start_date, end_date, report_name)
    
    elif choice == '3':
        equipment_id = input("请输入设备ID: ").strip()
        if equipment_id:
            pipeline.analyze_equipment(equipment_id)
        else:
            print("设备ID不能为空")
    
    elif choice == '4':
        pipeline.run_loss_attribution_analysis()
    
    elif choice == '5':
        pipeline.manage_snapshots()
    
    elif choice == '6':
        pipeline.generate_themed_dashboard()
    
    elif choice == '7':
        pipeline.process_large_data()
    
    elif choice == '8':
        pipeline.run_realtime_monitoring()
    
    elif choice == '9':
        print("退出系统")
        return
    
    else:
        print("无效选项")


if __name__ == '__main__':
    main()
