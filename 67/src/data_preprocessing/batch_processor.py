import pandas as pd
import numpy as np
from datetime import datetime, timedelta
import os
import gc
import warnings
warnings.filterwarnings('ignore')

from .data_cleaner import DataCleaner


class BatchDataProcessor:
    def __init__(self, batch_size=10000, output_dir='./data/processed'):
        self.batch_size = batch_size
        self.output_dir = output_dir
        self.cleaner = DataCleaner()
        self._ensure_output_dir()

    def _ensure_output_dir(self):
        if not os.path.exists(self.output_dir):
            os.makedirs(self.output_dir)

    def split_by_time(self, df, time_interval='day'):
        df = df.copy()
        df['timestamp'] = pd.to_datetime(df['timestamp'])
        
        if time_interval == 'hour':
            df['batch_key'] = df['timestamp'].dt.to_period('H')
        elif time_interval == 'day':
            df['batch_key'] = df['timestamp'].dt.to_period('D')
        elif time_interval == 'week':
            df['batch_key'] = df['timestamp'].dt.to_period('W')
        elif time_interval == 'month':
            df['batch_key'] = df['timestamp'].dt.to_period('M')
        else:
            raise ValueError(f"不支持的时间间隔: {time_interval}")
        
        batches = []
        for key, group in df.groupby('batch_key'):
            batch_data = group.drop(columns=['batch_key']).copy()
            batches.append({
                'key': str(key),
                'data': batch_data,
                'rows': len(batch_data)
            })
        
        return batches

    def split_by_equipment(self, df, equipment_per_batch=10):
        equipments = df['equipment'].unique()
        batches = []
        
        for i in range(0, len(equipments), equipment_per_batch):
            batch_equipments = equipments[i:i + equipment_per_batch]
            batch_data = df[df['equipment'].isin(batch_equipments)].copy()
            batches.append({
                'key': f"batch_{i // equipment_per_batch}",
                'equipments': batch_equipments.tolist(),
                'data': batch_data,
                'rows': len(batch_data)
            })
        
        return batches

    def split_by_rows(self, df):
        batches = []
        total_rows = len(df)
        
        for i in range(0, total_rows, self.batch_size):
            batch_data = df.iloc[i:i + self.batch_size].copy()
            batches.append({
                'key': f"batch_{i // self.batch_size}",
                'start_idx': i,
                'end_idx': min(i + self.batch_size, total_rows),
                'data': batch_data,
                'rows': len(batch_data)
            })
        
        return batches

    def process_batches(self, batches, process_func=None, save_to_disk=True):
        results = []
        
        for i, batch in enumerate(batches):
            print(f"处理批次 {i+1}/{len(batches)}: {batch['key']}, {batch['rows']} 条")
            
            processed_data = batch['data']
            
            if process_func:
                try:
                    processed_data = process_func(batch['data'])
                except Exception as e:
                    print(f"批次 {batch['key']} 处理失败: {e}")
                    continue
            
            result = {
                'key': batch['key'],
                'original_rows': batch['rows'],
                'processed_rows': len(processed_data) if isinstance(processed_data) else 0
            }
            
            if save_to_disk:
                output_path = os.path.join(self.output_dir, f"batch_{batch['key']}.csv")
                processed_data.to_csv(output_path, index=False, encoding='utf-8-sig')
                result['output_path'] = output_path
            
            results.append(result)
            
            batch['data'] = None
            del processed_data
            gc.collect()
        
        return results

    def process_large_file(self, filepath, clean=True, process_func=None):
        results = []
        batch_num = 0
        
        print(f"开始处理大文件: {filepath}")
        
        reader = pd.read_csv(filepath, chunksize=self.batch_size) if filepath.endswith('.csv') else None
        
        if not reader:
            raise ValueError("仅支持CSV大文件处理")
        
        for chunk in reader:
            batch_num += 1
            print(f"处理批次 {batch_num}: {len(chunk)} 条")
            
            if clean:
                chunk = self.cleaner.clean_pipeline(chunk)
            
            if process_func:
                chunk = process_func(chunk)
            
            output_path = os.path.join(self.output_dir, f"batch_{batch_num:04d}.csv")
            chunk.to_csv(output_path, index=False, encoding='utf-8-sig')
            
            results.append({
                'batch_num': batch_num,
                'rows': len(chunk),
                'output_path': output_path
            })
            
            del chunk
            gc.collect()
        
        print(f"大文件处理完成，共 {batch_num} 个批次")
        
        return results

    def merge_batches(self, batch_files, output_file='merged_result.csv'):
        dfs = []
        
        for batch_file in batch_files:
            df = pd.read_csv(batch_file)
            dfs.append(df)
            print(f"加载批次: {batch_file}")
        
        merged_df = pd.concat(dfs, ignore_index=True)
        
        output_path = os.path.join(self.output_dir, output_file)
        merged_df.to_csv(output_path, index=False, encoding='utf-8-sig')
        
        print(f"合并完成，共 {len(merged_df)} 条数据")
        
        return merged_df

    def get_processing_stats(self, results):
        total_original = sum(r.get('original_rows', 0) for r in results)
        total_processed = sum(r.get('processed_rows', 0) for r in results)
        
        return {
            'total_batches': len(results),
            'total_original_rows': total_original,
            'total_processed_rows': total_processed,
            'rows_removed': total_original - total_processed
        }
