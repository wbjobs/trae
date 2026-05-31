from pydantic_settings import BaseSettings
from pydantic import Field


class Settings(BaseSettings):
    APP_NAME: str = "Log Pattern Evolution Analyzer"
    APP_VERSION: str = "1.0.0"
    DEBUG: bool = Field(default=False, alias="DEBUG")

    CLICKHOUSE_HOST: str = "localhost"
    CLICKHOUSE_PORT: int = 9000
    CLICKHOUSE_USER: str = "default"
    CLICKHOUSE_PASSWORD: str = ""
    CLICKHOUSE_DATABASE: str = "log_evolution"
    CLICKHOUSE_HTTP_PORT: int = 8123

    BATCH_SIZE: int = 10000
    DETECTION_INTERVAL_HOURS: int = 1
    RETENTION_DAYS: int = 90

    class Config:
        env_prefix = "LOG_EV_"
        populate_by_name = True


settings = Settings()
