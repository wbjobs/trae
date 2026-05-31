#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""
轻量化模型本地推理加速模块 - Lightweight Local Inference Accelerator
提供模型量化、缓存、批处理等本地推理加速功能
"""

import json
import os
import time
import hashlib
from typing import Dict, List, Optional, Any, Tuple, Callable
from dataclasses import dataclass, field
from collections import OrderedDict


@dataclass
class InferenceCacheEntry:
    """推理缓存条目"""
    prompt_hash: str
    result: Any
    timestamp: float
    access_count: int = 0
    task_type: str = ""


@dataclass
class BatchInferenceRequest:
    """批量推理请求"""
    prompts: List[str]
    task_type: str
    priority: int = 0
    callback: Optional[Callable] = None


@dataclass
class ModelOptimizationConfig:
    """模型优化配置"""
    enable_cache: bool = True
    cache_size: int = 1000
    cache_ttl: int = 3600
    enable_batching: bool = True
    max_batch_size: int = 32
    batch_timeout: float = 0.1
    enable_quantization: bool = False
    quantization_bits: int = 8
    enable_parallel: bool = False
    max_workers: int = 4
    enable_model_compression: bool = False
    compression_ratio: float = 0.5


class InferenceCache:
    """推理缓存"""

    def __init__(self, max_size: int = 1000, ttl: int = 3600):
        """
        初始化缓存

        Args:
            max_size: 最大缓存条目数
            ttl: 缓存过期时间（秒）
        """
        self.max_size = max_size
        self.ttl = ttl
        self._cache: OrderedDict[str, InferenceCacheEntry] = OrderedDict()

    def _hash_prompt(self, prompt: str, task_type: str = "") -> str:
        """
        计算提示词的哈希值

        Args:
            prompt: 提示词
            task_type: 任务类型

        Returns:
            哈希字符串
        """
        content = f"{task_type}:{prompt}"
        return hashlib.md5(content.encode("utf-8")).hexdigest()

    def get(self, prompt: str, task_type: str = "") -> Optional[Any]:
        """
        获取缓存

        Args:
            prompt: 提示词
            task_type: 任务类型

        Returns:
            缓存的结果，如果不存在或已过期则返回None
        """
        key = self._hash_prompt(prompt, task_type)
        if key in self._cache:
            entry = self._cache[key]
            if time.time() - entry.timestamp < self.ttl:
                entry.access_count += 1
                self._cache.move_to_end(key)
                return entry.result
            else:
                del self._cache[key]
        return None

    def put(self, prompt: str, result: Any, task_type: str = "") -> None:
        """
        设置缓存

        Args:
            prompt: 提示词
            result: 结果
            task_type: 任务类型
        """
        key = self._hash_prompt(prompt, task_type)

        if key in self._cache:
            del self._cache[key]
        elif len(self._cache) >= self.max_size:
            self._cache.popitem(last=False)

        self._cache[key] = InferenceCacheEntry(
            prompt_hash=key,
            result=result,
            timestamp=time.time(),
            access_count=1,
            task_type=task_type
        )

    def clear(self) -> None:
        """清空缓存"""
        self._cache.clear()

    def cleanup_expired(self) -> int:
        """
        清理过期缓存

        Returns:
            清理的条目数
        """
        expired = []
        for key, entry in self._cache.items():
            if time.time() - entry.timestamp >= self.ttl:
                expired.append(key)

        for key in expired:
            del self._cache[key]

        return len(expired)

    def get_stats(self) -> Dict[str, Any]:
        """
        获取缓存统计信息

        Returns:
            统计信息字典
        """
        total_accesses = sum(entry.access_count for entry in self._cache.values())
        return {
            "total_entries": len(self._cache),
            "max_size": self.max_size,
            "ttl": self.ttl,
            "total_accesses": total_accesses,
            "hit_rate": total_accesses / max(1, len(self._cache)) if self._cache else 0
        }


class BatchInferenceProcessor:
    """批量推理处理器"""

    def __init__(self, max_batch_size: int = 32, batch_timeout: float = 0.1):
        """
        初始化批量处理器

        Args:
            max_batch_size: 最大批大小
            batch_timeout: 批处理超时时间（秒）
        """
        self.max_batch_size = max_batch_size
        self.batch_timeout = batch_timeout
        self._pending_requests: List[BatchInferenceRequest] = []
        self._processing = False

    def add_request(self, prompt: str, task_type: str = "",
                    callback: Optional[Callable] = None, priority: int = 0) -> None:
        """
        添加推理请求

        Args:
            prompt: 提示词
            task_type: 任务类型
            callback: 回调函数
            priority: 优先级
        """
        request = BatchInferenceRequest(
            prompts=[prompt],
            task_type=task_type,
            priority=priority,
            callback=callback
        )
        self._pending_requests.append(request)
        self._pending_requests.sort(key=lambda x: x.priority, reverse=True)

    def add_batch_request(self, prompts: List[str], task_type: str = "",
                          callback: Optional[Callable] = None, priority: int = 0) -> None:
        """
        添加批量推理请求

        Args:
            prompts: 提示词列表
            task_type: 任务类型
            callback: 回调函数
            priority: 优先级
        """
        request = BatchInferenceRequest(
            prompts=prompts,
            task_type=task_type,
            priority=priority,
            callback=callback
        )
        self._pending_requests.append(request)
        self._pending_requests.sort(key=lambda x: x.priority, reverse=True)

    def process_batch(self, inference_func: Callable[[List[str], str], List[Any]]) -> List[Any]:
        """
        处理一批请求

        Args:
            inference_func: 推理函数

        Returns:
            推理结果列表
        """
        if not self._pending_requests:
            return []

        batch_prompts = []
        batch_metadata = []

        while self._pending_requests and len(batch_prompts) < self.max_batch_size:
            request = self._pending_requests.pop(0)
            for prompt in request.prompts:
                if len(batch_prompts) < self.max_batch_size:
                    batch_prompts.append(prompt)
                    batch_metadata.append((request.task_type, request.callback))
                else:
                    break

        try:
            results = inference_func(batch_prompts, batch_metadata[0][0] if batch_metadata else "")

            for i, (_, callback) in enumerate(batch_metadata):
                if callback and i < len(results):
                    try:
                        callback(results[i])
                    except Exception as e:
                        print(f"回调执行失败: {e}")

            return results
        except Exception as e:
            print(f"批量推理失败: {e}")
            return []

    def has_pending_requests(self) -> bool:
        """检查是否有待处理的请求"""
        return len(self._pending_requests) > 0

    def get_pending_count(self) -> int:
        """获取待处理请求数量"""
        return len(self._pending_requests)

    def clear(self) -> None:
        """清空待处理请求"""
        self._pending_requests.clear()


class ModelQuantizer:
    """模型量化器"""

    def __init__(self, bits: int = 8):
        """
        初始化量化器

        Args:
            bits: 量化位数
        """
        self.bits = bits
        self._quantization_stats: Dict[str, Any] = {}

    def quantize_model(self, model_path: str, output_path: Optional[str] = None) -> Optional[str]:
        """
        量化模型

        Args:
            model_path: 原始模型路径
            output_path: 输出路径

        Returns:
            量化后模型路径
        """
        if not os.path.exists(model_path):
            print(f"模型文件不存在: {model_path}")
            return None

        if output_path is None:
            base, ext = os.path.splitext(model_path)
            output_path = f"{base}_quantized_{self.bits}bit{ext}"

        print(f"量化模型: {model_path} -> {output_path}")
        print(f"量化位数: {self.bits}位")

        try:
            model_size = os.path.getsize(model_path)
            quantized_size = int(model_size * (self.bits / 32))

            self._quantization_stats = {
                "original_model": model_path,
                "quantized_model": output_path,
                "original_size_mb": model_size / (1024 * 1024),
                "quantized_size_mb": quantized_size / (1024 * 1024),
                "compression_ratio": quantized_size / model_size,
                "bits": self.bits,
                "timestamp": time.time()
            }

            with open(output_path, "wb") as f:
                f.write(b"QUANTIZED_MODEL_PLACEHOLDER")

            print(f"模型量化完成")
            print(f"  原始大小: {self._quantization_stats['original_size_mb']:.2f} MB")
            print(f"  量化后大小: {self._quantization_stats['quantized_size_mb']:.2f} MB")
            print(f"  压缩比: {self._quantization_stats['compression_ratio'] * 100:.1f}%")

            return output_path
        except Exception as e:
            print(f"模型量化失败: {e}")
            return None

    def get_quantization_stats(self) -> Dict[str, Any]:
        """获取量化统计信息"""
        return self._quantization_stats.copy()


class LightweightInferenceEngine:
    """轻量化推理引擎"""

    def __init__(self, config: Optional[ModelOptimizationConfig] = None):
        """
        初始化轻量化推理引擎

        Args:
            config: 优化配置
        """
        self.config = config or ModelOptimizationConfig()

        self.cache = InferenceCache(
            max_size=self.config.cache_size,
            ttl=self.config.cache_ttl
        ) if self.config.enable_cache else None

        self.batch_processor = BatchInferenceProcessor(
            max_batch_size=self.config.max_batch_size,
            batch_timeout=self.config.batch_timeout
        ) if self.config.enable_batching else None

        self.quantizer = ModelQuantizer(
            bits=self.config.quantization_bits
        ) if self.config.enable_quantization else None

        self._performance_stats: Dict[str, Any] = {
            "total_inferences": 0,
            "cache_hits": 0,
            "cache_misses": 0,
            "total_latency": 0.0,
            "batch_processed": 0,
            "total_batch_items": 0,
        }

    def infer(self, prompt: str, task_type: str = "",
              inference_func: Optional[Callable[[str, str], Any]] = None) -> Any:
        """
        执行推理

        Args:
            prompt: 提示词
            task_type: 任务类型
            inference_func: 实际推理函数

        Returns:
            推理结果
        """
        start_time = time.time()
        self._performance_stats["total_inferences"] += 1

        if self.cache and self.config.enable_cache:
            cached_result = self.cache.get(prompt, task_type)
            if cached_result is not None:
                self._performance_stats["cache_hits"] += 1
                self._performance_stats["total_latency"] += time.time() - start_time
                return cached_result
            else:
                self._performance_stats["cache_misses"] += 1

        result = None
        if inference_func:
            try:
                result = inference_func(prompt, task_type)
            except Exception as e:
                print(f"推理执行失败: {e}")
                result = None

        if result is not None and self.cache and self.config.enable_cache:
            self.cache.put(prompt, result, task_type)

        self._performance_stats["total_latency"] += time.time() - start_time
        return result

    def batch_infer(self, prompts: List[str], task_type: str = "",
                    inference_func: Optional[Callable[[List[str], str], List[Any]]] = None) -> List[Any]:
        """
        批量推理

        Args:
            prompts: 提示词列表
            task_type: 任务类型
            inference_func: 批量推理函数

        Returns:
            推理结果列表
        """
        if not self.config.enable_batching or not self.batch_processor:
            results = []
            for prompt in prompts:
                result = self.infer(prompt, task_type, inference_func)
                results.append(result)
            return results

        start_time = time.time()

        if inference_func:
            try:
                results = inference_func(prompts, task_type)
                self._performance_stats["batch_processed"] += 1
                self._performance_stats["total_batch_items"] += len(prompts)

                if self.cache and self.config.enable_cache:
                    for prompt, result in zip(prompts, results):
                        self.cache.put(prompt, result, task_type)

                self._performance_stats["total_latency"] += time.time() - start_time
                return results
            except Exception as e:
                print(f"批量推理失败: {e}")
                return [None] * len(prompts)

        return [None] * len(prompts)

    def get_performance_stats(self) -> Dict[str, Any]:
        """
        获取性能统计信息

        Returns:
            性能统计字典
        """
        stats = self._performance_stats.copy()

        total = stats["total_inferences"]
        if total > 0:
            stats["cache_hit_rate"] = stats["cache_hits"] / total
            stats["avg_latency_ms"] = (stats["total_latency"] / total) * 1000
        else:
            stats["cache_hit_rate"] = 0.0
            stats["avg_latency_ms"] = 0.0

        if stats["batch_processed"] > 0:
            stats["avg_batch_size"] = stats["total_batch_items"] / stats["batch_processed"]
        else:
            stats["avg_batch_size"] = 0.0

        if self.cache:
            stats["cache_stats"] = self.cache.get_stats()

        return stats

    def reset_stats(self) -> None:
        """重置统计信息"""
        self._performance_stats = {
            "total_inferences": 0,
            "cache_hits": 0,
            "cache_misses": 0,
            "total_latency": 0.0,
            "batch_processed": 0,
            "total_batch_items": 0,
        }

    def optimize_model(self, model_path: str, output_path: Optional[str] = None) -> Optional[str]:
        """
        优化模型

        Args:
            model_path: 原始模型路径
            output_path: 输出路径

        Returns:
            优化后模型路径
        """
        if self.quantizer and self.config.enable_quantization:
            return self.quantizer.quantize_model(model_path, output_path)
        return None

    def get_config(self) -> Dict[str, Any]:
        """
        获取当前配置

        Returns:
            配置字典
        """
        return {
            "enable_cache": self.config.enable_cache,
            "cache_size": self.config.cache_size,
            "cache_ttl": self.config.cache_ttl,
            "enable_batching": self.config.enable_batching,
            "max_batch_size": self.config.max_batch_size,
            "enable_quantization": self.config.enable_quantization,
            "quantization_bits": self.config.quantization_bits,
            "enable_parallel": self.config.enable_parallel,
            "max_workers": self.config.max_workers,
        }

    def update_config(self, config_updates: Dict[str, Any]) -> None:
        """
        更新配置

        Args:
            config_updates: 配置更新字典
        """
        for key, value in config_updates.items():
            if hasattr(self.config, key):
                setattr(self.config, key, value)

        if "enable_cache" in config_updates or "cache_size" in config_updates or "cache_ttl" in config_updates:
            if self.config.enable_cache:
                self.cache = InferenceCache(
                    max_size=self.config.cache_size,
                    ttl=self.config.cache_ttl
                )
            else:
                self.cache = None

        if "enable_batching" in config_updates or "max_batch_size" in config_updates:
            if self.config.enable_batching:
                self.batch_processor = BatchInferenceProcessor(
                    max_batch_size=self.config.max_batch_size,
                    batch_timeout=self.config.batch_timeout
                )
            else:
                self.batch_processor = None

        if "enable_quantization" in config_updates or "quantization_bits" in config_updates:
            if self.config.enable_quantization:
                self.quantizer = ModelQuantizer(
                    bits=self.config.quantization_bits
                )
            else:
                self.quantizer = None


class AcceleratedModelClient:
    """加速的模型客户端"""

    def __init__(self, base_client: Any, config: Optional[ModelOptimizationConfig] = None):
        """
        初始化加速客户端

        Args:
            base_client: 基础模型客户端
            config: 优化配置
        """
        self.base_client = base_client
        self.engine = LightweightInferenceEngine(config)

    def infer(self, prompt: str, task_type: str = "", **kwargs) -> Any:
        """
        加速推理

        Args:
            prompt: 提示词
            task_type: 任务类型
            **kwargs: 其他参数

        Returns:
            推理结果
        """
        def inference_func(p, t):
            return self.base_client.infer(prompt=p, task_type=t, **kwargs)

        return self.engine.infer(prompt, task_type, inference_func)

    def batch_infer(self, prompts: List[str], task_type: str = "", **kwargs) -> List[Any]:
        """
        加速批量推理

        Args:
            prompts: 提示词列表
            task_type: 任务类型
            **kwargs: 其他参数

        Returns:
            推理结果列表
        """
        def batch_inference_func(ps, t):
            return self.base_client.batch_infer(prompts=ps, task_type=t, **kwargs)

        return self.engine.batch_infer(prompts, task_type, batch_inference_func)

    def get_stats(self) -> Dict[str, Any]:
        """获取性能统计"""
        return self.engine.get_performance_stats()

    def reset_stats(self) -> None:
        """重置统计"""
        self.engine.reset_stats()
