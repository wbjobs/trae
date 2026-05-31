import json
import os
import time
import csv
from datetime import datetime
from typing import Dict, Any, List, Optional
import logging

logger = logging.getLogger(__name__)


class ResultArchiver:
    def __init__(self, base_dir: str = "logs", archive_format: str = "json"):
        self.base_dir = base_dir
        self.archive_format = archive_format
        self._ensure_dirs()

    def _ensure_dirs(self) -> None:
        if not os.path.exists(self.base_dir):
            os.makedirs(self.base_dir, exist_ok=True)
        
        date_str = datetime.now().strftime("%Y-%m-%d")
        self.date_dir = os.path.join(self.base_dir, date_str)
        if not os.path.exists(self.date_dir):
            os.makedirs(self.date_dir, exist_ok=True)

    def save(self, inspection_type: str, results: Dict[str, Any], 
             extra_info: Optional[Dict[str, Any]] = None) -> str:
        self._ensure_dirs()
        
        timestamp = datetime.now().strftime("%H%M%S")
        filename = f"{inspection_type}_{timestamp}.{self.archive_format}"
        filepath = os.path.join(self.date_dir, filename)
        
        data = {
            "inspection_type": inspection_type,
            "timestamp": datetime.now().isoformat(),
            "results": results
        }
        if extra_info:
            data.update(extra_info)
        
        if self.archive_format == "json":
            with open(filepath, "w", encoding="utf-8") as f:
                json.dump(data, f, ensure_ascii=False, indent=2)
        elif self.archive_format == "csv":
            self._save_csv(filepath, data)
        
        logger.info(f"Results saved to {filepath}")
        return filepath

    def _save_csv(self, filepath: str, data: Dict[str, Any]) -> None:
        results = data.get("results", {})
        with open(filepath, "w", newline="", encoding="utf-8") as f:
            writer = csv.writer(f)
            writer.writerow(["host", "status", "details"])
            for host, result in results.items():
                status = "success" if result.get("success", False) else "failed"
                details = json.dumps(result, ensure_ascii=False)
                writer.writerow([host, status, details])

    def list_archives(self, date: Optional[str] = None) -> List[str]:
        if date:
            target_dir = os.path.join(self.base_dir, date)
        else:
            target_dir = self.date_dir
        
        if not os.path.exists(target_dir):
            return []
        
        files = []
        for f in os.listdir(target_dir):
            if f.endswith(f".{self.archive_format}"):
                files.append(os.path.join(target_dir, f))
        return sorted(files)

    def load_archive(self, filepath: str) -> Dict[str, Any]:
        if not os.path.exists(filepath):
            return {}
        
        with open(filepath, "r", encoding="utf-8") as f:
            if filepath.endswith(".json"):
                return json.load(f)
            elif filepath.endswith(".csv"):
                return self._load_csv(filepath)
        return {}

    def _load_csv(self, filepath: str) -> Dict[str, Any]:
        results = {}
        with open(filepath, "r", encoding="utf-8") as f:
            reader = csv.DictReader(f)
            for row in reader:
                host = row["host"]
                results[host] = {
                    "status": row["status"],
                    "details": json.loads(row["details"])
                }
        return {"results": results}

    def cleanup_old(self, days: int = 30) -> int:
        cutoff = time.time() - days * 86400
        removed = 0
        
        for root, dirs, files in os.walk(self.base_dir):
            for f in files:
                filepath = os.path.join(root, f)
                if os.path.getmtime(filepath) < cutoff:
                    os.remove(filepath)
                    removed += 1
        
        for root, dirs, files in os.walk(self.base_dir, topdown=False):
            if not os.listdir(root) and root != self.base_dir:
                os.rmdir(root)
        
        logger.info(f"Cleaned up {removed} old files")
        return removed
