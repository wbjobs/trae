import os
from datetime import datetime, timedelta

BASE_DIR = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))

DATA_CONFIG = {
    'raw_data_path': os.path.join(BASE_DIR, 'data', 'raw'),
    'processed_data_path': os.path.join(BASE_DIR, 'data', 'processed'),
    'mock_data_path': os.path.join(BASE_DIR, 'data', 'mock'),
    'report_output_path': os.path.join(BASE_DIR, 'data', 'reports'),
}

DATABASE_CONFIG = {
    'influxdb': {
        'host': 'localhost',
        'port': 8086,
        'username': 'admin',
        'password': 'admin',
        'database': 'energy_db',
        'measurement': 'energy_consumption',
    },
    'mongodb': {
        'host': 'localhost',
        'port': 27017,
        'database': 'energy_analysis',
        'collection': 'anomaly_records',
    },
    'kafka': {
        'bootstrap_servers': ['localhost:9092'],
        'topic': 'energy_real_time',
        'group_id': 'energy_consumer_group',
    }
}

HIERARCHY_CONFIG = {
    'levels': ['factory', 'workshop', 'equipment'],
    'level_names': {
        'factory': '厂区',
        'workshop': '车间',
        'equipment': '设备',
    },
    'factory_list': ['厂区A', '厂区B', '厂区C'],
    'workshop_list': ['冲压车间', '焊接车间', '装配车间', '涂装车间', '机加工车间'],
}

TIME_CONFIG = {
    'data_start_date': (datetime.now() - timedelta(days=30)).strftime('%Y-%m-%d'),
    'data_end_date': datetime.now().strftime('%Y-%m-%d'),
    'time_granularity': ['hour', 'day', 'week', 'month'],
    'timezone': 'Asia/Shanghai',
}

ANOMALY_CONFIG = {
    'clustering_method': 'isolation_forest',
    'contamination': 0.05,
    'n_clusters': 5,
    'anomaly_threshold': 2.0,
    'features': ['power', 'current', 'voltage', 'power_factor'],
}

VISUALIZATION_CONFIG = {
    'dashboard_title': '能耗实时监测大屏',
    'refresh_interval': 5000,
    'chart_colors': ['#FF6B6B', '#4ECDC4', '#45B7D1', '#96CEB4', '#FFEAA7', '#DDA0DD', '#98D8C8'],
    'background_color': '#0F172A',
    'text_color': '#E2E8F0',
}

EXPORT_CONFIG = {
    'report_formats': ['excel', 'pdf', 'csv'],
    'default_format': 'excel',
    'template_path': os.path.join(BASE_DIR, 'config', 'templates'),
}

ATTRIBUTION_CONFIG = {
    'loss_categories': ['设备老化损耗', '运行效率损耗', '非工作时间损耗', '空载运行损耗', '电网波动损耗'],
    'efficiency_thresholds': {
        'excellent': 0.95,
        'good': 0.85,
        'average': 0.75,
        'poor': 0.6,
    },
    'aging_factor_threshold': 15.0,
    'off_hours_ratio_threshold': 30.0,
    'no_load_ratio_threshold': 20.0,
}

BATCH_PROCESSING_CONFIG = {
    'default_batch_size': 10000,
    'batch_output_dir': os.path.join(BASE_DIR, 'data', 'processed', 'batches'),
    'max_memory_usage': '4GB',
}

SNAPSHOT_CONFIG = {
    'snapshot_dir': os.path.join(BASE_DIR, 'data', 'snapshots'),
    'auto_snapshot': False,
    'snapshot_interval_hours': 24,
    'max_snapshots': 100,
}

VISUALIZATION_THEME_CONFIG = {
    'default_theme': 'dark',
    'default_layout': 'standard',
    'available_themes': ['dark', 'light', 'blue', 'green', 'purple', 'orange'],
    'available_layouts': ['standard', 'compact', 'focus_trend', 'anomaly_focus', 'full_screen'],
}
