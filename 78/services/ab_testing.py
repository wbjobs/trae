import os
import hashlib
import uuid
import random
from typing import Optional, Dict, Any, List
from datetime import datetime
from dotenv import load_dotenv

from services.feedback_store import FeedbackStore
from services.lora_trainer import LoRAInferenceService

load_dotenv()


class ABTestManager:
    _instance = None
    _feedback_store = None
    _inference_services = {}

    def __new__(cls):
        if cls._instance is None:
            cls._instance = super().__new__(cls)
            cls._feedback_store = FeedbackStore()
        return cls._instance

    def create_experiment(
        self,
        name: str,
        variants: List[Dict[str, Any]],
        description: Optional[str] = None,
        primary_metric: str = "click_through_rate"
    ) -> str:
        experiment_id = str(uuid.uuid4())
        
        total_traffic = sum(v.get("traffic_percentage", 0) for v in variants)
        if total_traffic != 100:
            raise ValueError(f"Total traffic percentage must sum to 100%, got {total_traffic}%")
        
        for variant in variants:
            if "name" not in variant:
                raise ValueError("Each variant must have a 'name' field")
            if "model_version" not in variant:
                raise ValueError("Each variant must have a 'model_version' field")
        
        self._feedback_store.save_ab_experiment(
            experiment_id=experiment_id,
            name=name,
            variants=variants,
            status="draft",
            description=description,
            primary_metric=primary_metric
        )
        
        return experiment_id

    def start_experiment(self, experiment_id: str) -> None:
        experiment = self._get_experiment_by_id(experiment_id)
        if not experiment:
            raise ValueError(f"Experiment not found")
        
        running = self._feedback_store.get_running_experiment()
        if running and running["id"] != experiment_id:
            raise ValueError("Another experiment is already running")
        
        self._feedback_store.update_ab_experiment_status(
            experiment_id,
            "running",
            started_at=datetime.now().isoformat()
        )

    def pause_experiment(self, experiment_id: str) -> None:
        self._feedback_store.update_ab_experiment_status(
            experiment_id,
            "paused"
        )

    def end_experiment(self, experiment_id: str) -> None:
        self._feedback_store.update_ab_experiment_status(
            experiment_id,
            "completed",
            ended_at=datetime.now().isoformat()
        )

    def get_experiments(self, status: Optional[str] = None) -> List[Dict[str, Any]]:
        return self._feedback_store.get_ab_experiments(status=status)

    def get_experiment_stats(self, experiment_id: str) -> Dict[str, Any]:
        experiment = self._get_experiment_by_id(experiment_id)
        if not experiment:
            raise ValueError(f"Experiment not found")
        
        return self._calculate_experiment_metrics(experiment_id)

    def _get_experiment_by_id(self, experiment_id: str) -> Optional[Dict[str, Any]]:
        experiments = self._feedback_store.get_ab_experiments()
        for exp in experiments:
            if exp["id"] == experiment_id:
                return exp
        return None

    def get_user_variant(self, user_id: str, experiment: Optional[Dict[str, Any]] = None) -> Optional[Dict[str, Any]]:
        if experiment is None:
            experiment = self._feedback_store.get_running_experiment()
        
        if not experiment or experiment["status"] != "running":
            return None
        
        variants = experiment["variants"]
        
        hash_val = hashlib.md5(user_id.encode()).hexdigest()
        user_hash = int(hash_val, 16) % 100
        
        cumulative = 0
        for variant in variants:
            cumulative += variant.get("traffic_percentage", 0)
            if user_hash < cumulative:
                return variant
        
        return variants[-1] if variants else None

    def get_inference_service(self, model_version: str) -> LoRAInferenceService:
        if model_version not in self._inference_services:
            service = LoRAInferenceService()
            
            if model_version != "base":
                versions = self._feedback_store.get_model_versions()
                for v in versions:
                    if v["version"] == model_version and v.get("adapter_path"):
                        service.load_adapter(v["adapter_path"])
                        break
            
            self._inference_services[model_version] = service
        
        return self._inference_services[model_version]

    def record_exposure(self, experiment_id: str, variant_name: str, user_id: str) -> None:
        pass

    def _calculate_experiment_metrics(self, experiment: Dict[str, Any]) -> Dict[str, Any]:
        variants = experiment["variants"]
        metrics = {}
        
        for variant in variants:
            variant_name = variant["name"]
            metrics[variant_name] = {
                "exposures": 0,
                "likes": 0,
                "dislikes": 0,
                "click_through_rate": 0.0
            }
        
        return metrics

    def get_winning_variant(self, experiment_id: str) -> Optional[Dict[str, Any]]:
        experiment = self._get_experiment_by_id(experiment_id)
        if not experiment:
            return None
        
        metrics = self._calculate_experiment_metrics(experiment)
        
        best_variant = None
        best_score = -1
        
        for variant in experiment["variants"]:
            variant_name = variant["name"]
            variant_metrics = metrics.get(variant_name, {})
            score = variant_metrics.get(experiment.get("primary_metric"), 0)
            if score > best_score:
                best_score = score
                best_variant = variant
        
        return best_variant

    def deploy_winner(self, experiment_id: str) -> Optional[str]:
        winner = self.get_winning_variant(experiment_id)
        if not winner:
            return None
        
        model_version = winner.get("model_version")
        
        deployed = self._feedback_store.get_deployed_version()
        if deployed:
            self._feedback_store.update_model_version_status(
                deployed["version"],
                "archived"
            )
        
        self._feedback_store.update_model_version_status(
            model_version,
            "deployed",
            deployed_at=datetime.now().isoformat()
        )
        
        self.end_experiment(experiment_id)
        
        return model_version


class ModelVersionManager:
    _instance = None
    _feedback_store = None

    def __new__(cls):
        if cls._instance is None:
            cls._instance = super().__new__(cls)
            cls._feedback_store = FeedbackStore()
        return cls._instance

    def create_version(
        self,
        base_model: str,
        adapter_path: Optional[str] = None,
        training_samples: int = 0,
        metrics: Optional[Dict[str, float]] = None,
        description: Optional[str] = None
    ) -> str:
        version = f"v{datetime.now().strftime('%Y%m%d_%H%M%S')}"
        
        self._feedback_store.save_model_version(
            version=version,
            base_model=base_model,
            status="training",
            adapter_path=adapter_path,
            training_samples=training_samples,
            metrics=metrics,
            description=description
        )
        
        return version

    def update_version(
        self,
        version: str,
        status: Optional[str] = None,
        **kwargs
    ) -> None:
        update_kwargs = {}
        if status:
            update_kwargs["status"] = status
        update_kwargs.update(kwargs)
        self._feedback_store.update_model_version_status(version, **update_kwargs)

    def get_versions(self, status: Optional[str] = None) -> List[Dict[str, Any]]:
        return self._feedback_store.get_model_versions(status=status)

    def get_deployed_version(self) -> Optional[Dict[str, Any]]:
        return self._feedback_store.get_deployed_version()

    def deploy_version(self, version: str) -> None:
        deployed = self.get_deployed_version()
        if deployed:
            self._feedback_store.update_model_version_status(
                deployed["version"],
                "archived"
            )
        
        self._feedback_store.update_model_version_status(
            version,
            "deployed",
            deployed_at=datetime.now().isoformat()
        )

    def rollback(self) -> Optional[str]:
        versions = self.get_versions(status="archived")
        if not versions:
            return None
        
        previous_version = versions[0]
        self.deploy_version(previous_version["version"])
        return previous_version["version"]

    def delete_version(self, version: str) -> None:
        deployed = self.get_deployed_version()
        if deployed and deployed["version"] == version:
            raise ValueError("Cannot delete deployed version")
        
        versions = self.get_versions()
        for v in versions:
            if v["version"] == version:
                adapter_path = v.get("adapter_path")
                if adapter_path and os.path.exists(adapter_path):
                    import shutil
                    shutil.rmtree(adapter_path)
                break
        
        self._feedback_store.update_model_version_status(version, status="archived")


def get_user_id(session_id: str, user_id: Optional[str] = None) -> str:
    if user_id:
        return user_id
    return hashlib.md5(session_id.encode()).hexdigest()[:16]
