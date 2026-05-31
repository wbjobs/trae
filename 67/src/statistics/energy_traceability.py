import pandas as pd
import numpy as np
from datetime import datetime, timedelta
import warnings
warnings.filterwarnings('ignore')


class EnergyTraceability:
    def __init__(self):
        self.traceability_chain = ['factory', 'workshop', 'equipment']

    def trace_energy_flow(self, df, target_level='equipment', target_value=None, time_range=None):
        df = df.copy()
        df['timestamp'] = pd.to_datetime(df['timestamp'])
        
        if time_range:
            start_time, end_time = time_range
            df = df[(df['timestamp'] >= start_time) & (df['timestamp'] <= end_time)]
        
        trace_data = {}
        
        factory_energy = df.groupby('factory')['energy'].sum().sort_values(ascending=False)
        trace_data['factory'] = factory_energy.to_dict()
        
        workshop_energy = df.groupby(['factory', 'workshop'])['energy'].sum().reset_index()
        workshop_energy = workshop_energy.sort_values('energy', ascending=False)
        trace_data['workshop'] = workshop_energy.to_dict('records')
        
        equipment_energy = df.groupby(['factory', 'workshop', 'equipment'])['energy'].sum().reset_index()
        equipment_energy = equipment_energy.sort_values('energy', ascending=False)
        trace_data['equipment'] = equipment_energy.to_dict('records')
        
        trace_data['total_energy'] = df['energy'].sum()
        
        if target_value:
            trace_data['target_trace'] = self._trace_target(df, target_level, target_value)
        
        return trace_data

    def _trace_target(self, df, target_level, target_value):
        result = {}
        
        if target_level == 'equipment':
            equip_data = df[df['equipment'] == target_value]
            if len(equip_data) > 0:
                result['equipment'] = target_value
                result['workshop'] = equip_data['workshop'].iloc[0]
                result['factory'] = equip_data['factory'].iloc[0]
                result['total_energy'] = equip_data['energy'].sum()
                result['contribution_to_workshop'] = (
                    equip_data['energy'].sum() / 
                    df[df['workshop'] == result['workshop']]['energy'].sum() * 100
                )
                result['contribution_to_factory'] = (
                    equip_data['energy'].sum() / 
                    df[df['factory'] == result['factory']]['energy'].sum() * 100
                )
        
        elif target_level == 'workshop':
            workshop_data = df[df['workshop'] == target_value]
            if len(workshop_data) > 0:
                result['workshop'] = target_value
                result['factory'] = workshop_data['factory'].iloc[0]
                result['total_energy'] = workshop_data['energy'].sum()
                result['contribution_to_factory'] = (
                    workshop_data['energy'].sum() / 
                    df[df['factory'] == result['factory']]['energy'].sum() * 100
                )
                result['equipment_breakdown'] = workshop_data.groupby('equipment')['energy'].sum().to_dict()
        
        elif target_level == 'factory':
            factory_data = df[df['factory'] == target_value]
            if len(factory_data) > 0:
                result['factory'] = target_value
                result['total_energy'] = factory_data['energy'].sum()
                result['workshop_breakdown'] = factory_data.groupby('workshop')['energy'].sum().to_dict()
        
        return result

    def drill_down_analysis(self, df, factory=None, workshop=None, equipment=None):
        result = {}
        df_filtered = df.copy()
        
        if factory:
            df_filtered = df_filtered[df_filtered['factory'] == factory]
            result['factory'] = factory
            result['workshops'] = df_filtered['workshop'].unique().tolist()
        
        if workshop:
            df_filtered = df_filtered[df_filtered['workshop'] == workshop]
            result['workshop'] = workshop
            result['equipment'] = df_filtered['equipment'].unique().tolist()
        
        if equipment:
            df_filtered = df_filtered[df_filtered['equipment'] == equipment]
            result['equipment'] = equipment
        
        result['total_energy'] = df_filtered['energy'].sum()
        result['avg_power'] = df_filtered['power'].mean()
        result['data_points'] = len(df_filtered)
        result['time_range'] = [df_filtered['timestamp'].min(), df_filtered['timestamp'].max()]
        
        result['hourly_distribution'] = df_filtered.groupby(
            df_filtered['timestamp'].dt.hour
        )['energy'].sum().to_dict()
        
        result['daily_distribution'] = df_filtered.groupby(
            df_filtered['timestamp'].dt.weekday
        )['energy'].sum().to_dict()
        
        return result

    def roll_up_analysis(self, df, target_level='factory'):
        result = {}
        
        if target_level == 'factory':
            factory_stats = df.groupby('factory').agg({
                'energy': 'sum',
                'power': 'mean',
                'equipment': 'nunique'
            }).reset_index()
            factory_stats['energy_percentage'] = (
                factory_stats['energy'] / factory_stats['energy'].sum() * 100
            ).round(2)
            result['factory_summary'] = factory_stats.to_dict('records')
        
        elif target_level == 'workshop':
            workshop_stats = df.groupby(['factory', 'workshop']).agg({
                'energy': 'sum',
                'power': 'mean',
                'equipment': 'nunique'
            }).reset_index()
            workshop_stats['energy_percentage'] = (
                workshop_stats.groupby('factory')['energy'].transform(
                    lambda x: x / x.sum() * 100
                )
            ).round(2)
            result['workshop_summary'] = workshop_stats.to_dict('records')
        
        elif target_level == 'equipment':
            equipment_stats = df.groupby(['factory', 'workshop', 'equipment']).agg({
                'energy': 'sum',
                'power': 'mean'
            }).reset_index()
            equipment_stats['energy_percentage'] = (
                equipment_stats.groupby(['factory', 'workshop'])['energy'].transform(
                    lambda x: x / x.sum() * 100
                )
            ).round(2)
            result['equipment_summary'] = equipment_stats.to_dict('records')
        
        result['total_energy'] = df['energy'].sum()
        result['total_equipment'] = df['equipment'].nunique()
        
        return result

    def get_energy_hierarchy_tree(self, df):
        tree = []
        
        factories = df['factory'].unique()
        
        for factory in factories:
            factory_data = df[df['factory'] == factory]
            factory_energy = factory_data['energy'].sum()
            
            workshops = factory_data['workshop'].unique()
            workshop_list = []
            
            for workshop in workshops:
                workshop_data = factory_data[factory_data['workshop'] == workshop]
                workshop_energy = workshop_data['energy'].sum()
                
                equipment_list = workshop_data.groupby('equipment')['energy'].sum().reset_index()
                equipment_nodes = [
                    {
                        'name': row['equipment'],
                        'value': round(row['energy'], 4),
                        'percentage': round(row['energy'] / workshop_energy * 100, 2)
                    }
                    for _, row in equipment_list.iterrows()
                ]
                
                workshop_list.append({
                    'name': workshop,
                    'value': round(workshop_energy, 4),
                    'percentage': round(workshop_energy / factory_energy * 100, 2),
                    'children': equipment_nodes
                })
            
            tree.append({
                'name': factory,
                'value': round(factory_energy, 4),
                'percentage': round(factory_energy / df['energy'].sum() * 100, 2),
                'children': workshop_list
            })
        
        return tree

    def identify_energy_hotspots(self, df, top_n=5):
        hotspots = []
        
        factory_hotspots = df.groupby('factory')['energy'].sum().sort_values(ascending=False).head(top_n)
        for name, value in factory_hotspots.items():
            hotspots.append({
                'level': 'factory',
                'name': name,
                'energy': value,
                'percentage': value / df['energy'].sum() * 100
            })
        
        workshop_hotspots = df.groupby(['factory', 'workshop'])['energy'].sum().sort_values(ascending=False).head(top_n)
        for (factory, workshop), value in workshop_hotspots.items():
            hotspots.append({
                'level': 'workshop',
                'name': f"{factory} - {workshop}",
                'energy': value,
                'percentage': value / df['energy'].sum() * 100
            })
        
        equipment_hotspots = df.groupby(['factory', 'workshop', 'equipment'])['energy'].sum().sort_values(ascending=False).head(top_n)
        for (factory, workshop, equipment), value in equipment_hotspots.items():
            hotspots.append({
                'level': 'equipment',
                'name': f"{factory} - {workshop} - {equipment}",
                'energy': value,
                'percentage': value / df['energy'].sum() * 100
            })
        
        return hotspots

    def get_contribution_path(self, df, equipment_id):
        equip_data = df[df['equipment'] == equipment_id]
        
        if len(equip_data) == 0:
            return None
        
        factory = equip_data['factory'].iloc[0]
        workshop = equip_data['workshop'].iloc[0]
        
        total_energy = df['energy'].sum()
        factory_energy = df[df['factory'] == factory]['energy'].sum()
        workshop_energy = df[(df['factory'] == factory) & (df['workshop'] == workshop)]['energy'].sum()
        equip_energy = equip_data['energy'].sum()
        
        path = [
            {
                'level': 'total',
                'name': '全厂',
                'energy': total_energy,
                'contribution': 100.0
            },
            {
                'level': 'factory',
                'name': factory,
                'energy': factory_energy,
                'contribution': factory_energy / total_energy * 100
            },
            {
                'level': 'workshop',
                'name': workshop,
                'energy': workshop_energy,
                'contribution': workshop_energy / factory_energy * 100
            },
            {
                'level': 'equipment',
                'name': equipment_id,
                'energy': equip_energy,
                'contribution': equip_energy / workshop_energy * 100
            }
        ]
        
        return path
