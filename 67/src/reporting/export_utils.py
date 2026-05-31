import pandas as pd
import numpy as np
import os
from datetime import datetime
import json
import warnings
warnings.filterwarnings('ignore')

from config.config import EXPORT_CONFIG, DATA_CONFIG


class ExportUtils:
    def __init__(self):
        self.output_path = DATA_CONFIG.get('report_output_path', './reports')
        self._ensure_output_dir()

    def _ensure_output_dir(self):
        if not os.path.exists(self.output_path):
            os.makedirs(self.output_path)

    def to_excel(self, df, filename, sheet_name='Sheet1', **kwargs):
        filepath = os.path.join(self.output_path, f"{filename}.xlsx")
        
        try:
            with pd.ExcelWriter(filepath, engine='openpyxl') as writer:
                if isinstance(df, dict):
                    for sheet, data in df.items():
                        data.to_excel(writer, sheet_name=sheet, index=False, **kwargs)
                else:
                    df.to_excel(writer, sheet_name=sheet_name, index=False, **kwargs)
            print(f"Excel文件已导出: {filepath}")
            return filepath
        except Exception as e:
            print(f"导出Excel失败: {e}")
            return None

    def to_csv(self, df, filename, **kwargs):
        filepath = os.path.join(self.output_path, f"{filename}.csv")
        
        try:
            if isinstance(df, dict):
                for name, data in df.items():
                    single_filepath = os.path.join(self.output_path, f"{filename}_{name}.csv")
                    data.to_csv(single_filepath, index=False, encoding='utf-8-sig', **kwargs)
                print(f"CSV文件已导出: {self.output_path}/{filename}_*.csv")
                return self.output_path
            else:
                df.to_csv(filepath, index=False, encoding='utf-8-sig', **kwargs)
                print(f"CSV文件已导出: {filepath}")
                return filepath
        except Exception as e:
            print(f"导出CSV失败: {e}")
            return None

    def to_json(self, data, filename, indent=2):
        filepath = os.path.join(self.output_path, f"{filename}.json")
        
        try:
            with open(filepath, 'w', encoding='utf-8') as f:
                json.dump(data, f, ensure_ascii=False, indent=indent, default=str)
            print(f"JSON文件已导出: {filepath}")
            return filepath
        except Exception as e:
            print(f"导出JSON失败: {e}")
            return None

    def to_html(self, content, filename):
        filepath = os.path.join(self.output_path, f"{filename}.html")
        
        try:
            with open(filepath, 'w', encoding='utf-8') as f:
                f.write(content)
            print(f"HTML文件已导出: {filepath}")
            return filepath
        except Exception as e:
            print(f"导出HTML失败: {e}")
            return None

    def format_number(self, value, decimals=2):
        if pd.isna(value):
            return '-'
        return round(value, decimals)

    def format_percentage(self, value, decimals=2):
        if pd.isna(value):
            return '-'
        return f"{round(value * 100, decimals)}%"

    def format_datetime(self, value, format_str='%Y-%m-%d %H:%M:%S'):
        if pd.isna(value):
            return '-'
        if isinstance(value, str):
            return value
        return value.strftime(format_str)

    def generate_filename(self, prefix, report_type):
        timestamp = datetime.now().strftime('%Y%m%d_%H%M%S')
        return f"{prefix}_{report_type}_{timestamp}"

    def get_export_formats(self):
        return EXPORT_CONFIG.get('report_formats', ['excel', 'csv', 'json'])

    def export_auto(self, data, filename_prefix, report_type, formats=None):
        if formats is None:
            formats = self.get_export_formats()
        
        results = {}
        
        for fmt in formats:
            filename = self.generate_filename(filename_prefix, report_type)
            
            if fmt == 'excel':
                results['excel'] = self.to_excel(data, filename)
            elif fmt == 'csv':
                results['csv'] = self.to_csv(data, filename)
            elif fmt == 'json':
                results['json'] = self.to_json(data, filename)
        
        return results

    def create_data_summary(self, df):
        summary = {
            '基本信息': {
                '数据行数': len(df),
                '数据列数': len(df.columns),
                '列名': list(df.columns),
                '内存占用': f"{df.memory_usage(deep=True).sum() / 1024 / 1024:.2f} MB"
            },
            '数值统计': df.describe().to_dict(),
            '缺失值统计': df.isnull().sum().to_dict(),
            '数据类型': df.dtypes.astype(str).to_dict()
        }
        return summary
