import duckdb
import pandas as pd
import re
from datetime import datetime
from dateutil import parser
from typing import List, Dict, Any, Tuple, Optional
from dataclasses import dataclass, field
from collections import defaultdict


SUPPORTED_TYPES = ["INTEGER", "FLOAT", "DATE", "STRING"]
DEFAULT_BATCH_SIZE = 100000


@dataclass
class TypeDriftAlert:
    column_name: str
    batch_number: int
    rows_processed: int
    previous_type: str
    new_type: str
    previous_confidence: float
    new_confidence: float
    type_counts_change: Dict[str, int]
    severity: str
    recommendation: str


@dataclass
class BatchProcessingResult:
    batch_number: int
    rows_processed: int
    column_info_list: List[ColumnTypeInfo]
    alerts: List[TypeDriftAlert]
    schema_update_recommended: bool


@dataclass
class ColumnTypeInfo:
    column_name: str
    inferred_type: str
    confidence: float
    type_counts: Dict[str, int] = field(default_factory=dict)
    sample_values: List[Any] = field(default_factory=list)
    mixed_type: bool = False
    override_type: Optional[str] = None
    historical_types: List[Tuple[int, str, float]] = field(default_factory=list)

    @property
    def final_type(self) -> str:
        return self.override_type or self.inferred_type


class TypeInferenceEngine:
    def __init__(self, sample_size: int = 1000, null_values: List[str] = None, batch_size: int = DEFAULT_BATCH_SIZE):
        self.sample_size = sample_size
        self.null_values = null_values or [
            "", "NA", "N/A", "null", "NULL", "None",
            "nan", "NaN", "missing", "MISSING", "-"
        ]
        self.batch_size = batch_size
        self.con = duckdb.connect()
        self._incremental_state: Dict[str, Dict[str, Any]] = {}
        self._total_rows_processed = 0
        self._batch_number = 0
        self._processing_history: List[BatchProcessingResult] = []

    def _is_null(self, value: Any) -> bool:
        if value is None:
            return True
        if isinstance(value, float) and pd.isna(value):
            return True
        if isinstance(value, str) and value.strip() in self.null_values:
            return True
        return False

    def _try_parse_int(self, value: str) -> bool:
        try:
            cleaned = value.strip().replace(",", "")
            if cleaned.startswith(("+", "-")):
                cleaned = cleaned[1:]
            return cleaned.isdigit()
        except (ValueError, AttributeError):
            return False

    def _try_parse_float(self, value: str) -> bool:
        try:
            cleaned = value.strip().replace(",", "")
            float(cleaned)
            return True
        except (ValueError, AttributeError):
            return False

    def _try_parse_date(self, value: str) -> Optional[datetime]:
        try:
            cleaned = value.strip()
            if len(cleaned) < 4:
                return None
            
            parsed = parser.parse(cleaned, fuzzy=False, default=datetime(1900, 1, 1))
            
            if parsed.year < 1900 or parsed.year > 2100:
                return None
            
            has_explicit_date = (
                re.search(r'\d{1,2}[-/\s]', cleaned) or
                re.search(r'[-/\s]\d{1,2}', cleaned) or
                re.search(r'(Jan|Feb|Mar|Apr|May|Jun|Jul|Aug|Sep|Oct|Nov|Dec)', cleaned, re.IGNORECASE) or
                re.search(r'(January|February|March|April|May|June|July|August|September|October|November|December)', cleaned, re.IGNORECASE) or
                re.search(r'\d{4}年\d{1,2}月\d{1,2}日', cleaned) or
                re.search(r'^\d{8}$', cleaned)
            )
            
            if not has_explicit_date and not re.match(r'^\d{4}-\d{1,2}-\d{1,2}$', cleaned) and not re.match(r'^\d{4}/\d{1,2}/\d{1,2}$', cleaned):
                if cleaned.isdigit() and len(cleaned) == 8:
                    pass
                elif cleaned.count('-') == 0 and cleaned.count('/') == 0 and cleaned.count(' ') == 0:
                    return None
            
            return parsed
        except (ValueError, OverflowError, TypeError):
            return None

    def _classify_value(self, value: Any) -> Tuple[str, Any]:
        if self._is_null(value):
            return "NULL", None

        if isinstance(value, bool):
            return "INTEGER", int(value)

        if isinstance(value, int):
            return "INTEGER", value

        if isinstance(value, float):
            return "FLOAT", value

        if isinstance(value, datetime):
            return "DATE", value.date()

        if isinstance(value, str):
            stripped = value.strip()
            
            if self._try_parse_int(stripped):
                try:
                    cleaned = stripped.replace(",", "")
                    return "INTEGER", int(cleaned)
                except ValueError:
                    pass

            if self._try_parse_float(stripped):
                try:
                    cleaned = stripped.replace(",", "")
                    return "FLOAT", float(cleaned)
                except ValueError:
                    pass

            parsed_date = self._try_parse_date(stripped)
            if parsed_date is not None:
                return "DATE", parsed_date.date()

            return "STRING", stripped

        return "STRING", str(value)

    def _calculate_confidence(self, type_counts: Dict[str, int], total: int) -> Tuple[float, str]:
        if total == 0:
            return 0.5, "STRING"

        non_null_total = sum(c for t, c in type_counts.items() if t != "NULL")
        
        if non_null_total == 0:
            return 0.3, "STRING"

        type_priority = ["INTEGER", "FLOAT", "DATE", "STRING"]
        
        for t in type_priority:
            count = type_counts.get(t, 0)
            ratio = count / non_null_total
            if ratio >= 0.8:
                return ratio, t

        sorted_types = sorted(
            [(t, c) for t, c in type_counts.items() if t != "NULL"],
            key=lambda x: x[1], reverse=True
        )
        
        if not sorted_types:
            return 0.3, "STRING"
        
        primary_type, primary_count = sorted_types[0]
        confidence = primary_count / non_null_total

        if primary_type in ("INTEGER", "FLOAT", "DATE") and confidence >= 0.5:
            return confidence, primary_type

        string_count = type_counts.get("STRING", 0)
        if string_count > 0 and primary_type != "STRING":
            return max(0.3, string_count / non_null_total), "STRING"

        return confidence, primary_type

    def infer_types(self, file_path: str) -> Tuple[List[ColumnTypeInfo], pd.DataFrame]:
        self.con.execute(f"""
            CREATE TABLE temp_data AS 
            SELECT * FROM read_csv_auto('{file_path}', all_varchar=True)
        """)
        
        df_sample = self.con.execute(f"SELECT * FROM temp_data LIMIT {self.sample_size}").fetchdf()
        
        column_info_list = []
        
        for column_name in df_sample.columns:
            type_counts = {"INTEGER": 0, "FLOAT": 0, "DATE": 0, "STRING": 0, "NULL": 0}
            sample_values = []
            
            for value in df_sample[column_name]:
                val_type, parsed_val = self._classify_value(value)
                type_counts[val_type] += 1
                
                if val_type != "NULL" and len(sample_values) < 10:
                    sample_values.append(parsed_val)

            total_non_null = sum(c for t, c in type_counts.items() if t != "NULL")
            confidence, inferred_type = self._calculate_confidence(type_counts, total_non_null)

            non_null_types = {t: c for t, c in type_counts.items() if t != "NULL" and c > 0}
            mixed_type = len(non_null_types) > 1

            column_info = ColumnTypeInfo(
                column_name=column_name,
                inferred_type=inferred_type,
                confidence=confidence,
                type_counts=type_counts,
                sample_values=sample_values,
                mixed_type=mixed_type
            )
            column_info_list.append(column_info)

        return column_info_list, df_sample

    def _init_incremental_state(self, columns: List[str]):
        for col in columns:
            if col not in self._incremental_state:
                self._incremental_state[col] = {
                    "type_counts": {"INTEGER": 0, "FLOAT": 0, "DATE": 0, "STRING": 0, "NULL": 0},
                    "sample_values": [],
                    "current_type": None,
                    "current_confidence": 0.0,
                    "batch_first_seen": self._batch_number,
                }

    def _process_batch_incremental(self, df_batch: pd.DataFrame) -> List[ColumnTypeInfo]:
        self._batch_number += 1
        batch_rows = len(df_batch)
        self._total_rows_processed += batch_rows

        self._init_incremental_state(df_batch.columns.tolist())

        column_info_list = []
        for column_name in df_batch.columns:
            state = self._incremental_state[column_name]
            batch_type_counts = {"INTEGER": 0, "FLOAT": 0, "DATE": 0, "STRING": 0, "NULL": 0}
            
            for value in df_batch[column_name]:
                val_type, parsed_val = self._classify_value(value)
                state["type_counts"][val_type] += 1
                batch_type_counts[val_type] += 1
                
                if val_type != "NULL" and len(state["sample_values"]) < 20:
                    state["sample_values"].append(parsed_val)

            total_non_null = sum(c for t, c in state["type_counts"].items() if t != "NULL")
            confidence, inferred_type = self._calculate_confidence(state["type_counts"], total_non_null)

            non_null_types = {t: c for t, c in state["type_counts"].items() if t != "NULL" and c > 0}
            mixed_type = len(non_null_types) > 1

            historical_types = state.get("historical_types", [])
            if state["current_type"] is not None and state["current_type"] != inferred_type:
                historical_types.append((self._batch_number - 1, state["current_type"], state["current_confidence"]))
            
            state["current_type"] = inferred_type
            state["current_confidence"] = confidence
            state["historical_types"] = historical_types

            column_info = ColumnTypeInfo(
                column_name=column_name,
                inferred_type=inferred_type,
                confidence=confidence,
                type_counts=state["type_counts"].copy(),
                sample_values=state["sample_values"][-10:],
                mixed_type=mixed_type,
                override_type=None,
                historical_types=historical_types.copy()
            )
            column_info_list.append(column_info)

        return column_info_list

    def _detect_type_drift(self, new_column_info_list: List[ColumnTypeInfo], prev_column_info_list: Optional[List[ColumnTypeInfo]]) -> List[TypeDriftAlert]:
        alerts = []
        if prev_column_info_list is None:
            return alerts

        prev_map = {info.column_name: info for info in prev_column_info_list}

        for new_info in new_column_info_list:
            prev_info = prev_map.get(new_info.column_name)
            if prev_info is None:
                continue

            prev_type = prev_info.final_type
            new_type = new_info.inferred_type
            prev_conf = prev_info.confidence
            new_conf = new_info.confidence

            type_counts_change = {}
            for t in ["INTEGER", "FLOAT", "DATE", "STRING", "NULL"]:
                delta = new_info.type_counts.get(t, 0) - prev_info.type_counts.get(t, 0)
                if delta != 0:
                    type_counts_change[t] = delta

            if prev_type != new_type:
                new_non_null = new_info.type_counts.get(new_type, 0)
                total_non_null = sum(c for t, c in new_info.type_counts.items() if t != "NULL")
                ratio = new_non_null / total_non_null if total_non_null > 0 else 0

                if new_type == "STRING" and prev_type in ("INTEGER", "FLOAT", "DATE"):
                    severity = "HIGH"
                    recommendation = f"强烈建议将列 `{new_info.column_name}` 的类型从 {prev_type} 更新为 STRING。发现 {type_counts_change.get('STRING', 0)} 个新的字符串值。"
                elif new_type in ("INTEGER", "FLOAT") and prev_type == "DATE":
                    severity = "HIGH"
                    recommendation = f"检测到严重类型漂移！列 `{new_info.column_name}` 从 DATE 变为 {new_type}。请检查数据质量。"
                elif new_type == "FLOAT" and prev_type == "INTEGER":
                    severity = "MEDIUM"
                    recommendation = f"列 `{new_info.column_name}` 从 INTEGER 变为 FLOAT，建议更新 schema 以保留小数精度。"
                elif new_type == "DATE" and prev_type == "STRING":
                    severity = "MEDIUM"
                    recommendation = f"列 `{new_info.column_name}` 从 STRING 变为 DATE，可考虑更新 schema 以获得更好的查询性能。"
                else:
                    severity = "LOW"
                    recommendation = f"列 `{new_info.column_name}` 类型从 {prev_type} 变为 {new_type}，请确认是否需要更新 schema。"

                alert = TypeDriftAlert(
                    column_name=new_info.column_name,
                    batch_number=self._batch_number,
                    rows_processed=self._total_rows_processed,
                    previous_type=prev_type,
                    new_type=new_type,
                    previous_confidence=prev_conf,
                    new_confidence=new_conf,
                    type_counts_change=type_counts_change,
                    severity=severity,
                    recommendation=recommendation
                )
                alerts.append(alert)
            elif new_conf < prev_conf - 0.1 and new_conf < 0.8:
                severity = "MEDIUM"
                recommendation = f"列 `{new_info.column_name}` 类型置信度显著下降（{prev_conf:.1%} → {new_conf:.1%}），建议检查数据质量或考虑放宽为 STRING。"
                alert = TypeDriftAlert(
                    column_name=new_info.column_name,
                    batch_number=self._batch_number,
                    rows_processed=self._total_rows_processed,
                    previous_type=prev_type,
                    new_type=new_type,
                    previous_confidence=prev_conf,
                    new_confidence=new_conf,
                    type_counts_change=type_counts_change,
                    severity=severity,
                    recommendation=recommendation
                )
                alerts.append(alert)

        return alerts

    def process_incremental(self, file_path: str, progress_callback=None) -> Tuple[List[ColumnTypeInfo], List[TypeDriftAlert]]:
        self.con.execute(f"""
            CREATE TABLE IF NOT EXISTS temp_data AS 
            SELECT * FROM read_csv_auto('{file_path}', all_varchar=True)
        """)

        total_rows = self.con.execute("SELECT COUNT(*) FROM temp_data").fetchone()[0]
        
        offset = 0
        all_alerts: List[TypeDriftAlert] = []
        final_column_info: Optional[List[ColumnTypeInfo]] = None
        prev_column_info: Optional[List[ColumnTypeInfo]] = None

        while offset < total_rows:
            df_batch = self.con.execute(
                f"SELECT * FROM temp_data LIMIT {self.batch_size} OFFSET {offset}"
            ).fetchdf()

            if len(df_batch) == 0:
                break

            column_info_list = self._process_batch_incremental(df_batch)
            final_column_info = column_info_list

            alerts = self._detect_type_drift(column_info_list, prev_column_info)
            all_alerts.extend(alerts)

            batch_result = BatchProcessingResult(
                batch_number=self._batch_number,
                rows_processed=self._total_rows_processed,
                column_info_list=column_info_list,
                alerts=alerts,
                schema_update_recommended=any(a.severity in ("HIGH", "MEDIUM") for a in alerts)
            )
            self._processing_history.append(batch_result)

            if progress_callback:
                progress_callback(
                    self._batch_number,
                    self._total_rows_processed,
                    total_rows,
                    len(alerts),
                    batch_result.schema_update_recommended
                )

            prev_column_info = column_info_list
            offset += self.batch_size

        return final_column_info or [], all_alerts

    def get_incremental_summary(self) -> Dict[str, Any]:
        return {
            "total_rows_processed": self._total_rows_processed,
            "total_batches": self._batch_number,
            "batch_size": self.batch_size,
            "total_alerts": sum(len(r.alerts) for r in self._processing_history),
            "high_alerts": sum(1 for r in self._processing_history for a in r.alerts if a.severity == "HIGH"),
            "medium_alerts": sum(1 for r in self._processing_history for a in r.alerts if a.severity == "MEDIUM"),
            "schema_update_needed": any(r.schema_update_recommended for r in self._processing_history),
            "processing_history": self._processing_history,
        }

    def create_typed_table(self, file_path: str, column_info_list: List[ColumnTypeInfo], table_name: str = "imported_data"):
        select_columns = []
        for info in column_info_list:
            col_name = f'"{info.column_name}"'
            final_type = info.final_type
            
            if final_type == "INTEGER":
                col_expr = f"TRY_CAST(REPLACE(REPLACE({col_name}, ',', ''), '+', '') AS INTEGER) AS {col_name}"
            elif final_type == "FLOAT":
                col_expr = f"TRY_CAST(REPLACE(REPLACE({col_name}, ',', ''), '+', '') AS DOUBLE) AS {col_name}"
            elif final_type == "DATE":
                col_expr = f"""
                COALESCE(
                    TRY_CAST({col_name} AS DATE),
                    try_strptime({col_name}, '%Y-%m-%d')::DATE,
                    try_strptime({col_name}, '%Y/%m/%d')::DATE,
                    try_strptime({col_name}, '%m/%d/%Y')::DATE,
                    try_strptime({col_name}, '%d/%m/%Y')::DATE,
                    try_strptime({col_name}, '%m-%d-%Y')::DATE,
                    try_strptime({col_name}, '%d-%m-%Y')::DATE,
                    try_strptime({col_name}, '%Y%m%d')::DATE,
                    try_strptime({col_name}, '%Y年%m月%d日')::DATE,
                    try_strptime({col_name}, '%b %d %Y')::DATE,
                    try_strptime({col_name}, '%B %d %Y')::DATE,
                    try_strptime({col_name}, '%b %-d %Y')::DATE,
                    try_strptime({col_name}, '%B %-d %Y')::DATE,
                    try_strptime({col_name}, '%b %d, %Y')::DATE,
                    try_strptime({col_name}, '%B %d, %Y')::DATE,
                    try_strptime(TRIM({col_name}), '%b %-d %Y')::DATE,
                    try_strptime(TRIM({col_name}), '%B %-d %Y')::DATE
                ) AS {col_name}
                """
            else:
                col_expr = f"{col_name}::VARCHAR AS {col_name}"
            
            select_columns.append(col_expr)

        select_sql = ", ".join(select_columns)
        
        self.con.execute(f"DROP TABLE IF EXISTS {table_name}")
        self.con.execute(f"""
            CREATE TABLE {table_name} AS
            SELECT {select_sql}
            FROM read_csv_auto('{file_path}', all_varchar=True)
        """)

        return self.con.execute(f"SELECT * FROM {table_name} LIMIT 100").fetchdf()

    def get_table_schema(self, table_name: str = "imported_data") -> pd.DataFrame:
        return self.con.execute(f"DESCRIBE {table_name}").fetchdf()

    def export_to_parquet(self, table_name: str, output_path: str):
        self.con.execute(f"COPY {table_name} TO '{output_path}' (FORMAT 'parquet')")

    def export_to_csv(self, table_name: str, output_path: str):
        self.con.execute(f"COPY {table_name} TO '{output_path}' (HEADER, DELIMITER ',')")

    def close(self):
        self.con.close()
