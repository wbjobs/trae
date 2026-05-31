import numpy as np
import pandas as pd
from datetime import datetime, timedelta
from typing import List, Dict, Any, Tuple
from sklearn.ensemble import IsolationForest
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy import select
from sqlalchemy.orm import selectinload

from models import AnomalyDetectionRule, AnomalyRecord, DataSource
from schemas import AnomalyDetectionRuleCreate, AnomalyDetectionRuleUpdate, AnomalyRecordUpdate
from services.data_query_service import DataQueryService

class AnomalyDetectionService:
    def __init__(self, db: AsyncSession):
        self.db = db
        self.data_query_service = DataQueryService()
    
    async def create_rule(self, rule: AnomalyDetectionRuleCreate) -> AnomalyDetectionRule:
        db_rule = AnomalyDetectionRule(**rule.dict())
        self.db.add(db_rule)
        await self.db.commit()
        await self.db.refresh(db_rule)
        return db_rule
    
    async def get_all_rules(self) -> List[AnomalyDetectionRule]:
        result = await self.db.execute(
            select(AnomalyDetectionRule).options(selectinload(AnomalyDetectionRule.datasource))
        )
        return result.scalars().all()
    
    async def get_rule_by_id(self, id: int) -> AnomalyDetectionRule:
        result = await self.db.execute(
            select(AnomalyDetectionRule)
            .where(AnomalyDetectionRule.id == id)
            .options(selectinload(AnomalyDetectionRule.datasource))
        )
        return result.scalars().first()
    
    async def update_rule(self, id: int, rule: AnomalyDetectionRuleUpdate) -> AnomalyDetectionRule:
        db_rule = await self.get_rule_by_id(id)
        if db_rule:
            update_data = rule.dict(exclude_unset=True)
            for key, value in update_data.items():
                setattr(db_rule, key, value)
            await self.db.commit()
            await self.db.refresh(db_rule)
        return db_rule
    
    async def delete_rule(self, id: int) -> bool:
        db_rule = await self.get_rule_by_id(id)
        if db_rule:
            await self.db.delete(db_rule)
            await self.db.commit()
            return True
        return False
    
    def _detect_3sigma(self, values: List[float], threshold: float = 3.0) -> List[Tuple[int, float]]:
        if len(values) < 3:
            return []
        
        values_array = np.array(values)
        mean = np.mean(values_array)
        std = np.std(values_array)
        
        if std == 0:
            return []
        
        z_scores = np.abs((values_array - mean) / std)
        anomalies = [(i, z_scores[i]) for i in range(len(z_scores)) if z_scores[i] > threshold]
        return anomalies
    
    def _detect_moving_average(self, values: List[float], window_size: int = 60, threshold: float = 3.0) -> List[Tuple[int, float]]:
        if len(values) < window_size:
            return []
        
        series = pd.Series(values)
        rolling_mean = series.rolling(window=window_size).mean()
        rolling_std = series.rolling(window=window_size).std()
        
        anomalies = []
        for i in range(window_size, len(values)):
            if rolling_std[i] > 0:
                z_score = abs((values[i] - rolling_mean[i]) / rolling_std[i])
                if z_score > threshold:
                    anomalies.append((i, z_score))
        
        return anomalies
    
    def _detect_isolation_forest(
        self, 
        values: List[float], 
        contamination: float = 0.01,
        window_size: int = 60,
        threshold: float = 3.0
    ) -> List[Tuple[int, float]]:
        if len(values) < 30:
            return []
        
        values_array = np.array(values)
        n = len(values_array)
        
        features = self._extract_time_series_features(values_array, window_size)
        
        print(f"Isolation Forest: data length={n}, features shape={features.shape}")
        
        adaptive_contamination = self._calculate_adaptive_contamination(values_array, contamination)
        print(f"Adaptive contamination: {adaptive_contamination}")
        
        try:
            clf = IsolationForest(
                contamination=adaptive_contamination,
                random_state=42,
                n_estimators=200,
                max_samples='auto',
                n_jobs=-1
            )
            clf.fit(features)
            
            anomaly_scores = clf.decision_function(features)
            predictions = clf.predict(features)
            
            iforest_anomalies = {
                i: -anomaly_scores[i] 
                for i in range(len(predictions)) 
                if predictions[i] == -1
            }
            
            stats_anomalies = self._detect_statistical_anomalies(values_array, window_size, threshold)
            stats_anomaly_set = set([idx for idx, score in stats_anomalies])
            
            final_anomalies = []
            for idx, iforest_score in iforest_anomalies.items():
                in_stats = idx in stats_anomaly_set
                
                if in_stats:
                    final_score = iforest_score * 1.5
                else:
                    final_score = iforest_score * 0.3
                
                if final_score > 0.1:
                    final_anomalies.append((idx, final_score))
            
            print(f"Isolation Forest: detected {len(iforest_anomalies)} candidates, {len(final_anomalies)} confirmed with statistical check")
            
            return sorted(final_anomalies, key=lambda x: x[1], reverse=True)
            
        except Exception as e:
            print(f"Isolation Forest error: {e}")
            import traceback
            traceback.print_exc()
            return []
    
    def _extract_time_series_features(
        self, 
        values: np.ndarray, 
        window_size: int
    ) -> np.ndarray:
        n = len(values)
        features = []
        
        series = pd.Series(values)
        
        rolling_mean = series.rolling(window=min(window_size, n//4)).mean().fillna(method='bfill').fillna(method='ffill').values
        rolling_std = series.rolling(window=min(window_size, n//4)).std().fillna(0).values
        rolling_median = series.rolling(window=min(window_size, n//4)).median().fillna(method='bfill').fillna(method='ffill').values
        
        diff = np.diff(values, prepend=values[0])
        diff2 = np.diff(diff, prepend=diff[0])
        
        z_scores = np.zeros(n)
        if n >= 5:
            expanding_mean = series.expanding(min_periods=5).mean().fillna(method='bfill').values
            expanding_std = series.expanding(min_periods=5).std().fillna(1).values
            mask = expanding_std > 0
            z_scores[mask] = np.abs((values[mask] - expanding_mean[mask]) / expanding_std[mask])
        
        for i in range(n):
            feature_list = [
                values[i],
                rolling_mean[i],
                rolling_std[i],
                rolling_median[i],
                values[i] - rolling_mean[i] if rolling_std[i] > 0 else 0,
                diff[i],
                diff2[i],
                z_scores[i],
            ]
            features.append(feature_list)
        
        return np.array(features)
    
    def _calculate_adaptive_contamination(
        self, 
        values: np.ndarray, 
        base_contamination: float
    ) -> float:
        mean = np.mean(values)
        std = np.std(values)
        
        if std == 0:
            return 0.001
        
        cv = std / mean if mean != 0 else 1.0
        
        kurtosis = self._calculate_kurtosis(values)
        
        seasonality_score = self._detect_seasonality_strength(values)
        
        contamination = base_contamination
        
        if seasonality_score > 0.5:
            contamination *= 0.3
        
        if kurtosis > 3:
            contamination *= 0.7
        
        if cv > 2.0:
            contamination *= 1.2
        
        contamination = max(0.001, min(0.1, contamination))
        
        print(f"Adaptive contamination calc: cv={cv:.2f}, kurtosis={kurtosis:.2f}, seasonality={seasonality_score:.2f}, final={contamination}")
        
        return contamination
    
    def _calculate_kurtosis(self, values: np.ndarray) -> float:
        n = len(values)
        if n < 4:
            return 0.0
        
        mean = np.mean(values)
        std = np.std(values)
        
        if std == 0:
            return 0.0
        
        standardized = (values - mean) / std
        kurtosis = np.mean(standardized ** 4) - 3
        
        return kurtosis
    
    def _detect_seasonality_strength(self, values: np.ndarray) -> float:
        n = len(values)
        if n < 20:
            return 0.0
        
        acf_scores = []
        for lag in [7, 14, 24, 48, 168]:
            if lag < n // 2:
                series = pd.Series(values)
                acf = series.autocorr(lag=lag)
                if not np.isnan(acf):
                    acf_scores.append(abs(acf))
        
        if acf_scores:
            max_acf = max(acf_scores)
            return min(1.0, max_acf * 1.5)
        
        return 0.0
    
    def _detect_statistical_anomalies(
        self, 
        values: np.ndarray, 
        window_size: int,
        threshold: float
    ) -> List[Tuple[int, float]]:
        n = len(values)
        if n < window_size:
            return []
        
        anomalies = []
        series = pd.Series(values)
        
        rolling_mean = series.rolling(window=window_size, center=False).mean()
        rolling_std = series.rolling(window=window_size, center=False).std()
        
        for i in range(window_size, n):
            if rolling_std[i] > 0:
                z_score = abs((values[i] - rolling_mean[i]) / rolling_std[i])
                if z_score > threshold:
                    anomalies.append((i, z_score))
        
        return anomalies
    
    def _get_severity(self, score: float) -> str:
        if score >= 5.0:
            return "critical"
        elif score >= 3.0:
            return "high"
        elif score >= 2.0:
            return "medium"
        else:
            return "low"
    
    def _check_continuous(self, anomaly_indices: List[int], min_continuous: int) -> List[int]:
        if min_continuous <= 1:
            return anomaly_indices
        
        sorted_indices = sorted(anomaly_indices)
        continuous_anomalies = []
        
        i = 0
        while i < len(sorted_indices):
            count = 1
            start = i
            while i + 1 < len(sorted_indices) and sorted_indices[i + 1] == sorted_indices[i] + 1:
                count += 1
                i += 1
            
            if count >= min_continuous:
                continuous_anomalies.extend(sorted_indices[start:i + 1])
            
            i += 1
        
        return continuous_anomalies
    
    async def detect_anomalies(
        self,
        rule: AnomalyDetectionRule,
        datasource: DataSource,
        start_time: datetime,
        end_time: datetime
    ) -> List[Dict[str, Any]]:
        data = await self.data_query_service.query_timeseries(
            datasource, start_time, end_time
        )
        
        if not data:
            return []
        
        values = [point["value"] for point in data]
        timestamps = [point["timestamp"] for point in data]
        
        anomalies = []
        if rule.algorithm == "3sigma":
            raw_anomalies = self._detect_3sigma(values, rule.threshold)
        elif rule.algorithm == "moving_average":
            raw_anomalies = self._detect_moving_average(values, rule.window_size, rule.threshold)
        elif rule.algorithm == "isolation_forest":
            contamination = rule.params.get("contamination", 0.01)
            raw_anomalies = self._detect_isolation_forest(
                values, 
                contamination,
                rule.window_size,
                rule.threshold
            )
        else:
            return []
        
        anomaly_indices = [idx for idx, score in raw_anomalies]
        continuous_indices = self._check_continuous(anomaly_indices, rule.min_continuous)
        
        anomaly_map = {idx: score for idx, score in raw_anomalies}
        
        for idx in continuous_indices:
            score = anomaly_map[idx]
            severity = self._get_severity(score)
            
            context_start = max(0, idx - 5)
            context_end = min(len(data), idx + 6)
            context_data = {
                "values": values[context_start:context_end],
                "timestamps": [t.isoformat() for t in timestamps[context_start:context_end]],
                "anomaly_index": idx - context_start
            }
            
            anomalies.append({
                "timestamp": timestamps[idx],
                "value": values[idx],
                "severity": severity,
                "score": score,
                "context_data": context_data
            })
        
        return anomalies
    
    async def save_anomaly_records(
        self,
        rule: AnomalyDetectionRule,
        anomalies: List[Dict[str, Any]]
    ) -> List[AnomalyRecord]:
        records = []
        for anomaly in anomalies:
            record = AnomalyRecord(
                datasource_id=rule.datasource_id,
                anomaly_rule_id=rule.id,
                timestamp=anomaly["timestamp"],
                value=anomaly["value"],
                severity=anomaly["severity"],
                description=f"Detected by {rule.algorithm} algorithm with score {anomaly['score']:.2f}",
                context_data=anomaly["context_data"],
                status="new"
            )
            self.db.add(record)
            records.append(record)
        
        await self.db.commit()
        for record in records:
            await self.db.refresh(record)
        
        return records
    
    async def get_anomaly_records(self, limit: int = 100) -> List[AnomalyRecord]:
        result = await self.db.execute(
            select(AnomalyRecord)
            .options(
                selectinload(AnomalyRecord.datasource),
                selectinload(AnomalyRecord.anomaly_rule)
            )
            .order_by(AnomalyRecord.timestamp.desc())
            .limit(limit)
        )
        return result.scalars().all()
    
    async def get_anomaly_record_by_id(self, id: int) -> AnomalyRecord:
        result = await self.db.execute(
            select(AnomalyRecord)
            .where(AnomalyRecord.id == id)
            .options(
                selectinload(AnomalyRecord.datasource),
                selectinload(AnomalyRecord.anomaly_rule)
            )
        )
        return result.scalars().first()
    
    async def update_anomaly_record(self, id: int, update: AnomalyRecordUpdate) -> AnomalyRecord:
        record = await self.get_anomaly_record_by_id(id)
        if record:
            update_data = update.dict(exclude_unset=True)
            for key, value in update_data.items():
                setattr(record, key, value)
            await self.db.commit()
            await self.db.refresh(record)
        return record
    
    async def export_rules(self, ids: List[int] = None) -> List[Dict[str, Any]]:
        query = select(AnomalyDetectionRule).options(selectinload(AnomalyDetectionRule.datasource))
        if ids:
            query = query.where(AnomalyDetectionRule.id.in_(ids))
        
        result = await self.db.execute(query)
        rules = result.scalars().all()
        
        exported = []
        for rule in rules:
            exported.append({
                "name": rule.name,
                "algorithm": rule.algorithm,
                "params": rule.params,
                "window_size": rule.window_size,
                "threshold": rule.threshold,
                "min_continuous": rule.min_continuous,
                "is_active": rule.is_active,
                "datasource_name": rule.datasource.name if rule.datasource else None,
                "exported_at": datetime.utcnow().isoformat(),
                "version": "1.0"
            })
        
        return exported
    
    async def import_rules(
        self,
        rules_data: List[Dict[str, Any]],
        datasource_id_map: Dict[str, int]
    ) -> Dict[str, Any]:
        imported_count = 0
        skipped_count = 0
        errors = []
        created_rules = []
        
        for idx, rule_data in enumerate(rules_data):
            try:
                datasource_name = rule_data.get("datasource_name")
                datasource_id = datasource_id_map.get(datasource_name) if datasource_name else None
                
                if not datasource_id:
                    skipped_count += 1
                    errors.append(f"Rule {idx + 1}: Datasource '{datasource_name}' not found in mapping")
                    continue
                
                existing = await self.db.execute(
                    select(AnomalyDetectionRule).where(
                        AnomalyDetectionRule.name == rule_data["name"],
                        AnomalyDetectionRule.datasource_id == datasource_id
                    )
                )
                if existing.scalars().first():
                    skipped_count += 1
                    errors.append(f"Rule {idx + 1}: Rule '{rule_data['name']}' already exists for this datasource")
                    continue
                
                new_rule = AnomalyDetectionRule(
                    name=rule_data["name"],
                    datasource_id=datasource_id,
                    algorithm=rule_data["algorithm"],
                    params=rule_data.get("params", {}),
                    window_size=rule_data.get("window_size", 60),
                    threshold=rule_data.get("threshold", 3.0),
                    min_continuous=rule_data.get("min_continuous", 1),
                    is_active=rule_data.get("is_active", True)
                )
                
                self.db.add(new_rule)
                imported_count += 1
                created_rules.append(new_rule)
                
            except Exception as e:
                skipped_count += 1
                errors.append(f"Rule {idx + 1}: {str(e)}")
                continue
        
        await self.db.commit()
        
        for rule in created_rules:
            await self.db.refresh(rule)
        
        return {
            "success": True,
            "imported_count": imported_count,
            "skipped_count": skipped_count,
            "total_count": len(rules_data),
            "errors": errors,
            "created_rules": [rule.id for rule in created_rules]
        }
    
    async def analyze_root_cause(self, record_id: int) -> Dict[str, Any]:
        record = await self.get_anomaly_record_by_id(record_id)
        if not record:
            raise ValueError("Anomaly record not found")
        
        anomaly_value = record.value
        anomaly_timestamp = record.timestamp
        datasource = record.datasource
        anomaly_rule = record.anomaly_rule
        
        analysis_steps = []
        
        analysis_steps.append({
            "title": "步骤1: 基础信息收集",
            "description": "收集异常点的基础信息，包括异常值、时间戳、严重程度等",
            "status": "success",
            "details": {
                "异常值": anomaly_value,
                "异常时间": anomaly_timestamp.isoformat(),
                "严重程度": record.severity,
                "算法": anomaly_rule.algorithm if anomaly_rule else "Unknown"
            }
        })
        
        historical_context = await self._analyze_historical_context(
            datasource,
            anomaly_timestamp,
            anomaly_value
        )
        
        analysis_steps.append({
            "title": "步骤2: 历史数据分析",
            "description": "分析异常点之前的历史数据，确定正常值范围和趋势",
            "status": "success" if historical_context["status"] == "normal" else "warning",
            "value": f"{historical_context['mean']:.2f} ± {historical_context['std']:.2f}",
            "label": "历史均值±标准差",
            "value_color": "blue"
        })
        
        trend_analysis = await self._analyze_trend(
            datasource,
            anomaly_timestamp,
            anomaly_value
        )
        
        analysis_steps.append({
            "title": "步骤3: 趋势分析",
            "description": "分析异常点前后的数据趋势，判断是突发异常还是渐变异常",
            "status": "success",
            "value": trend_analysis["trend"],
            "label": "趋势类型",
            "value_color": "orange" if trend_analysis["trend"] == "spike" else "blue"
        })
        
        statistical_analysis = self._analyze_statistical_significance(
            anomaly_value,
            historical_context["mean"],
            historical_context["std"]
        )
        
        analysis_steps.append({
            "title": "步骤4: 统计显著性分析",
            "description": "计算异常值与历史数据的统计偏离程度",
            "status": "success",
            "value": f"{statistical_analysis['z_score']:.2f}σ",
            "label": "Z-Score",
            "value_color": "red" if statistical_analysis["z_score"] > 3 else "orange"
        })
        
        pattern_analysis = await self._analyze_pattern(
            datasource,
            anomaly_timestamp,
            anomaly_value
        )
        
        analysis_steps.append({
            "title": "步骤5: 模式匹配分析",
            "description": "检测异常点是否符合已知的异常模式（如尖峰、持续下降等）",
            "status": "success",
            "value": pattern_analysis["pattern"],
            "label": "异常模式",
            "value_color": "purple"
        })
        
        possible_causes = self._generate_possible_causes(
            record,
            historical_context,
            trend_analysis,
            statistical_analysis,
            pattern_analysis
        )
        
        related_metrics = self._generate_related_metrics(
            record,
            historical_context,
            trend_analysis
        )
        
        return {
            "success": True,
            "record_id": record_id,
            "analysis_steps": analysis_steps,
            "possible_causes": possible_causes,
            "related_metrics": related_metrics,
            "summary": {
                "anomaly_value": anomaly_value,
                "deviation_from_mean": statistical_analysis["z_score"],
                "trend": trend_analysis["trend"],
                "pattern": pattern_analysis["pattern"]
            }
        }
    
    async def _analyze_historical_context(
        self,
        datasource,
        anomaly_timestamp: datetime,
        anomaly_value: float
    ) -> Dict[str, Any]:
        try:
            end_time = anomaly_timestamp
            start_time = end_time - timedelta(hours=24)
            
            data = await self.data_query_service.query_timeseries(
                datasource, start_time, end_time, "mean", "5m"
            )
            
            if not data or len(data) < 10:
                return {
                    "status": "insufficient_data",
                    "mean": anomaly_value,
                    "std": 0.0,
                    "min": anomaly_value,
                    "max": anomaly_value,
                    "percentile_95": anomaly_value,
                    "percentile_5": anomaly_value,
                    "data_points": len(data)
                }
            
            values = [point["value"] for point in data]
            values_array = np.array(values)
            
            return {
                "status": "normal",
                "mean": float(np.mean(values_array)),
                "std": float(np.std(values_array)),
                "min": float(np.min(values_array)),
                "max": float(np.max(values_array)),
                "percentile_95": float(np.percentile(values_array, 95)),
                "percentile_5": float(np.percentile(values_array, 5)),
                "data_points": len(data)
            }
            
        except Exception as e:
            print(f"Historical context analysis error: {e}")
            return {
                "status": "error",
                "mean": anomaly_value,
                "std": 0.0,
                "min": anomaly_value,
                "max": anomaly_value,
                "percentile_95": anomaly_value,
                "percentile_5": anomaly_value,
                "data_points": 0,
                "error": str(e)
            }
    
    async def _analyze_trend(
        self,
        datasource,
        anomaly_timestamp: datetime,
        anomaly_value: float
    ) -> Dict[str, Any]:
        try:
            end_time = anomaly_timestamp
            start_time = end_time - timedelta(hours=2)
            
            data = await self.data_query_service.query_timeseries(
                datasource, start_time, end_time, "mean", "1m"
            )
            
            if not data or len(data) < 10:
                return {
                    "trend": "unknown",
                    "direction": "unknown",
                    "rate_of_change": 0.0,
                    "data_points": len(data)
                }
            
            values = [point["value"] for point in data]
            
            if len(values) > 1:
                recent_values = values[-20:] if len(values) > 20 else values
                x = np.arange(len(recent_values))
                y = np.array(recent_values)
                
                if len(x) > 1 and np.std(x) > 0:
                    slope, _ = np.polyfit(x, y, 1)
                    
                    if len(recent_values) >= 3:
                        last_change = recent_values[-1] - recent_values[-2]
                        if abs(last_change) > abs(slope) * 5:
                            trend = "spike"
                        elif slope > 0:
                            trend = "rising"
                        elif slope < 0:
                            trend = "falling"
                        else:
                            trend = "stable"
                        
                        direction = "up" if last_change > 0 else "down" if last_change < 0 else "stable"
                        
                        return {
                            "trend": trend,
                            "direction": direction,
                            "rate_of_change": float(slope),
                            "last_change": float(last_change),
                            "data_points": len(data)
                        }
            
            return {
                "trend": "stable",
                "direction": "unknown",
                "rate_of_change": 0.0,
                "data_points": len(data)
            }
            
        except Exception as e:
            print(f"Trend analysis error: {e}")
            return {
                "trend": "unknown",
                "direction": "unknown",
                "rate_of_change": 0.0,
                "data_points": 0,
                "error": str(e)
            }
    
    def _analyze_statistical_significance(
        self,
        anomaly_value: float,
        historical_mean: float,
        historical_std: float
    ) -> Dict[str, Any]:
        if historical_std == 0 or historical_std is None:
            return {
                "z_score": 0.0,
                "significance": "unknown",
                "deviation_percentage": 0.0
            }
        
        z_score = (anomaly_value - historical_mean) / historical_std
        
        deviation_percentage = ((anomaly_value - historical_mean) / historical_mean * 100) if historical_mean != 0 else 0
        
        if abs(z_score) >= 5:
            significance = "extreme"
        elif abs(z_score) >= 3:
            significance = "high"
        elif abs(z_score) >= 2:
            significance = "medium"
        else:
            significance = "low"
        
        return {
            "z_score": float(z_score),
            "significance": significance,
            "deviation_percentage": float(deviation_percentage),
            "historical_mean": float(historical_mean),
            "historical_std": float(historical_std)
        }
    
    async def _analyze_pattern(
        self,
        datasource,
        anomaly_timestamp: datetime,
        anomaly_value: float
    ) -> Dict[str, Any]:
        try:
            end_time = anomaly_timestamp + timedelta(hours=1)
            start_time = anomaly_timestamp - timedelta(hours=2)
            
            data = await self.data_query_service.query_timeseries(
                datasource, start_time, end_time, "mean", "1m"
            )
            
            if not data or len(data) < 10:
                return {
                    "pattern": "unknown",
                    "description": "数据不足，无法进行模式分析"
                }
            
            values = [point["value"] for point in data]
            timestamps = [point["timestamp"] for point in data]
            
            anomaly_idx = None
            for i, ts in enumerate(timestamps):
                if ts >= anomaly_timestamp:
                    anomaly_idx = i
                    break
            
            if anomaly_idx is None or anomaly_idx < 3 or anomaly_idx >= len(values) - 3:
                return {
                    "pattern": "isolated",
                    "description": "异常点为孤立点"
                }
            
            before_values = values[max(0, anomaly_idx - 10):anomaly_idx]
            after_values = values[anomaly_idx:min(len(values), anomaly_idx + 10)]
            
            if len(before_values) >= 3 and len(after_values) >= 3:
                before_mean = np.mean(before_values)
                after_mean = np.mean(after_values)
                before_std = np.std(before_values)
                
                if before_std > 0:
                    spike_score = (anomaly_value - before_mean) / before_std
                    recovery_score = (after_mean - before_mean) / before_std if before_mean != 0 else 0
                    
                    if abs(spike_score) > 3 and abs(recovery_score) < 1:
                        return {
                            "pattern": "spike",
                            "description": "尖峰异常 - 数值突然上升后快速恢复"
                        }
                    elif abs(spike_score) > 2 and abs(recovery_score) > 2:
                        return {
                            "pattern": "level_shift",
                            "description": "水平位移 - 数值发生永久性变化"
                        }
                    elif abs(spike_score) > 2 and recovery_score * spike_score < 0:
                        return {
                            "pattern": "drop",
                            "description": "突降异常 - 数值突然下降"
                        }
            
            return {
                "pattern": "isolated",
                "description": "孤立异常点"
            }
            
        except Exception as e:
            print(f"Pattern analysis error: {e}")
            return {
                "pattern": "unknown",
                "description": f"分析出错: {str(e)}"
            }
    
    def _generate_possible_causes(
        self,
        record,
        historical_context,
        trend_analysis,
        statistical_analysis,
        pattern_analysis
    ) -> List[Dict[str, Any]]:
        causes = []
        z_score = abs(statistical_analysis.get("z_score", 0))
        trend = trend_analysis.get("trend", "stable")
        pattern = pattern_analysis.get("pattern", "unknown")
        
        if pattern == "spike" or z_score >= 5:
            causes.append({
                "cause": "突发性系统故障",
                "likelihood": 0.85,
                "description": "数值出现极端偏离（Z-Score >= 5σ），可能是硬件故障、网络中断或服务崩溃",
                "suggestion": "检查相关系统的健康状态，查看错误日志，确认是否有服务中断事件"
            })
        
        if trend == "rising":
            causes.append({
                "cause": "资源消耗持续增长",
                "likelihood": 0.75,
                "description": "检测到持续上升趋势，可能是内存泄漏、连接数积累或处理队列堆积",
                "suggestion": "检查系统资源使用情况，分析增长速率，考虑扩容或重启服务"
            })
        
        if trend == "falling":
            causes.append({
                "cause": "服务降级或流量下降",
                "likelihood": 0.70,
                "description": "检测到持续下降趋势，可能是服务降级、负载均衡问题或用户流量下降",
                "suggestion": "检查服务健康状态，确认是否有配置变更，分析业务流量变化"
            })
        
        if pattern == "level_shift":
            causes.append({
                "cause": "配置变更或部署影响",
                "likelihood": 0.80,
                "description": "检测到永久性水平位移，可能是配置更新、新版本部署或基础设施变更",
                "suggestion": "检查最近的部署记录，确认配置变更，回滚或调整配置"
            })
        
        if 3 <= z_score < 5:
            causes.append({
                "cause": "负载突增或高峰流量",
                "likelihood": 0.65,
                "description": "数值明显偏离（3-5σ），可能是业务高峰、活动推广或异常流量",
                "suggestion": "检查业务事件日历，分析流量来源，确认是否为正常业务波动"
            })
        
        if pattern == "drop":
            causes.append({
                "cause": "外部依赖故障",
                "likelihood": 0.70,
                "description": "数值突然下降，可能是数据库连接失败、缓存服务不可用或第三方API异常",
                "suggestion": "检查外部依赖服务状态，查看连接池情况，确认网络连通性"
            })
        
        if z_score < 3:
            causes.append({
                "cause": "正常业务波动",
                "likelihood": 0.50,
                "description": "偏离程度较低（< 3σ），可能是正常的业务波动或周期性变化",
                "suggestion": "观察后续趋势，结合业务场景判断是否需要处理"
            })
        
        causes.sort(key=lambda x: x["likelihood"], reverse=True)
        
        return causes[:5]
    
    def _generate_related_metrics(
        self,
        record,
        historical_context,
        trend_analysis
    ) -> List[Dict[str, Any]]:
        metrics = []
        
        metrics.append({
            "name": "历史均值",
            "value": round(historical_context.get("mean", 0), 2),
            "unit": "",
            "trend": "stable"
        })
        
        metrics.append({
            "name": "历史标准差",
            "value": round(historical_context.get("std", 0), 2),
            "unit": "",
            "trend": "stable"
        })
        
        deviation = record.value - historical_context.get("mean", 0)
        metrics.append({
            "name": "偏离值",
            "value": round(deviation, 2),
            "unit": "",
            "trend": "up" if deviation > 0 else "down"
        })
        
        rate = trend_analysis.get("rate_of_change", 0)
        metrics.append({
            "name": "变化速率",
            "value": round(rate, 4),
            "unit": "/点",
            "trend": "up" if rate > 0 else "down" if rate < 0 else "stable"
        })
        
        if historical_context.get("mean", 0) != 0:
            deviation_pct = (deviation / historical_context["mean"]) * 100
            metrics.append({
                "name": "偏离百分比",
                "value": round(deviation_pct, 2),
                "unit": "%",
                "trend": "up" if deviation_pct > 0 else "down"
            })
        
        return metrics
