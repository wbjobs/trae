import os
import json
import sqlite3
import uuid
from typing import List, Optional, Dict, Any, Tuple
from datetime import datetime, timedelta
from pathlib import Path
from dotenv import load_dotenv

load_dotenv()


class FeedbackStore:
    _instance = None
    _conn = None
    _db_path = None

    def __new__(cls):
        if cls._instance is None:
            cls._instance = super().__new__(cls)
            cls._init_db()
        return cls._instance

    @classmethod
    def _init_db(cls):
        data_dir = Path(os.getenv("CHROMA_PERSIST_DIR", "./data")).parent
        cls._db_path = data_dir / "feedback.db"
        
        cls._conn = sqlite3.connect(str(cls._db_path), check_same_thread=False)
        cls._conn.row_factory = sqlite3.Row
        
        cls._create_tables()
        print(f"Feedback store initialized at: {cls._db_path}")

    @classmethod
    def _create_tables(cls):
        cursor = cls._conn.cursor()
        
        cursor.execute("""
            CREATE TABLE IF NOT EXISTS feedback (
                id TEXT PRIMARY KEY,
                query_id TEXT NOT NULL,
                result_id TEXT NOT NULL,
                feedback_type TEXT NOT NULL,
                query_text TEXT,
                session_id TEXT,
                user_id TEXT,
                created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
                additional_data TEXT
            )
        """)
        
        cursor.execute("""
            CREATE TABLE IF NOT EXISTS model_versions (
                version TEXT PRIMARY KEY,
                base_model TEXT NOT NULL,
                adapter_path TEXT,
                status TEXT NOT NULL,
                created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
                trained_at TIMESTAMP,
                deployed_at TIMESTAMP,
                training_samples INTEGER DEFAULT 0,
                metrics TEXT,
                description TEXT
            )
        """)
        
        cursor.execute("""
            CREATE TABLE IF NOT EXISTS ab_experiments (
                id TEXT PRIMARY KEY,
                name TEXT NOT NULL,
                description TEXT,
                status TEXT NOT NULL,
                variants TEXT NOT NULL,
                created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
                started_at TIMESTAMP,
                ended_at TIMESTAMP,
                primary_metric TEXT DEFAULT 'click_through_rate',
                metrics TEXT
            )
        """)
        
        cursor.execute("""
            CREATE TABLE IF NOT EXISTS training_runs (
                id TEXT PRIMARY KEY,
                model_version TEXT NOT NULL,
                started_at TIMESTAMP,
                ended_at TIMESTAMP,
                status TEXT NOT NULL,
                feedback_count INTEGER DEFAULT 0,
                metrics TEXT,
                error_message TEXT
            )
        """)
        
        cursor.execute("""
            CREATE INDEX IF NOT EXISTS idx_feedback_query ON feedback(query_id)
        """)
        cursor.execute("""
            CREATE INDEX IF NOT EXISTS idx_feedback_user ON feedback(user_id)
        """)
        cursor.execute("""
            CREATE INDEX IF NOT EXISTS idx_feedback_created ON feedback(created_at)
        """)
        
        cls._conn.commit()

    def add_feedback(
        self,
        query_id: str,
        result_id: str,
        feedback_type: str,
        query_text: Optional[str] = None,
        session_id: Optional[str] = None,
        user_id: Optional[str] = None,
        additional_data: Optional[Dict[str, Any]] = None
    ) -> str:
        feedback_id = str(uuid.uuid4())
        
        cursor = self._conn.cursor()
        cursor.execute("""
            INSERT INTO feedback (id, query_id, result_id, feedback_type, query_text, session_id, user_id, additional_data)
            VALUES (?, ?, ?, ?, ?, ?, ?, ?)
        """, (
            feedback_id,
            query_id,
            result_id,
            feedback_type,
            query_text,
            session_id,
            user_id,
            json.dumps(additional_data) if additional_data else None
        ))
        self._conn.commit()
        
        return feedback_id

    def get_feedback(
        self,
        start_date: Optional[datetime] = None,
        end_date: Optional[datetime] = None,
        feedback_type: Optional[str] = None,
        user_id: Optional[str] = None,
        limit: int = 1000,
        offset: int = 0
    ) -> List[Dict[str, Any]]:
        query = "SELECT * FROM feedback WHERE 1=1"
        params = []
        
        if start_date:
            query += " AND created_at >= ?"
            params.append(start_date.isoformat())
        if end_date:
            query += " AND created_at <= ?"
            params.append(end_date.isoformat())
        if feedback_type:
            query += " AND feedback_type = ?"
            params.append(feedback_type)
        if user_id:
            query += " AND user_id = ?"
            params.append(user_id)
        
        query += " ORDER BY created_at DESC LIMIT ? OFFSET ?"
        params.extend([limit, offset])
        
        cursor = self._conn.cursor()
        cursor.execute(query, params)
        rows = cursor.fetchall()
        
        results = []
        for row in rows:
            item = dict(row)
            if item["additional_data"]:
                item["additional_data"] = json.loads(item["additional_data"])
            results.append(item)
        
        return results

    def get_training_pairs(
        self,
        min_samples: int = 10,
        since_date: Optional[datetime] = None
    ) -> List[Dict[str, Any]]:
        if since_date is None:
            since_date = datetime.now() - timedelta(days=30)
        
        cursor = self._conn.cursor()
        cursor.execute("""
            SELECT query_text, result_id, feedback_type, created_at
            FROM feedback 
            WHERE created_at >= ? AND query_text IS NOT NULL
            ORDER BY created_at DESC
        """, (since_date.isoformat(),))
        
        rows = cursor.fetchall()
        
        pairs = []
        for row in rows:
            pairs.append({
                "text": row["query_text"],
                "result_id": row["result_id"],
                "feedback": row["feedback_type"],
                "created_at": row["created_at"]
            })
        
        return pairs

    def get_feedback_stats(self) -> Dict[str, Any]:
        cursor = self._conn.cursor()
        
        cursor.execute("SELECT COUNT(*) as total FROM feedback")
        total = cursor.fetchone()["total"]
        
        cursor.execute("SELECT feedback_type, COUNT(*) as count FROM feedback GROUP BY feedback_type")
        type_counts = {row["feedback_type"]: row["count"] for row in cursor.fetchall()}
        
        week_ago = datetime.now() - timedelta(days=7)
        cursor.execute("SELECT COUNT(*) as count FROM feedback WHERE created_at >= ?", (week_ago.isoformat(),))
        last_7_days = cursor.fetchone()["count"]
        
        cursor.execute("SELECT COUNT(DISTINCT query_id) as count FROM feedback")
        unique_queries = cursor.fetchone()["count"]
        
        cursor.execute("SELECT COUNT(*) as count FROM feedback WHERE created_at >= ?", 
                      ((datetime.now() - timedelta(days=7)).isoformat(),))
        pending = cursor.fetchone()["count"]
        
        return {
            "total_feedbacks": total,
            "likes": type_counts.get("like", 0),
            "dislikes": type_counts.get("dislike", 0),
            "neutrals": type_counts.get("neutral", 0),
            "last_7_days": last_7_days,
            "unique_queries": unique_queries,
            "pending_training_samples": pending
        }

    def save_model_version(
        self,
        version: str,
        base_model: str,
        status: str,
        adapter_path: Optional[str] = None,
        training_samples: int = 0,
        metrics: Optional[Dict[str, float]] = None,
        description: Optional[str] = None
    ) -> None:
        cursor = self._conn.cursor()
        cursor.execute("""
            INSERT OR REPLACE INTO model_versions 
            (version, base_model, adapter_path, status, training_samples, metrics, description, created_at)
            VALUES (?, ?, ?, ?, ?, ?, ?, ?)
        """, (
            version,
            base_model,
            adapter_path,
            status,
            training_samples,
            json.dumps(metrics) if metrics else None,
            description,
            datetime.now().isoformat()
        ))
        self._conn.commit()

    def update_model_version_status(self, version: str, status: str, **kwargs) -> None:
        cursor = self._conn.cursor()
        
        updates = []
        params = []
        
        for key, value in kwargs.items():
            if key == "metrics":
                updates.append(f"{key} = ?")
                params.append(json.dumps(value))
            else:
                updates.append(f"{key} = ?")
                params.append(value)
        
        updates.append("status = ?")
        params.append(status)
        params.append(version)
        
        query = f"UPDATE model_versions SET {', '.join(updates)} WHERE version = ?"
        cursor.execute(query, params)
        self._conn.commit()

    def get_model_versions(self, status: Optional[str] = None) -> List[Dict[str, Any]]:
        cursor = self._conn.cursor()
        
        if status:
            cursor.execute("SELECT * FROM model_versions WHERE status = ? ORDER BY created_at DESC", (status,))
        else:
            cursor.execute("SELECT * FROM model_versions ORDER BY created_at DESC")
        
        rows = cursor.fetchall()
        results = []
        for row in rows:
            item = dict(row)
            if item["metrics"]:
                item["metrics"] = json.loads(item["metrics"])
            results.append(item)
        
        return results

    def get_deployed_version(self) -> Optional[Dict[str, Any]]:
        versions = self.get_model_versions(status="deployed")
        return versions[0] if versions else None

    def save_ab_experiment(
        self,
        experiment_id: str,
        name: str,
        variants: List[Dict[str, Any]],
        status: str = "draft",
        description: Optional[str] = None,
        primary_metric: str = "click_through_rate"
    ) -> None:
        cursor = self._conn.cursor()
        cursor.execute("""
            INSERT OR REPLACE INTO ab_experiments 
            (id, name, description, status, variants, primary_metric, created_at)
            VALUES (?, ?, ?, ?, ?, ?, ?)
        """, (
            experiment_id,
            name,
            description,
            status,
            json.dumps(variants),
            primary_metric,
            datetime.now().isoformat()
        ))
        self._conn.commit()

    def update_ab_experiment_status(self, experiment_id: str, status: str, **kwargs) -> None:
        cursor = self._conn.cursor()
        
        updates = []
        params = []
        
        for key, value in kwargs.items():
            if key == "metrics":
                updates.append(f"{key} = ?")
                params.append(json.dumps(value))
            elif key == "variants":
                updates.append(f"{key} = ?")
                params.append(json.dumps(value))
            else:
                updates.append(f"{key} = ?")
                params.append(value)
        
        updates.append("status = ?")
        params.append(status)
        params.append(experiment_id)
        
        query = f"UPDATE ab_experiments SET {', '.join(updates)} WHERE id = ?"
        cursor.execute(query, params)
        self._conn.commit()

    def get_ab_experiments(self, status: Optional[str] = None) -> List[Dict[str, Any]]:
        cursor = self._conn.cursor()
        
        if status:
            cursor.execute("SELECT * FROM ab_experiments WHERE status = ? ORDER BY created_at DESC", (status,))
        else:
            cursor.execute("SELECT * FROM ab_experiments ORDER BY created_at DESC")
        
        rows = cursor.fetchall()
        results = []
        for row in rows:
            item = dict(row)
            if item["variants"]:
                item["variants"] = json.loads(item["variants"])
            if item["metrics"]:
                item["metrics"] = json.loads(item["metrics"])
            results.append(item)
        
        return results

    def get_running_experiment(self) -> Optional[Dict[str, Any]]:
        experiments = self.get_ab_experiments(status="running")
        return experiments[0] if experiments else None

    def create_training_run(self, model_version: str) -> str:
        run_id = str(uuid.uuid4())
        cursor = self._conn.cursor()
        cursor.execute("""
            INSERT INTO training_runs (id, model_version, status, started_at)
            VALUES (?, ?, ?, ?)
        """, (run_id, model_version, "running", datetime.now().isoformat()))
        self._conn.commit()
        return run_id

    def complete_training_run(
        self,
        run_id: str,
        status: str,
        feedback_count: int = 0,
        metrics: Optional[Dict[str, float]] = None,
        error_message: Optional[str] = None
    ) -> None:
        cursor = self._conn.cursor()
        cursor.execute("""
            UPDATE training_runs 
            SET status = ?, ended_at = ?, feedback_count = ?, metrics = ?, error_message = ?
            WHERE id = ?
        """, (
            status,
            datetime.now().isoformat(),
            feedback_count,
            json.dumps(metrics) if metrics else None,
            error_message,
            run_id
        ))
        self._conn.commit()

    def get_training_runs(self, limit: int = 10) -> List[Dict[str, Any]]:
        cursor = self._conn.cursor()
        cursor.execute("SELECT * FROM training_runs ORDER BY started_at DESC LIMIT ?", (limit,))
        
        rows = cursor.fetchall()
        results = []
        for row in rows:
            item = dict(row)
            if item["metrics"]:
                item["metrics"] = json.loads(item["metrics"])
            results.append(item)
        
        return results

    def close(self):
        if self._conn:
            self._conn.close()
