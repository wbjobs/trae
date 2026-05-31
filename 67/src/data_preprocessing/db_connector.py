import pandas as pd
import numpy as np
from datetime import datetime, timedelta
import json
import warnings
warnings.filterwarnings('ignore')

try:
    from influxdb import InfluxDBClient
    INFLUXDB_AVAILABLE = True
except ImportError:
    INFLUXDB_AVAILABLE = False

try:
    from pymongo import MongoClient
    MONGODB_AVAILABLE = True
except ImportError:
    MONGODB_AVAILABLE = False

try:
    from kafka import KafkaConsumer, KafkaProducer
    KAFKA_AVAILABLE = True
except ImportError:
    KAFKA_AVAILABLE = False

from config.config import DATABASE_CONFIG


class DatabaseConnector:
    def __init__(self, db_type='influxdb'):
        self.db_type = db_type
        self.config = DATABASE_CONFIG.get(db_type, {})
        self.connection = None
        self._connect()

    def _connect(self):
        if self.db_type == 'influxdb':
            self._connect_influxdb()
        elif self.db_type == 'mongodb':
            self._connect_mongodb()
        elif self.db_type == 'kafka':
            self._connect_kafka()
        else:
            raise ValueError(f"不支持的数据库类型: {self.db_type}")

    def _connect_influxdb(self):
        if not INFLUXDB_AVAILABLE:
            print("警告: influxdb 未安装，将使用模拟数据模式")
            self.connection = None
            return
        
        try:
            self.connection = InfluxDBClient(
                host=self.config.get('host', 'localhost'),
                port=self.config.get('port', 8086),
                username=self.config.get('username', 'admin'),
                password=self.config.get('password', 'admin'),
                database=self.config.get('database', 'energy_db')
            )
            print("InfluxDB 连接成功")
        except Exception as e:
            print(f"InfluxDB 连接失败: {e}")
            self.connection = None

    def _connect_mongodb(self):
        if not MONGODB_AVAILABLE:
            print("警告: pymongo 未安装，将使用模拟数据模式")
            self.connection = None
            return
        
        try:
            self.connection = MongoClient(
                host=self.config.get('host', 'localhost'),
                port=self.config.get('port', 27017)
            )
            self.db = self.connection[self.config.get('database', 'energy_analysis')]
            print("MongoDB 连接成功")
        except Exception as e:
            print(f"MongoDB 连接失败: {e}")
            self.connection = None

    def _connect_kafka(self):
        if not KAFKA_AVAILABLE:
            print("警告: kafka-python 未安装，将使用模拟数据模式")
            self.consumer = None
            self.producer = None
            return
        
        try:
            self.consumer = KafkaConsumer(
                self.config.get('topic', 'energy_real_time'),
                bootstrap_servers=self.config.get('bootstrap_servers', ['localhost:9092']),
                group_id=self.config.get('group_id', 'energy_consumer_group'),
                auto_offset_reset='latest'
            )
            self.producer = KafkaProducer(
                bootstrap_servers=self.config.get('bootstrap_servers', ['localhost:9092'])
            )
            print("Kafka 连接成功")
        except Exception as e:
            print(f"Kafka 连接失败: {e}")
            self.consumer = None
            self.producer = None

    def query_energy_data(self, start_time=None, end_time=None, factory=None, workshop=None, equipment=None):
        if self.connection is None:
            print("使用模拟数据模式")
            return self._generate_mock_data(start_time, end_time)
        
        if self.db_type == 'influxdb':
            return self._query_influxdb(start_time, end_time, factory, workshop, equipment)
        elif self.db_type == 'mongodb':
            return self._query_mongodb(start_time, end_time, factory, workshop, equipment)
        else:
            raise ValueError(f"不支持的查询操作")

    def _query_influxdb(self, start_time, end_time, factory, workshop, equipment):
        measurement = self.config.get('measurement', 'energy_consumption')
        query = f'SELECT * FROM "{measurement}"'
        
        conditions = []
        if start_time:
            conditions.append(f"time >= '{start_time}'")
        if end_time:
            conditions.append(f"time <= '{end_time}'")
        if factory:
            conditions.append(f"factory = '{factory}'")
        if workshop:
            conditions.append(f"workshop = '{workshop}'")
        if equipment:
            conditions.append(f"equipment = '{equipment}'")
        
        if conditions:
            query += ' WHERE ' + ' AND '.join(conditions)
        
        query += ' ORDER BY time DESC'
        
        try:
            result = self.connection.query(query)
            points = list(result.get_points())
            df = pd.DataFrame(points)
            if not df.empty:
                df['timestamp'] = pd.to_datetime(df['time'])
                df = df.drop(columns=['time'])
            return df
        except Exception as e:
            print(f"InfluxDB 查询失败: {e}")
            return self._generate_mock_data(start_time, end_time)

    def _query_mongodb(self, start_time, end_time, factory, workshop, equipment):
        collection = self.db[self.config.get('collection', 'energy_data')]
        
        query = {}
        if start_time or end_time:
            query['timestamp'] = {}
            if start_time:
                query['timestamp']['$gte'] = start_time
            if end_time:
                query['timestamp']['$lte'] = end_time
        if factory:
            query['factory'] = factory
        if workshop:
            query['workshop'] = workshop
        if equipment:
            query['equipment'] = equipment
        
        try:
            cursor = collection.find(query).sort('timestamp', -1)
            df = pd.DataFrame(list(cursor))
            if not df.empty and '_id' in df.columns:
                df = df.drop(columns=['_id'])
            return df
        except Exception as e:
            print(f"MongoDB 查询失败: {e}")
            return self._generate_mock_data(start_time, end_time)

    def _generate_mock_data(self, start_time=None, end_time=None):
        from config.config import HIERARCHY_CONFIG
        
        if start_time is None:
            start_time = datetime.now() - timedelta(days=30)
        if end_time is None:
            end_time = datetime.now()
        
        if isinstance(start_time, str):
            start_time = datetime.strptime(start_time, '%Y-%m-%d')
        if isinstance(end_time, str):
            end_time = datetime.strptime(end_time, '%Y-%m-%d')
        
        factories = HIERARCHY_CONFIG['factory_list']
        workshops = HIERARCHY_CONFIG['workshop_list']
        equipment_types = ['数控机床', '冲压机', '焊接机器人', '传送带', '空压机', '中央空调']
        
        data = []
        current_time = start_time
        
        while current_time <= end_time:
            for factory in factories:
                for workshop in workshops[:3]:
                    for equipment in equipment_types[:2]:
                        equipment_id = f"{factory}_{workshop}_{equipment}_{np.random.randint(1, 5)}"
                        
                        base_power = np.random.uniform(50, 500)
                        power = base_power * (1 + np.random.normal(0, 0.1))
                        current = power / (380 * 0.85) * 1000
                        voltage = 380 + np.random.normal(0, 5)
                        power_factor = 0.8 + np.random.uniform(0, 0.15)
                        energy = power * 0.001
                        
                        if np.random.random() < 0.05:
                            power *= 1.5
                        
                        data.append({
                            'timestamp': current_time,
                            'factory': factory,
                            'workshop': workshop,
                            'equipment': equipment_id,
                            'power': round(power, 2),
                            'current': round(current, 2),
                            'voltage': round(voltage, 2),
                            'power_factor': round(power_factor, 3),
                            'energy': round(energy, 4)
                        })
            
            current_time += timedelta(hours=1)
        
        df = pd.DataFrame(data)
        print(f"生成模拟数据: {len(df)} 条")
        return df

    def insert_energy_data(self, data):
        if self.connection is None:
            print("数据库连接失败，无法插入数据")
            return False
        
        if self.db_type == 'influxdb':
            return self._insert_influxdb(data)
        elif self.db_type == 'mongodb':
            return self._insert_mongodb(data)
        else:
            raise ValueError(f"不支持的插入操作")

    def _insert_influxdb(self, data):
        measurement = self.config.get('measurement', 'energy_consumption')
        
        points = []
        for _, row in data.iterrows():
            point = {
                "measurement": measurement,
                "tags": {
                    "factory": row['factory'],
                    "workshop": row['workshop'],
                    "equipment": row['equipment']
                },
                "time": row['timestamp'],
                "fields": {
                    "power": float(row['power']),
                    "current": float(row['current']),
                    "voltage": float(row['voltage']),
                    "power_factor": float(row['power_factor']),
                    "energy": float(row['energy'])
                }
            }
            points.append(point)
        
        try:
            self.connection.write_points(points)
            print(f"成功插入 {len(points)} 条数据到 InfluxDB")
            return True
        except Exception as e:
            print(f"InfluxDB 插入失败: {e}")
            return False

    def _insert_mongodb(self, data):
        collection = self.db[self.config.get('collection', 'energy_data')]
        
        records = data.to_dict('records')
        try:
            collection.insert_many(records)
            print(f"成功插入 {len(records)} 条数据到 MongoDB")
            return True
        except Exception as e:
            print(f"MongoDB 插入失败: {e}")
            return False

    def consume_realtime_data(self, callback=None):
        if self.consumer is None:
            print("Kafka 消费者不可用")
            return
        
        try:
            for message in self.consumer:
                data = json.loads(message.value.decode('utf-8'))
                if callback:
                    callback(data)
                yield data
        except Exception as e:
            print(f"Kafka 消费失败: {e}")

    def send_realtime_data(self, data):
        if self.producer is None:
            print("Kafka 生产者不可用")
            return False
        
        try:
            topic = self.config.get('topic', 'energy_real_time')
            self.producer.send(topic, json.dumps(data).encode('utf-8'))
            return True
        except Exception as e:
            print(f"Kafka 发送失败: {e}")
            return False

    def close(self):
        if self.connection:
            self.connection.close()
            print("数据库连接已关闭")
        if self.consumer:
            self.consumer.close()
        if self.producer:
            self.producer.close()
