import pandas as pd
import numpy as np
from datetime import datetime, timedelta
from typing import List, Dict, Any
from influxdb_client import InfluxDBClient
import aiohttp

from models import DataSource
from config import settings

class DataQueryService:
    def __init__(self):
        pass
    
    def _get_influxdb_client(self, connection_info: Dict[str, Any]):
        return InfluxDBClient(
            url=connection_info.get("url", settings.influxdb_url),
            token=connection_info.get("token", settings.influxdb_token),
            org=connection_info.get("org", settings.influxdb_org)
        )
    
    def _parse_interval(self, interval: str) -> int:
        if interval.endswith('m'):
            return int(interval[:-1]) * 60
        elif interval.endswith('h'):
            return int(interval[:-1]) * 3600
        elif interval.endswith('s'):
            return int(interval[:-1])
        return 60
    
    async def query_timeseries(
        self,
        datasource: DataSource,
        start_time: datetime,
        end_time: datetime,
        aggregation: str = "mean",
        interval: str = "1m"
    ) -> List[Dict[str, Any]]:
        if datasource.type == "influxdb":
            return await self._query_influxdb(datasource, start_time, end_time, aggregation, interval)
        elif datasource.type == "prometheus":
            return await self._query_prometheus(datasource, start_time, end_time, aggregation, interval)
        elif datasource.type == "csv":
            return await self._query_csv(datasource, start_time, end_time, aggregation, interval)
        return []
    
    async def _query_influxdb(
        self,
        datasource: DataSource,
        start_time: datetime,
        end_time: datetime,
        aggregation: str,
        interval: str
    ) -> List[Dict[str, Any]]:
        client = self._get_influxdb_client(datasource.connection_info)
        query_api = client.query_api()
        
        field_mapping = datasource.field_mapping
        measurement = field_mapping.get("measurement", "data")
        field = field_mapping.get("field", "value")
        
        agg_fn_map = {
            "mean": "mean",
            "sum": "sum",
            "max": "max",
            "min": "min"
        }
        agg_fn = agg_fn_map.get(aggregation, "mean")
        
        flux_query = f'''
        from(bucket: "{datasource.connection_info.get('bucket', settings.influxdb_bucket)}")
            |> range(start: {int(start_time.timestamp())}, stop: {int(end_time.timestamp())})
            |> filter(fn: (r) => r._measurement == "{measurement}")
            |> filter(fn: (r) => r._field == "{field}")
            |> aggregateWindow(every: {interval}, fn: {agg_fn}, createEmpty: false)
        '''
        
        tables = query_api.query(flux_query)
        
        results = []
        for table in tables:
            for record in table.records:
                results.append({
                    "timestamp": record.get_time(),
                    "value": record.get_value(),
                    "tags": {k: record.values.get(k) for k in record.values if not k.startswith('_')}
                })
        
        client.close()
        return sorted(results, key=lambda x: x["timestamp"])
    
    async def _query_prometheus(
        self,
        datasource: DataSource,
        start_time: datetime,
        end_time: datetime,
        aggregation: str,
        interval: str
    ) -> List[Dict[str, Any]]:
        base_url = datasource.connection_info.get("url", "http://localhost:9090")
        field_mapping = datasource.field_mapping
        query = field_mapping.get("query", "up")
        
        try:
            agg_fn_map = {
                "mean": "avg_over_time",
                "sum": "sum_over_time",
                "max": "max_over_time",
                "min": "min_over_time"
            }
            
            if aggregation == "mean":
                agg_query = f"avg_over_time({query}[{interval}])"
            elif aggregation == "sum":
                agg_query = f"sum_over_time({query}[{interval}])"
            elif aggregation == "max":
                agg_query = f"max_over_time({query}[{interval}])"
            elif aggregation == "min":
                agg_query = f"min_over_time({query}[{interval}])"
            else:
                agg_query = query
            
            step_seconds = self._parse_interval(interval)
            
            url = f"{base_url}/api/v1/query_range"
            params = {
                "query": agg_query,
                "start": int(start_time.timestamp()),
                "end": int(end_time.timestamp()),
                "step": step_seconds
            }
            
            print(f"Prometheus query: {agg_query}, params: {params}")
            
            async with aiohttp.ClientSession() as session:
                async with session.get(url, params=params) as response:
                    if response.status != 200:
                        text = await response.text()
                        print(f"Prometheus HTTP error: {response.status}, {text}")
                        return []
                    
                    data = await response.json()
            
            results = []
            if data.get("status") == "success":
                result_data = data.get("data", {})
                result_list = result_data.get("result", [])
                
                print(f"Prometheus returned {len(result_list)} time series")
                
                for result_idx, result in enumerate(result_list):
                    metric = result.get("metric", {})
                    values = result.get("values", [])
                    
                    print(f"Series {result_idx}: values count = {len(values)}")
                    
                    for value_tuple in values:
                        if len(value_tuple) >= 2:
                            ts = value_tuple[0]
                            value_str = value_tuple[1]
                            
                            try:
                                timestamp = datetime.fromtimestamp(float(ts))
                                value = float(value_str)
                                
                                results.append({
                                    "timestamp": timestamp,
                                    "value": value,
                                    "tags": metric
                                })
                            except Exception as e:
                                print(f"Error parsing value {value_tuple}: {e}")
                                continue
            else:
                print(f"Prometheus query failed: {data}")
            
            return sorted(results, key=lambda x: x["timestamp"])
            
        except Exception as e:
            print(f"Prometheus query error: {e}")
            import traceback
            traceback.print_exc()
            return []
    
    async def _query_csv(
        self,
        datasource: DataSource,
        start_time: datetime,
        end_time: datetime,
        aggregation: str,
        interval: str
    ) -> List[Dict[str, Any]]:
        field_mapping = datasource.field_mapping
        timestamp_field = field_mapping.get("timestamp", "timestamp")
        value_field = field_mapping.get("value", "value")
        
        try:
            csv_file = datasource.connection_info.get("file_path")
            if csv_file:
                df = pd.read_csv(csv_file)
                df[timestamp_field] = pd.to_datetime(df[timestamp_field])
                df = df[(df[timestamp_field] >= start_time) & (df[timestamp_field] <= end_time)]
                
                df = df.set_index(timestamp_field)
                resampled = df[value_field].resample(interval).agg(aggregation)
                
                results = []
                for idx, val in resampled.items():
                    if not pd.isna(val):
                        results.append({
                            "timestamp": idx.to_pydatetime(),
                            "value": float(val),
                            "tags": {}
                        })
                return results
        except Exception as e:
            print(f"CSV query error: {e}")
        
        return []
