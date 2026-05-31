from typing import Optional, List, Dict, Any
from pydantic import BaseModel, Field
from datetime import datetime
from enum import Enum


class FeedbackType(str, Enum):
    LIKE = "like"
    DISLIKE = "dislike"
    NEUTRAL = "neutral"


class ModelStatus(str, Enum):
    TRAINING = "training"
    DEPLOYED = "deployed"
    ARCHIVED = "archived"
    FAILED = "failed"


class ExperimentStatus(str, Enum):
    DRAFT = "draft"
    RUNNING = "running"
    PAUSED = "paused"
    COMPLETED = "completed"
    ARCHIVED = "archived"


class FeedbackRequest(BaseModel):
    query_id: str = Field(..., description="查询ID")
    result_id: str = Field(..., description="结果项ID")
    feedback_type: FeedbackType = Field(..., description="反馈类型")
    query_text: Optional[str] = Field(None, description="查询文本")
    session_id: Optional[str] = Field(None, description="会话ID")
    user_id: Optional[str] = Field(None, description="用户ID")
    additional_data: Optional[Dict[str, Any]] = Field(None, description="附加数据")


class FeedbackRecord(BaseModel):
    id: str
    query_id: str
    result_id: str
    feedback_type: FeedbackType
    query_text: Optional[str] = None
    session_id: Optional[str] = None
    user_id: Optional[str] = None
    created_at: datetime
    additional_data: Optional[Dict[str, Any]] = None


class ModelVersion(BaseModel):
    version: str
    base_model: str
    adapter_path: Optional[str] = None
    status: ModelStatus
    created_at: datetime
    trained_at: Optional[datetime] = None
    deployed_at: Optional[datetime] = None
    training_samples: int = 0
    metrics: Dict[str, float] = Field(default_factory=dict)
    description: Optional[str] = None


class ABTestVariant(BaseModel):
    name: str
    description: Optional[str] = None
    model_version: str
    traffic_percentage: float = Field(..., ge=0, le=100)
    config: Dict[str, Any] = Field(default_factory=dict)


class ABTestExperiment(BaseModel):
    id: str
    name: str
    description: Optional[str] = None
    status: ExperimentStatus
    variants: List[ABTestVariant]
    created_at: datetime
    started_at: Optional[datetime] = None
    ended_at: Optional[datetime] = None
    primary_metric: str = "click_through_rate"
    metrics: Dict[str, Dict[str, Any]] = Field(default_factory=dict)


class TrainingConfig(BaseModel):
    base_model: str = "openai/clip-vit-base-patch32"
    lora_rank: int = 8
    lora_alpha: int = 16
    lora_dropout: float = 0.05
    batch_size: int = 8
    learning_rate: float = 1e-4
    num_epochs: int = 3
    target_modules: List[str] = Field(default_factory=lambda: ["q_proj", "v_proj"])
    output_dir: str = "./models"
    test_size: float = 0.2
    random_seed: int = 42


class TrainingResult(BaseModel):
    success: bool
    model_version: Optional[str] = None
    adapter_path: Optional[str] = None
    metrics: Dict[str, float] = Field(default_factory=dict)
    error_message: Optional[str] = None


class FeedbackStatsResponse(BaseModel):
    total_feedbacks: int
    likes: int
    dislikes: int
    neutrals: int
    last_7_days: int
    unique_queries: int
    pending_training_samples: int


class ScheduledTrainingInfo(BaseModel):
    next_run_time: datetime
    last_run_time: Optional[datetime] = None
    last_run_result: Optional[str] = None
    auto_training_enabled: bool
    training_interval_days: int
