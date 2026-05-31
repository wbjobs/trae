import pandas as pd
import numpy as np
from datetime import datetime, timedelta
import os
import json
import pickle
import warnings
warnings.filterwarnings('ignore')

from config.config import DATA_CONFIG


class DataSnapshotManager:
    def __init__(self, snapshot_dir=None):
        if snapshot_dir is None:
            snapshot_dir = os.path.join(DATA_CONFIG.get('processed_data_path', './data'), 'snapshots')
        self.snapshot_dir = snapshot_dir
        self.snapshot_index_file = os.path.join(self.snapshot_dir, 'snapshot_index.json')
        self._ensure_snapshot_dir()
        self._load_snapshot_index()

    def _ensure_snapshot_dir(self):
        if not os.path.exists(self.snapshot_dir):
            os.makedirs(self.snapshot_dir, exist_ok=True)

    def _load_snapshot_index(self):
        if os.path.exists(self.snapshot_index_file):
            try:
                with open(self.snapshot_index_file, 'r', encoding='utf-8') as f:
                    self.snapshot_index = json.load(f)
            except:
                self.snapshot_index = {}
        else:
            self.snapshot_index = {}

    def _save_snapshot_index(self):
        with open(self.snapshot_index_file, 'w', encoding='utf-8') as f:
            json.dump(self.snapshot_index, f, ensure_ascii=False, indent=2)

    def create_snapshot(self, df, snapshot_name=None, description='', tags=None, include_children=None):
        timestamp = datetime.now()
        timestamp_str = timestamp.strftime('%Y%m%d_%H%M%S')
        
        if snapshot_name is None:
            snapshot_name = f"snapshot_{timestamp_str}"
        
        snapshot_id = f"{snapshot_name}_{timestamp_str}"
        
        snapshot_file = os.path.join(self.snapshot_dir, f"{snapshot_id}.pkl")
        
        snapshot_data = {
            'snapshot_id': snapshot_id,
            'snapshot_name': snapshot_name,
            'created_at': timestamp.isoformat(),
            'description': description,
            'tags': tags or [],
            'data_shape': df.shape,
            'data_columns': list(df.columns.tolist()),
            'data_stats': {
                'total_energy': float(df['energy'].sum()),
                'avg_power': float(df['power'].mean()),
                'equipment_count': int(df['equipment'].nunique()),
                'time_range': [
                    df['timestamp'].min().isoformat(),
                    df['timestamp'].max().isoformat()
                ]
            },
            'data': df
        }
        
        with open(snapshot_file, 'wb') as f:
            pickle.dump(snapshot_data, f)
        
        self.snapshot_index[snapshot_id] = {
            'snapshot_id': snapshot_id,
            'snapshot_name': snapshot_name,
            'created_at': timestamp.isoformat(),
            'description': description,
            'tags': tags or [],
            'snapshot_file': snapshot_file,
            'data_shape': list(df.shape),
            'data_stats': snapshot_data['data_stats']
        }
        
        self._save_snapshot_index()
        
        print(f"快照已创建: {snapshot_id}")
        return snapshot_id

    def load_snapshot(self, snapshot_id):
        if snapshot_id not in self.snapshot_index:
            print(f"快照不存在: {snapshot_id}")
            return None
        
        snapshot_info = self.snapshot_index[snapshot_id]
        snapshot_file = snapshot_info['snapshot_file']
        
        if not os.path.exists(snapshot_file):
            print(f"快照文件不存在: {snapshot_file}")
            return None
        
        with open(snapshot_file, 'rb') as f:
            snapshot_data = pickle.load(f)
        
        return snapshot_data['data']

    def get_snapshot_info(self, snapshot_id):
        if snapshot_id not in self.snapshot_index:
            return None
        return self.snapshot_index[snapshot_id]

    def list_snapshots(self, tags=None, name_filter=None):
        snapshots = list(self.snapshot_index.values())
        
        if tags:
            snapshots = [
                s for s in snapshots if any(tag in s.get('tags', []) for tag in tags)
            ]
        
        if name_filter:
            snapshots = [
                s for s in snapshots if name_filter.lower() in s['snapshot_name'].lower()
            ]
        
        return sorted(snapshots, key=lambda x: x['created_at'], reverse=True)

    def delete_snapshot(self, snapshot_id):
        if snapshot_id not in self.snapshot_index:
            print(f"快照不存在: {snapshot_id}")
            return False
        
        snapshot_info = self.snapshot_index[snapshot_id]
        snapshot_file = snapshot_info['snapshot_file']
        
        if os.path.exists(snapshot_file):
            os.remove(snapshot_file)
        
        del self.snapshot_index[snapshot_id]
        self._save_snapshot_index()
        
        print(f"快照已删除: {snapshot_id}")
        return True

    def compare_snapshots(self, snapshot_id_1, snapshot_id_2, metrics=None):
        df1 = self.load_snapshot(snapshot_id_1)
        df2 = self.load_snapshot(snapshot_id_2)
        
        if df1 is None or df2 is None:
            return None
        
        if metrics is None:
            metrics = ['energy', 'power']
        
        comparison = {}
        
        info1 = self.get_snapshot_info(snapshot_id_1)
        info2 = self.get_snapshot_info(snapshot_id_2)
        
        comparison['snapshot_1'] = info1
        comparison['snapshot_2'] = info2
        
        for metric in metrics:
            if metric in df1.columns and metric in df2.columns:
                comparison[f'{metric}_1'] = df1[metric].sum() if metric == 'energy' else df1[metric].mean()
                comparison[f'{metric}_2'] = df2[metric].sum() if metric == 'energy' else df2[metric].mean()
                comparison[f'{metric}_diff'] = comparison[f'{metric}_2'] - comparison[f'{metric}_1']
                comparison[f'{metric}_change_rate'] = (
                    (comparison[f'{metric}_2'] - comparison[f'{metric}_1']) / comparison[f'{metric}_1'] * 100
                    if comparison[f'{metric}_1'] > 0 else 0
                )
        
        comparison['factory_comparison'] = self._compare_by_level(df1, df2, level='factory')
        comparison['workshop_comparison'] = self._compare_by_level(df1, df2, level='workshop')
        
        return comparison

    def _compare_by_level(self, df1, df2, level='factory'):
        agg1 = df1.groupby(level)['energy'].sum().reset_index()
        agg2 = df2.groupby(level)['energy'].sum().reset_index()
        
        merged = pd.merge(
            agg1, agg2, on=level, suffixes=('_1', '_2'), how='outer').fillna(0)
        
        merged['energy_diff'] = merged['energy_2'] - merged['energy_1']
        merged['energy_change_rate'] = (
            (merged['energy_2'] - merged['energy_1']) / merged['energy_1'] * 100
        ).round(2)
        
        return merged.to_dict('records')

    def create_comparison_report(self, snapshot_id_1, snapshot_id_2, output_file='comparison_report.json'):
        comparison = self.compare_snapshots(snapshot_id_1, snapshot_id_2)
        
        report_path = os.path.join(self.snapshot_dir, output_file)
        with open(report_path, 'w', encoding='utf-8') as f:
            json.dump(comparison, f, ensure_ascii=False, indent=2, default=str)
        
        print(f"对比报告已生成: {report_path}")
        return report_path

    def export_snapshot_to_csv(self, snapshot_id, output_file=None):
        df = self.load_snapshot(snapshot_id)
        if df is None:
            return None
        
        if output_file is None:
            output_file = f"{snapshot_id}.csv"
        
        output_path = os.path.join(self.snapshot_dir, output_file)
        df.to_csv(output_path, index=False, encoding='utf-8-sig')
        
        print(f"快照已导出: {output_path}")
        return output_path

    def get_snapshot_stats(self):
        return {
            'total_snapshots': len(self.snapshot_index),
            'snapshots': list(self.snapshot_index.keys())
        }
