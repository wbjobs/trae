import pandas as pd
import numpy as np
from datetime import datetime, timedelta
import warnings
warnings.filterwarnings('ignore')


class DataCleaner:
    def __init__(self):
        self.required_columns = [
            'timestamp', 'factory', 'workshop', 'equipment',
            'power', 'current', 'voltage', 'power_factor', 'energy'
        ]
        self.cleaning_stats = {}

    def load_data(self, filepath):
        try:
            if filepath.endswith('.csv'):
                df = pd.read_csv(filepath)
            elif filepath.endswith('.xlsx') or filepath.endswith('.xls'):
                df = pd.read_excel(filepath)
            else:
                raise ValueError("不支持的文件格式")
            return df
        except Exception as e:
            print(f"加载数据失败: {e}")
            return None

    def validate_data(self, df):
        if df is None or df.empty:
            return False, "数据为空"
        
        missing_cols = [col for col in self.required_columns if col not in df.columns]
        if missing_cols:
            return False, f"缺少必要列: {missing_cols}"
        
        return True, "数据验证通过"

    def handle_missing_values(self, df):
        df = df.copy()
        missing_stats = {}
        
        for col in df.columns:
            missing_count = df[col].isnull().sum()
            if missing_count > 0:
                missing_stats[col] = {
                    'count': int(missing_count),
                    'percentage': round(missing_count / len(df) * 100, 2)
                }
        
        self.cleaning_stats['original_missing'] = missing_stats
        
        numeric_cols = ['power', 'current', 'voltage', 'power_factor', 'energy']
        for col in numeric_cols:
            if col in df.columns:
                df[col] = pd.to_numeric(df[col], errors='coerce')
                
                if df[col].isnull().all():
                    df[col] = 0
                    print(f"警告: 列 {col} 全部为空，已填充为0")
                else:
                    if not df[col].isnull().all():
                        df[col] = df[col].interpolate(method='linear', limit_direction='both')
                    
                    col_mean = df[col].mean()
                    if pd.isna(col_mean):
                        col_mean = 0
                    df[col] = df[col].fillna(col_mean)
        
        categorical_cols = ['factory', 'workshop', 'equipment']
        for col in categorical_cols:
            if col in df.columns:
                df[col] = df[col].fillna(method='ffill')
                df[col] = df[col].fillna(method='bfill')
                df[col] = df[col].fillna('未知')
        
        if 'timestamp' in df.columns:
            df['timestamp'] = pd.to_datetime(df['timestamp'], errors='coerce')
            before_count = len(df)
            df = df.dropna(subset=['timestamp'])
            after_count = len(df)
            if before_count != after_count:
                print(f"删除无效时间戳记录: {before_count - after_count} 条")
        
        remaining_missing = {}
        for col in df.columns:
            missing_count = df[col].isnull().sum()
            if missing_count > 0:
                remaining_missing[col] = int(missing_count)
        
        self.cleaning_stats['remaining_missing'] = remaining_missing
        
        return df

    def remove_duplicates(self, df):
        df = df.copy()
        df = df.drop_duplicates(subset=['timestamp', 'factory', 'workshop', 'equipment'], keep='last')
        return df

    def handle_outliers(self, df, columns=None, method='iqr', threshold=1.5):
        df = df.copy()
        
        if columns is None:
            columns = ['power', 'current', 'voltage', 'power_factor', 'energy']
        
        for col in columns:
            if col not in df.columns:
                continue
            
            if method == 'iqr':
                Q1 = df[col].quantile(0.25)
                Q3 = df[col].quantile(0.75)
                IQR = Q3 - Q1
                lower_bound = Q1 - threshold * IQR
                upper_bound = Q3 + threshold * IQR
                df[col] = df[col].clip(lower=lower_bound, upper=upper_bound)
            
            elif method == 'zscore':
                mean = df[col].mean()
                std = df[col].std()
                df[col] = df[col].clip(lower=mean - threshold * std, upper=mean + threshold * std)
        
        return df

    def normalize_data(self, df):
        df = df.copy()
        
        df['factory'] = df['factory'].str.strip()
        df['workshop'] = df['workshop'].str.strip()
        df['equipment'] = df['equipment'].str.strip()
        
        if 'voltage' in df.columns:
            df['voltage'] = df['voltage'].apply(lambda x: x if x > 100 else x * 1000)
        
        if 'power_factor' in df.columns:
            df['power_factor'] = df['power_factor'].clip(0, 1)
        
        df = df.sort_values(['factory', 'workshop', 'equipment', 'timestamp'])
        
        return df

    def add_time_features(self, df):
        df = df.copy()
        df['timestamp'] = pd.to_datetime(df['timestamp'])
        df['hour'] = df['timestamp'].dt.hour
        df['day'] = df['timestamp'].dt.day
        df['weekday'] = df['timestamp'].dt.weekday
        df['month'] = df['timestamp'].dt.month
        df['date'] = df['timestamp'].dt.date
        df['is_weekend'] = (df['weekday'] >= 5).astype(int)
        df['is_work_hour'] = ((df['hour'] >= 8) & (df['hour'] < 22)).astype(int)
        return df

    def generate_derived_features(self, df):
        df = df.copy()
        
        if all(col in df.columns for col in ['voltage', 'current', 'power_factor']):
            df['calculated_power'] = df['voltage'] * df['current'] * df['power_factor'] / 1000
        
        if 'power' in df.columns:
            df['power_deviation'] = df.groupby(['factory', 'workshop', 'equipment'])['power'].transform(
                lambda x: x - x.mean()
            )
        
        return df

    def get_missing_stats(self, df):
        missing_data = []
        for col in df.columns:
            missing_count = df[col].isnull().sum()
            missing_percentage = missing_count / len(df) * 100
            missing_data.append({
                'column': col,
                'missing_count': int(missing_count),
                'missing_percentage': round(missing_percentage, 2),
                'dtype': str(df[col].dtype)
            })
        return pd.DataFrame(missing_data)

    def clean_pipeline(self, df):
        if df is None:
            return None
        
        is_valid, msg = self.validate_data(df)
        if not is_valid:
            print(f"数据验证失败: {msg}")
            return None
        
        self.cleaning_stats = {
            'original_rows': len(df),
            'original_columns': len(df.columns),
            'start_time': datetime.now().strftime('%Y-%m-%d %H:%M:%S')
        }
        
        print("开始数据清洗...")
        print(f"原始数据量: {len(df)} 行, {len(df.columns)} 列")
        
        df = self.handle_missing_values(df)
        print(f"缺失值处理完成，剩余数据量: {len(df)}")
        
        df = self.remove_duplicates(df)
        print(f"去重完成，剩余数据量: {len(df)}")
        
        df = self.handle_outliers(df)
        print("异常值处理完成")
        
        df = self.normalize_data(df)
        print("数据标准化完成")
        
        df = self.add_time_features(df)
        print("时间特征添加完成")
        
        df = self.generate_derived_features(df)
        print("衍生特征生成完成")
        
        self.cleaning_stats['final_rows'] = len(df)
        self.cleaning_stats['final_columns'] = len(df.columns)
        self.cleaning_stats['end_time'] = datetime.now().strftime('%Y-%m-%d %H:%M:%S')
        self.cleaning_stats['rows_removed'] = self.cleaning_stats['original_rows'] - len(df)
        
        print(f"清洗完成: 保留 {len(df)} 行数据，移除 {self.cleaning_stats['rows_removed']} 行")
        
        return df

    def get_cleaning_report(self):
        return self.cleaning_stats

    def save_cleaned_data(self, df, output_path):
        try:
            df.to_csv(output_path, index=False, encoding='utf-8-sig')
            print(f"清洗后数据已保存至: {output_path}")
            return True
        except Exception as e:
            print(f"保存数据失败: {e}")
            return False
