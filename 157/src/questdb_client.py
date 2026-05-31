import logging
import time
from typing import Optional, List, Dict, Any
from datetime import datetime

import psycopg2
from psycopg2 import sql
from psycopg2.extensions import connection, cursor

logger = logging.getLogger(__name__)


class QuestDBConnection:
    def __init__(
        self,
        host: str = "localhost",
        port: int = 8812,
        user: str = "admin",
        password: str = "quest",
        database: str = "qdb",
    ):
        self.host = host
        self.port = port
        self.user = user
        self.password = password
        self.database = database
        self._conn: Optional[connection] = None
        self._cursor: Optional[cursor] = None

    def connect(self) -> None:
        try:
            self._conn = psycopg2.connect(
                host=self.host,
                port=self.port,
                user=self.user,
                password=self.password,
                database=self.database,
            )
            self._conn.autocommit = True
            self._cursor = self._conn.cursor()
            logger.info(f"Connected to QuestDB at {self.host}:{self.port}")
        except psycopg2.Error as e:
            logger.error(f"Failed to connect to QuestDB: {e}")
            raise

    def disconnect(self) -> None:
        if self._cursor:
            self._cursor.close()
        if self._conn:
            self._conn.close()
        logger.info("Disconnected from QuestDB")

    def __enter__(self) -> "QuestDBConnection":
        self.connect()
        return self

    def __exit__(self, exc_type, exc_val, exc_tb) -> None:
        self.disconnect()

    def execute(self, query: str, params: Optional[tuple] = None) -> cursor:
        try:
            if params:
                self._cursor.execute(query, params)
            else:
                self._cursor.execute(query)
            return self._cursor
        except psycopg2.Error as e:
            logger.error(f"Query execution failed: {e}")
            logger.error(f"Query: {query}")
            raise

    def execute_batch(self, query: str, params_list: List[tuple]) -> None:
        try:
            self._cursor.executemany(query, params_list)
        except psycopg2.Error as e:
            logger.error(f"Batch execution failed: {e}")
            raise

    def fetch_all(self) -> List[tuple]:
        return self._cursor.fetchall()

    def fetch_one(self) -> Optional[tuple]:
        return self._cursor.fetchone()

    def initialize_tables(self) -> None:
        create_sensor_table = """
            CREATE TABLE IF NOT EXISTS sensor_data (
                timestamp TIMESTAMP,
                sensor_id SYMBOL,
                temperature DOUBLE,
                anomaly_type SYMBOL,
                anomaly_score DOUBLE
            ) TIMESTAMP(timestamp) PARTITION BY DAY;
        """

        create_anomalies_table = """
            CREATE TABLE IF NOT EXISTS anomalies (
                timestamp TIMESTAMP,
                sensor_id SYMBOL,
                anomaly_type SYMBOL,
                temperature DOUBLE,
                description STRING,
                severity DOUBLE
            ) TIMESTAMP(timestamp) PARTITION BY DAY;
        """

        create_predictions_table = """
            CREATE TABLE IF NOT EXISTS predictions (
                timestamp TIMESTAMP,
                sensor_id SYMBOL,
                predicted_value DOUBLE,
                lower_bound DOUBLE,
                upper_bound DOUBLE
            ) TIMESTAMP(timestamp) PARTITION BY DAY;
        """

        try:
            self.execute(create_sensor_table)
            self.execute(create_anomalies_table)
            self.execute(create_predictions_table)
            logger.info("Database tables initialized successfully")
        except psycopg2.Error as e:
            logger.error(f"Failed to initialize tables: {e}")
            raise

    def insert_sensor_data(
        self,
        timestamp: datetime,
        sensor_id: str,
        temperature: float,
        anomaly_type: Optional[str] = None,
        anomaly_score: float = 0.0,
    ) -> None:
        query = """
            INSERT INTO sensor_data (timestamp, sensor_id, temperature, anomaly_type, anomaly_score)
            VALUES (%s, %s, %s, %s, %s)
        """
        self.execute(query, (timestamp, sensor_id, temperature, anomaly_type, anomaly_score))

    def insert_sensor_data_batch(self, data_list: List[Dict[str, Any]]) -> None:
        if not data_list:
            return
        query = """
            INSERT INTO sensor_data (timestamp, sensor_id, temperature, anomaly_type, anomaly_score)
            VALUES (%s, %s, %s, %s, %s)
        """
        params = [
            (
                d["timestamp"],
                d["sensor_id"],
                d["temperature"],
                d.get("anomaly_type"),
                d.get("anomaly_score", 0.0),
            )
            for d in data_list
        ]
        self.execute_batch(query, params)

    def insert_anomaly(
        self,
        timestamp: datetime,
        sensor_id: str,
        anomaly_type: str,
        temperature: float,
        description: str,
        severity: float = 0.0,
    ) -> None:
        query = """
            INSERT INTO anomalies (timestamp, sensor_id, anomaly_type, temperature, description, severity)
            VALUES (%s, %s, %s, %s, %s, %s)
        """
        self.execute(query, (timestamp, sensor_id, anomaly_type, temperature, description, severity))

    def insert_prediction(
        self,
        timestamp: datetime,
        sensor_id: str,
        predicted_value: float,
        lower_bound: float,
        upper_bound: float,
    ) -> None:
        query = """
            INSERT INTO predictions (timestamp, sensor_id, predicted_value, lower_bound, upper_bound)
            VALUES (%s, %s, %s, %s, %s)
        """
        self.execute(query, (timestamp, sensor_id, predicted_value, lower_bound, upper_bound))

    def get_sensor_data(self, sensor_id: str, limit: int = 1000) -> List[tuple]:
        query = """
            SELECT timestamp, temperature, anomaly_type, anomaly_score
            FROM sensor_data
            WHERE sensor_id = %s
            ORDER BY timestamp DESC
            LIMIT %s
        """
        self.execute(query, (sensor_id, limit))
        return self.fetch_all()

    def get_sensor_data_range(
        self,
        sensor_id: str,
        start_time: datetime,
        end_time: datetime,
    ) -> List[tuple]:
        query = """
            SELECT timestamp, temperature, anomaly_type, anomaly_score
            FROM sensor_data
            WHERE sensor_id = %s AND timestamp BETWEEN %s AND %s
            ORDER BY timestamp ASC
        """
        self.execute(query, (sensor_id, start_time, end_time))
        return self.fetch_all()

    def get_anomalies(
        self,
        sensor_id: Optional[str] = None,
        start_time: Optional[datetime] = None,
        end_time: Optional[datetime] = None,
        limit: int = 100,
    ) -> List[tuple]:
        query = "SELECT timestamp, sensor_id, anomaly_type, temperature, description, severity FROM anomalies WHERE 1=1"
        params = []

        if sensor_id:
            query += " AND sensor_id = %s"
            params.append(sensor_id)
        if start_time:
            query += " AND timestamp >= %s"
            params.append(start_time)
        if end_time:
            query += " AND timestamp <= %s"
            params.append(end_time)

        query += " ORDER BY timestamp DESC LIMIT %s"
        params.append(limit)

        self.execute(query, tuple(params))
        return self.fetch_all()
