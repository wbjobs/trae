import os
import threading
from typing import Optional, Dict, Any
from datetime import datetime, timedelta
from apscheduler.schedulers.background import BackgroundScheduler
from apscheduler.triggers.interval import IntervalTrigger
from dotenv import load_dotenv

load_dotenv()


class TrainingScheduler:
    _instance = None
    _scheduler = None
    _training_job = None
    _next_run_time = None
    _last_run_time = None
    _last_run_result = None
    _is_running = False
    _auto_training_enabled = False
    _training_interval_days = 7

    def __new__(cls):
        if cls._instance is None:
            cls._instance = super().__new__(cls)
            cls._init_scheduler()
        return cls._instance

    @classmethod
    def _init_scheduler(cls):
        cls._scheduler = BackgroundScheduler()
        cls._auto_training_enabled = os.getenv("AUTO_TRAINING_ENABLED", "false").lower() == "true"
        cls._training_interval_days = int(os.getenv("TRAINING_INTERVAL_DAYS", "7"))
        
        if cls._auto_training_enabled:
            cls._schedule_auto_training()
        
        cls._scheduler.start()
        print(f"Training scheduler initialized. Auto training: {cls._auto_training_enabled}")

    @classmethod
    def _schedule_auto_training(cls):
        if cls._training_job is not None:
            cls._scheduler.remove_job(cls._training_job.id)
        
        trigger = IntervalTrigger(days=cls._training_interval_days)
        cls._training_job = cls._scheduler.add_job(
            cls._run_training_job,
            trigger=trigger,
            id="weekly_training",
            replace_existing=True
        )
        
        cls._next_run_time = cls._training_job.next_run_time
        print(f"Scheduled weekly training. Next run: {cls._next_run_time}")

    @classmethod
    def _run_training_job(cls):
        if cls._is_running:
            print("Training already in progress, skipping scheduled run")
            return
        
        print("Starting scheduled training job...")
        cls._is_running = True
        cls._last_run_time = datetime.now()
        
        try:
            result = cls._execute_training()
            cls._last_run_result = "success"
            print(f"Scheduled training completed successfully: {result}")
        except Exception as e:
            cls._last_run_result = f"failed: {str(e)}"
            print(f"Scheduled training failed: {e}")
        finally:
            cls._is_running = False
            if cls._training_job:
                cls._next_run_time = cls._training_job.next_run_time

    @classmethod
    def _execute_training(cls) -> Dict[str, Any]:
        from services.lora_trainer import CLIPLoRATrainer
        from services.feedback_store import FeedbackStore
        from services.vector_db import VectorDBService
        from services.ab_testing import ModelVersionManager
        
        feedback_store = FeedbackStore()
        vector_db = VectorDBService()
        model_manager = ModelVersionManager()
        
        min_samples = int(os.getenv("MIN_TRAINING_SAMPLES", "10"))
        feedback_stats = feedback_store.get_feedback_stats()
        
        if feedback_stats["pending_training_samples"] < min_samples:
            return {
                "success": False,
                "message": f"Insufficient samples: {feedback_stats['pending_training_samples']} < {min_samples}"
            }
        
        trainer = CLIPLoRATrainer(
            base_model_name=os.getenv("CLIP_MODEL_NAME", "openai/clip-vit-base-patch32"),
            output_dir=os.getenv("MODELS_DIR", "./models")
        )
        
        config = {
            "lora_rank": int(os.getenv("LORA_RANK", "8")),
            "lora_alpha": int(os.getenv("LORA_ALPHA", "16")),
            "lora_dropout": float(os.getenv("LORA_DROPOUT", "0.05")),
            "batch_size": int(os.getenv("BATCH_SIZE", "8")),
            "learning_rate": float(os.getenv("LEARNING_RATE", "1e-4")),
            "num_epochs": int(os.getenv("NUM_EPOCHS", "3")),
        }
        
        result = trainer.train_from_feedback(
            feedback_store=feedback_store,
            vector_db=vector_db,
            config=config,
            min_samples=min_samples
        )
        
        if result["success"]:
            version = model_manager.create_version(
                base_model=os.getenv("CLIP_MODEL_NAME", "openai/clip-vit-base-patch32"),
                adapter_path=result["adapter_path"],
                training_samples=result["metrics"].get("training_samples", 0),
                metrics=result["metrics"],
                description=f"Weekly auto-training at {datetime.now().isoformat()}"
            )
            
            model_manager.update_version(
                version,
                status="deployed",
                trained_at=datetime.now().isoformat(),
                deployed_at=datetime.now().isoformat()
            )
            
            from services.lru_cache import SearchCache
            search_cache = SearchCache()
            search_cache.clear_all()
            
            return {
                "success": True,
                "version": version,
                "adapter_path": result["adapter_path"],
                "metrics": result["metrics"]
            }
        else:
            return result

    def start_auto_training(self, interval_days: Optional[int] = None):
        if interval_days is not None:
            self._training_interval_days = interval_days
        
        self._auto_training_enabled = True
        self._schedule_auto_training()
        print(f"Auto training enabled. Interval: {self._training_interval_days} days")

    def stop_auto_training(self):
        self._auto_training_enabled = False
        if self._training_job:
            self._scheduler.remove_job(self._training_job.id)
            self._training_job = None
            self._next_run_time = None
        print("Auto training disabled")

    def trigger_manual_training(self) -> Dict[str, Any]:
        if self._is_running:
            return {
                "success": False,
                "message": "Training already in progress"
            }
        
        training_thread = threading.Thread(target=self._run_training_job)
        training_thread.start()
        
        return {
            "success": True,
            "message": "Training started in background"
        }

    def get_status(self) -> Dict[str, Any]:
        return {
            "auto_training_enabled": self._auto_training_enabled,
            "training_interval_days": self._training_interval_days,
            "is_running": self._is_running,
            "next_run_time": self._next_run_time.isoformat() if self._next_run_time else None,
            "last_run_time": self._last_run_time.isoformat() if self._last_run_time else None,
            "last_run_result": self._last_run_result,
        }

    def shutdown(self):
        if self._scheduler:
            self._scheduler.shutdown()
            print("Training scheduler shutdown")
