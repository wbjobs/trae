"""
配置文件 - Configuration
全局配置和参数设置
"""

import os
from typing import Dict, Any


class Config:
    """全局配置类"""

    BASE_DIR = os.path.dirname(os.path.abspath(__file__))

    DICTIONARY_DIR = os.path.join(BASE_DIR, "character_matching", "dictionary")

    INPUT_DIR = os.path.join(BASE_DIR, "input_samples")

    OUTPUT_DIR = os.path.join(BASE_DIR, "output_results")

    AI_CONFIG: Dict[str, Any] = {
        "api_endpoint": "http://localhost:8080/v1/chat/completions",
        "api_key": "",
        "model_name": "ancient-text-lite-v1",
        "max_tokens": 4096,
        "temperature": 0.3,
        "top_p": 0.9,
        "timeout": 60,
        "use_local_fallback": True,
        "use_ai": True,
    }

    TEXT_PROCESSING: Dict[str, Any] = {
        "default_encoding": "utf-8",
        "supported_formats": [".txt", ".md", ".csv", ".json", ".xml", ".html", ".pdf", ".doc", ".docx"],
        "max_file_size": 10 * 1024 * 1024,
        "chunk_size": 1000,
    }

    PUNCTUATION: Dict[str, Any] = {
        "page_width": 20,
        "indent_size": 2,
        "use_vertical": False,
        "add_page_numbers": True,
    }

    EXPORT_CONFIG: Dict[str, Any] = {
        "export_format": "txt",
        "export_raw": True,
        "export_formatted": True,
        "export_annotations": True,
        "export_statistics": True,
        "export_variants": True,
        "include_metadata": True,
        "separate_files": True,
        "file_prefix": "ancient_text_",
    }

    LOGGING: Dict[str, Any] = {
        "enabled": True,
        "level": "INFO",
        "log_file": os.path.join(BASE_DIR, "processing.log"),
    }

    @classmethod
    def get_dictionary_dir(cls) -> str:
        """获取字库目录"""
        return cls.DICTIONARY_DIR

    @classmethod
    def get_input_dir(cls) -> str:
        """获取输入目录"""
        return cls.INPUT_DIR

    @classmethod
    def get_output_dir(cls) -> str:
        """获取输出目录"""
        return cls.OUTPUT_DIR

    @classmethod
    def update_ai_config(cls, **kwargs) -> None:
        """更新AI配置"""
        cls.AI_CONFIG.update(kwargs)

    @classmethod
    def update_export_config(cls, **kwargs) -> None:
        """更新导出配置"""
        cls.EXPORT_CONFIG.update(kwargs)


config = Config()
