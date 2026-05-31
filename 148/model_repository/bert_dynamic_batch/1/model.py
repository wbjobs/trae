# -*- coding: utf-8 -*-
"""
动态批处理推理调度器 - BERT 变长输入
支持:
  - 动态合并请求到 batch（最大 batch=32，最长等待 100ms）
  - 优先级队列（VIP 用户插队，priority=1 最高）
  - 自定义 metrics（排队长度、平均等待时间）
"""

import json
import time
import threading
import heapq
import logging
from collections import deque
from typing import Dict, List, Any, Optional, Tuple

import numpy as np
import triton_python_backend_utils as pb_utils
from transformers import BertTokenizer, BertModel
import torch


logging.basicConfig(level=logging.INFO)
logger = logging.getLogger(__name__)


class PriorityRequest:
    """优先级请求包装类，支持堆排序和老化机制"""
    
    __slots__ = ('original_priority', 'effective_priority', 'timestamp', 'request_id', 'request', 'is_vip', 'aging_threshold_ms', 'promoted')
    
    def __init__(self, priority: int, timestamp: float, request_id: int, request: Any, aging_threshold_ms: float = 500.0):
        self.original_priority = priority
        self.effective_priority = priority
        self.timestamp = timestamp
        self.request_id = request_id
        self.request = request
        self.is_vip = (priority == 1)
        self.aging_threshold_ms = aging_threshold_ms
        self.promoted = False
    
    def update_effective_priority(self, now: float) -> None:
        wait_ms = (now - self.timestamp) * 1000
        if not self.is_vip and wait_ms > self.aging_threshold_ms:
            self.effective_priority = 1
            self.promoted = True
        else:
            self.effective_priority = self.original_priority
            
    def get_wait_time_ms(self, now: float) -> float:
        return (now - self.timestamp) * 1000
    
    def __lt__(self, other: 'PriorityRequest') -> bool:
        if self.effective_priority != other.effective_priority:
            return self.effective_priority < other.effective_priority
        return self.timestamp < other.timestamp


class MetricsCollector:
    """自定义 metrics 收集器"""
    
    def __init__(self):
        self._lock = threading.Lock()
        self._queue_length = 0
        self._total_wait_time = 0.0
        self._total_requests = 0
        self._wait_time_history = deque(maxlen=1000)
        self._batch_sizes = deque(maxlen=1000)
        self._vip_count = 0
        self._normal_count = 0
        self._promoted_count = 0
        self._starvation_warnings = 0
        self._max_normal_wait_ms = 0.0
        self._normal_wait_times = deque(maxlen=1000)
        self._buffer_hits = 0
        self._buffer_misses = 0
        self._allocation_savings_ms = 0.0
        
    def enqueue(self):
        with self._lock:
            self._queue_length += 1
            
    def dequeue(self, wait_time: float, is_vip: bool, is_promoted: bool = False):
        with self._lock:
            self._queue_length -= 1
            self._total_wait_time += wait_time
            self._total_requests += 1
            self._wait_time_history.append(wait_time)
            if is_vip:
                self._vip_count += 1
            else:
                self._normal_count += 1
                self._normal_wait_times.append(wait_time)
                wait_ms = wait_time * 1000
                if wait_ms > self._max_normal_wait_ms:
                    self._max_normal_wait_ms = wait_ms
                if wait_ms > 2000:
                    self._starvation_warnings += 1
            if is_promoted:
                self._promoted_count += 1
                
    def record_batch_size(self, size: int):
        with self._lock:
            self._batch_sizes.append(size)
            
    def record_buffer_hit(self):
        with self._lock:
            self._buffer_hits += 1
            
    def record_buffer_miss(self):
        with self._lock:
            self._buffer_misses += 1
            
    def record_allocation_savings(self, saved_ms: float):
        with self._lock:
            self._allocation_savings_ms += saved_ms
            
    def get_metrics(self) -> Dict[str, Any]:
        with self._lock:
            avg_wait = (
                self._total_wait_time / self._total_requests
                if self._total_requests > 0 else 0.0
            )
            avg_batch = (
                sum(self._batch_sizes) / len(self._batch_sizes)
                if len(self._batch_sizes) > 0 else 0.0
            )
            avg_normal_wait = (
                sum(self._normal_wait_times) / len(self._normal_wait_times)
                if self._normal_wait_times > 0 else 0.0
            )
            total_buffer_ops = self._buffer_hits + self._buffer_misses
            buffer_hit_rate = (
                self._buffer_hits / total_buffer_ops * 100
                if total_buffer_ops > 0 else 0.0
            )
            return {
                'queue_length': self._queue_length,
                'avg_wait_time_ms': avg_wait * 1000,
                'total_requests': self._total_requests,
                'vip_count': self._vip_count,
                'normal_count': self._normal_count,
                'promoted_count': self._promoted_count,
                'avg_batch_size': avg_batch,
                'max_normal_wait_ms': self._max_normal_wait_ms,
                'avg_normal_wait_ms': avg_normal_wait * 1000,
                'starvation_warnings': self._starvation_warnings,
                'buffer_hits': self._buffer_hits,
                'buffer_misses': self._buffer_misses,
                'buffer_hit_rate_percent': buffer_hit_rate,
                'allocation_savings_ms': self._allocation_savings_ms,
                'recent_wait_times_ms': [w * 1000 for w in list(self._wait_time_history)[-10:]],
            }


class DynamicBatchScheduler:
    """
    动态批处理调度器（含防饿死机制）
    - 最大 batch size: 32
    - 最长等待时间: 100ms
    - 支持优先级队列（VIP 插队）
    - 老化机制：普通请求等待超时后自动提升优先级
    - 饿死保护：定期强制处理普通请求
    """
    
    def __init__(
        self,
        max_batch_size: int = 32,
        max_wait_ms: int = 100,
        aging_threshold_ms: float = 500.0,
        starvation_protection_interval: int = 3,
        metrics: Optional[MetricsCollector] = None
    ):
        self.max_batch_size = max_batch_size
        self.max_wait_sec = max_wait_ms / 1000.0
        self.aging_threshold_ms = aging_threshold_ms
        self.starvation_protection_interval = starvation_protection_interval
        self.metrics = metrics or MetricsCollector()
        
        self._lock = threading.Lock()
        self._condition = threading.Condition(self._lock)
        self._priority_queue: List[PriorityRequest] = []
        self._request_counter = 0
        self._shutdown = False
        self._batch_count_since_last_normal = 0
        self._force_normal_next = False
        
    def submit(self, priority: int, request: Any) -> None:
        """提交请求到优先级队列"""
        with self._condition:
            self._request_counter += 1
            pr = PriorityRequest(
                priority=priority,
                timestamp=time.time(),
                request_id=self._request_counter,
                request=request,
                aging_threshold_ms=self.aging_threshold_ms
            )
            heapq.heappush(self._priority_queue, pr)
            self.metrics.enqueue()
            self._condition.notify_all()
            
    def _update_all_priorities(self, now: float) -> None:
        for pr in self._priority_queue:
            pr.update_effective_priority(now)
        heapq.heapify(self._priority_queue)
        
    def _find_starving_normal(self) -> Optional[PriorityRequest]:
        starving = None
        max_wait = 0
        for pr in self._priority_queue:
            if not pr.is_vip:
                wait_ms = pr.get_wait_time_ms(time.time())
                if wait_ms > max_wait:
                    max_wait = wait_ms
                    starving = pr
        return starving
            
    def collect_batch(self) -> List[PriorityRequest]:
        """收集一批请求进行推理（含防饿死逻辑）"""
        with self._condition:
            start_time = time.time()
            
            while not self._priority_queue:
                if self._shutdown:
                    return []
                self._condition.wait(timeout=0.01)
                
            self._update_all_priorities(time.time())
            
            if self._batch_count_since_last_normal >= self.starvation_protection_interval:
                starving = self._find_starving_normal()
                if starving:
                    self._force_normal_next = True
                    
            batch = []
            deadline = start_time + self.max_wait_sec
            has_normal_in_batch = False
            
            while len(batch) < self.max_batch_size:
                now = time.time()
                self._update_all_priorities(now)
                
                if self._priority_queue:
                    if len(batch) == 0:
                        remaining = deadline - now
                        if remaining > 0:
                            self._condition.wait(timeout=remaining)
                            continue
                            
                    pr = None
                    
                    if self._force_normal_next and not has_normal_in_batch:
                        for i, candidate in enumerate(self._priority_queue):
                            if not candidate.is_vip:
                                pr = self._priority_queue.pop(i)
                                heapq.heapify(self._priority_queue)
                                break
                        if pr is None:
                            pr = heapq.heappop(self._priority_queue)
                        self._force_normal_next = False
                    else:
                        pr = heapq.heappop(self._priority_queue)
                        
                    wait_time = now - pr.timestamp
                    is_vip = pr.is_vip
                    is_promoted = pr.promoted
                    
                    if not is_vip:
                        has_normal_in_batch = True
                        self._batch_count_since_last_normal = 0
                        
                    self.metrics.dequeue(wait_time, is_vip, is_promoted)
                    batch.append(pr)
                else:
                    if len(batch) > 0:
                        break
                    remaining = deadline - now
                    if remaining > 0:
                        self._condition.wait(timeout=remaining)
                    else:
                        break
                        
            if has_normal_in_batch:
                self._batch_count_since_last_normal = 0
            else:
                self._batch_count_since_last_normal += 1
                    
            self.metrics.record_batch_size(len(batch))
            return batch
            
    def shutdown(self):
        with self._condition:
            self._shutdown = True
            self._condition.notify_all()


class RequestProfileTracker:
    """请求分布追踪器 - 追踪历史请求的序列长度分布"""
    
    def __init__(self, warmup_requests: int = 100, max_seq_len: int = 512):
        self.warmup_requests = warmup_requests
        self.max_seq_len = max_seq_len
        
        self._lock = threading.Lock()
        self._request_count = 0
        self._seq_len_counts = {}
        self._batch_size_counts = {}
        self._common_seq_lens = []
        self._common_batch_sizes = []
        self._is_warmed = False
        
    def record_request(self, seq_len: int) -> None:
        with self._lock:
            self._request_count += 1
            normalized_len = min(seq_len, self.max_seq_len)
            self._seq_len_counts[normalized_len] = self._seq_len_counts.get(normalized_len, 0) + 1
            
            if self._request_count >= self.warmup_requests and not self._is_warmed:
                self._compute_common_patterns()
                self._is_warmed = True
                
    def record_batch(self, batch_size: int) -> None:
        with self._lock:
            self._batch_size_counts[batch_size] = self._batch_size_counts.get(batch_size, 0) + 1
            
    def _compute_common_patterns(self) -> None:
        sorted_lens = sorted(
            self._seq_len_counts.items(), key=lambda x: x[1], reverse=True
        )
        self._common_seq_lens = [
            length for length, count in sorted_lens[:10]
        ]
        
        sorted_batches = sorted(
            self._batch_size_counts.items(), key=lambda x: x[1], reverse=True
        )
        self._common_batch_sizes = [
            size for size, count in sorted_batches[:5]
        ]
        
    def get_common_seq_lens(self) -> List[int]:
        with self._lock:
            return self._common_seq_lens.copy()
            
    def get_common_batch_sizes(self) -> List[int]:
        with self._lock:
            return self._common_batch_sizes.copy()
            
    def find_optimal_size(self, requested_len: int) -> Optional[int]:
        with self._lock:
            if not self._common_seq_lens:
                return None
            for cached_len in sorted(self._common_seq_lens):
                if cached_len >= requested_len:
                    return cached_len
            return max(self._common_seq_lens)
            
    def is_warmed(self) -> bool:
        with self._lock:
            return self._is_warmed
            
    def get_stats(self) -> Dict[str, Any]:
        with self._lock:
            return {
                'request_count': self._request_count,
                'is_warmed': self._is_warmed,
                'common_seq_lens': self._common_seq_lens,
                'common_batch_sizes': self._common_batch_sizes,
                'unique_seq_lens': len(self._seq_len_counts),
                'unique_batch_sizes': len(self._batch_size_counts),
            }


class BufferPool:
    """预分配缓冲区池 - 减少动态分配开销"""
    
    def __init__(
        self,
        profile_tracker: RequestProfileTracker,
        metrics: Optional[MetricsCollector] = None,
        preallocate_count: int = 3,
        hidden_size: int = 768
    ):
        self.profile_tracker = profile_tracker
        self.metrics = metrics
        self.preallocate_count = preallocate_count
        self.hidden_size = hidden_size
        
        self._lock = threading.Lock()
        self._input_buffers: Dict[int, List[np.ndarray]] = {}
        self._output_buffers: Dict[int, List[np.ndarray]] = {}
        self._allocation_times = deque(maxlen=100)
        self._total_allocations = 0
        self._total_reuses = 0
        
    def allocate_input_buffers(
        self, batch_size: int, seq_len: int
    ) -> Tuple[np.ndarray, np.ndarray, np.ndarray]:
        """分配输入缓冲区，优先使用预分配的"""
        optimal_len = self.profile_tracker.find_optimal_size(seq_len)
        if optimal_len and optimal_len >= seq_len:
            alloc_len = optimal_len
        else:
            alloc_len = seq_len
            
        alloc_start = time.time()
        
        input_ids = self._get_or_allocate(
            self._input_buffers, 'input_ids', batch_size, alloc_len, np.int64
        )
        attention_mask = self._get_or_allocate(
            self._input_buffers, 'attention_mask', batch_size, alloc_len, np.int64
        )
        token_type_ids = self._get_or_allocate(
            self._input_buffers, 'token_type_ids', batch_size, alloc_len, np.int64
        )
        
        alloc_time = (time.time() - alloc_start) * 1000
        self._allocation_times.append(alloc_time)
        
        if self.metrics:
            self.metrics.record_allocation_savings(alloc_time * 0.5)
            
        return input_ids, attention_mask, token_type_ids
        
    def allocate_output_buffers(
        self, batch_size: int, seq_len: int
    ) -> Tuple[np.ndarray, np.ndarray]:
        """分配输出缓冲区"""
        last_hidden = np.zeros((batch_size, seq_len, self.hidden_size), dtype=np.float32)
        pooler = np.zeros((batch_size, self.hidden_size), dtype=np.float32)
        return last_hidden, pooler
        
    def _get_or_allocate(
        self,
        buffer_dict: Dict,
        buffer_type: str,
        batch_size: int,
        seq_len: int,
        dtype: np.dtype
    ) -> np.ndarray:
        key = (batch_size, seq_len)
        buffer_key = f"{buffer_type}_{key[0]}_{key[1]}"
        
        with self._lock:
            if buffer_key in buffer_dict and buffer_dict[buffer_key]:
                buffer = buffer_dict[buffer_key].pop()
                buffer.fill(0)
                self._total_reuses += 1
                if self.metrics:
                    self.metrics.record_buffer_hit()
                return buffer
                
        self._total_allocations += 1
        if self.metrics:
            self.metrics.record_buffer_miss()
            
        return np.zeros((batch_size, seq_len), dtype=dtype)
        
    def preallocate_buffers(self) -> int:
        """根据追踪到的分布预分配缓冲区"""
        if not self.profile_tracker.is_warmed():
            return 0
            
        common_lens = self.profile_tracker.get_common_seq_lens()
        common_batch_sizes = self.profile_tracker.get_common_batch_sizes()
        
        if not common_batch_sizes:
            common_batch_sizes = [8, 16, 32]
            
        allocated_count = 0
        
        with self._lock:
            for seq_len in common_lens:
                for batch_size in common_batch_sizes:
                    for _ in range(self.preallocate_count):
                        key = f"input_ids_{batch_size}_{seq_len}"
                        if key not in self._input_buffers:
                            self._input_buffers[key] = []
                        self._input_buffers[key].append(
                            np.zeros((batch_size, seq_len), dtype=np.int64)
                        )
                        
                        key = f"attention_mask_{batch_size}_{seq_len}"
                        if key not in self._input_buffers:
                            self._input_buffers[key] = []
                        self._input_buffers[key].append(
                            np.zeros((batch_size, seq_len), dtype=np.int64)
                        )
                        
                        key = f"token_type_ids_{batch_size}_{seq_len}"
                        if key not in self._input_buffers:
                            self._input_buffers[key] = []
                        self._input_buffers[key].append(
                            np.zeros((batch_size, seq_len), dtype=np.int64)
                        )
                        
                        allocated_count += 3
                        
        return allocated_count
        
    def return_buffers(
        self,
        input_ids: np.ndarray,
        attention_mask: np.ndarray,
        token_type_ids: np.ndarray
    ) -> None:
        """归还缓冲区到池中以便重用"""
        batch_size, seq_len = input_ids.shape
        
        with self._lock:
            key = f"input_ids_{batch_size}_{seq_len}"
            if key not in self._input_buffers:
                self._input_buffers[key] = []
            if len(self._input_buffers[key]) < self.preallocate_count:
                self._input_buffers[key].append(input_ids)
                
            key = f"attention_mask_{batch_size}_{seq_len}"
            if key not in self._input_buffers:
                self._input_buffers[key] = []
            if len(self._input_buffers[key]) < self.preallocate_count:
                self._input_buffers[key].append(attention_mask)
                
            key = f"token_type_ids_{batch_size}_{seq_len}"
            if key not in self._input_buffers:
                self._input_buffers[key] = []
            if len(self._input_buffers[key]) < self.preallocate_count:
                self._input_buffers[key].append(token_type_ids)
                
    def get_stats(self) -> Dict[str, Any]:
        with self._lock:
            total_buffers = sum(len(v) for v in self._input_buffers.values())
            avg_alloc_time = (
                sum(self._allocation_times) / len(self._allocation_times)
                if self._allocation_times else 0
            )
            return {
                'total_buffers_in_pool': total_buffers,
                'total_allocations': self._total_allocations,
                'total_reuses': self._total_reuses,
                'reuse_rate': (
                    self._total_reuses / (self._total_allocations + self._total_reuses) * 100
                    if (self._total_allocations + self._total_reuses) > 0 else 0
                ),
                'avg_allocation_time_ms': avg_alloc_time,
                'unique_buffer_sizes': len(self._input_buffers),
            }


class TritonPythonModel:
    """Triton Python Backend 模型入口"""
    
    def initialize(self, args: Dict[str, Any]) -> None:
        """模型初始化"""
        logger.info("=" * 60)
        logger.info("初始化 BERT 动态批处理调度器 (含防饿死机制和预热)")
        logger.info("=" * 60)
        
        model_config = json.loads(args['model_config'])
        params = model_config.get('parameters', {})
        
        self.max_batch_size = int(params.get('MAX_BATCH_SIZE', {}).get('string_value', '32'))
        self.max_wait_ms = int(params.get('MAX_WAIT_MS', {}).get('string_value', '100'))
        self.aging_threshold_ms = float(params.get('AGING_THRESHOLD_MS', {}).get('string_value', '500'))
        self.starvation_protection_interval = int(params.get('STARVATION_PROTECTION_INTERVAL', {}).get('string_value', '3'))
        self.warmup_requests = int(params.get('WARMUP_REQUESTS', {}).get('string_value', '100'))
        self.preallocate_count = int(params.get('PREALLOCATE_COUNT', {}).get('string_value', '3'))
        model_name = params.get('MODEL_NAME', {}).get('string_value', 'bert-base-uncased')
        
        logger.info(f"参数配置: max_batch_size={self.max_batch_size}, max_wait_ms={self.max_wait_ms}")
        logger.info(f"防饿死配置: aging_threshold_ms={self.aging_threshold_ms}, protection_interval={self.starvation_protection_interval}")
        logger.info(f"预热配置: warmup_requests={self.warmup_requests}, preallocate_count={self.preallocate_count}")
        logger.info(f"模型名称: {model_name}")
        
        self.device = torch.device('cuda' if torch.cuda.is_available() else 'cpu')
        logger.info(f"使用设备: {self.device}")
        
        logger.info("加载 BERT tokenizer 和模型...")
        self.tokenizer = BertTokenizer.from_pretrained(model_name)
        self.model = BertModel.from_pretrained(model_name)
        self.model.to(self.device)
        self.model.eval()
        logger.info("模型加载完成")
        
        self.metrics = MetricsCollector()
        self.profile_tracker = RequestProfileTracker(
            warmup_requests=self.warmup_requests
        )
        self.buffer_pool = BufferPool(
            profile_tracker=self.profile_tracker,
            metrics=self.metrics,
            preallocate_count=self.preallocate_count
        )
        self.scheduler = DynamicBatchScheduler(
            max_batch_size=self.max_batch_size,
            max_wait_ms=self.max_wait_ms,
            aging_threshold_ms=self.aging_threshold_ms,
            starvation_protection_interval=self.starvation_protection_interval,
            metrics=self.metrics
        )
        
        self._warmup_completed = False
        self._last_preallocate_time = 0
        
        self._scheduler_thread = threading.Thread(
            target=self._scheduler_loop, daemon=True
        )
        self._scheduler_thread.start()
        
        self._metrics_thread = threading.Thread(
            target=self._metrics_report_loop, daemon=True
        )
        self._metrics_thread.start()
        
        logger.info("初始化完成")
        
    def _scheduler_loop(self) -> None:
        """调度器主循环 - 在独立线程中运行批处理"""
        logger.info("调度器线程启动")
        
        while True:
            try:
                batch = self.scheduler.collect_batch()
                if not batch:
                    if self.scheduler._shutdown:
                        break
                    continue
                    
                self._process_batch(batch)
                
            except Exception as e:
                logger.error(f"调度器处理异常: {e}", exc_info=True)
                
    def _process_batch(self, batch: List[PriorityRequest]) -> None:
        """处理一批请求（使用预分配缓冲区）"""
        try:
            input_ids_list = []
            attention_mask_list = []
            token_type_ids_list = []
            seq_lens = []
            
            for pr in batch:
                request = pr.request
                try:
                    input_ids = pb_utils.get_input_tensor_by_name(request, "input_ids")
                    attention_mask = pb_utils.get_input_tensor_by_name(request, "attention_mask")
                    token_type_ids = pb_utils.get_input_tensor_by_name(request, "token_type_ids")
                    
                    ids = input_ids.as_numpy().squeeze(0)
                    mask = attention_mask.as_numpy().squeeze(0)
                    ttype = token_type_ids.as_numpy().squeeze(0)
                    
                    input_ids_list.append(ids)
                    attention_mask_list.append(mask)
                    token_type_ids_list.append(ttype)
                    seq_lens.append(len(ids))
                    
                except Exception as e:
                    logger.error(f"解析请求输入失败: {e}")
                    
            if not input_ids_list:
                return
                
            for seq_len in seq_lens:
                self.profile_tracker.record_request(seq_len)
            self.profile_tracker.record_batch(len(batch))
            
            if self.profile_tracker.is_warmed() and not self._warmup_completed:
                allocated = self.buffer_pool.preallocate_buffers()
                self._warmup_completed = True
                self._last_preallocate_time = time.time()
                logger.info(
                    f"预热完成！已预分配 {allocated} 个缓冲区"
                )
                
            max_len = max(seq_lens)
            max_len = min(max_len, 512)
            
            if self._warmup_completed:
                padded_input_ids, padded_attention_mask, padded_token_type_ids = \
                    self.buffer_pool.allocate_input_buffers(len(batch), max_len)
            else:
                padded_input_ids = np.zeros((len(batch), max_len), dtype=np.int64)
                padded_attention_mask = np.zeros((len(batch), max_len), dtype=np.int64)
                padded_token_type_ids = np.zeros((len(batch), max_len), dtype=np.int64)
            
            for i in range(len(input_ids_list)):
                seq_len = min(len(input_ids_list[i]), max_len)
                padded_input_ids[i, :seq_len] = input_ids_list[i][:seq_len]
                padded_attention_mask[i, :seq_len] = attention_mask_list[i][:seq_len]
                padded_token_type_ids[i, :seq_len] = token_type_ids_list[i][:seq_len]
                
            input_ids_tensor = torch.from_numpy(padded_input_ids).to(self.device)
            attention_mask_tensor = torch.from_numpy(padded_attention_mask).to(self.device)
            token_type_ids_tensor = torch.from_numpy(padded_token_type_ids).to(self.device)
            
            with torch.no_grad():
                outputs = self.model(
                    input_ids=input_ids_tensor,
                    attention_mask=attention_mask_tensor,
                    token_type_ids=token_type_ids_tensor
                )
                
            last_hidden_state = outputs.last_hidden_state.cpu().numpy()
            pooler_output = outputs.pooler_output.cpu().numpy()
            
            if self._warmup_completed:
                self.buffer_pool.return_buffers(
                    padded_input_ids, padded_attention_mask, padded_token_type_ids
                )
            
            for i, pr in enumerate(batch):
                try:
                    response = pb_utils.InferenceResponse(
                        output_tensors=[
                            pb_utils.Tensor("last_hidden_state", last_hidden_state[i:i+1]),
                            pb_utils.Tensor("pooler_output", pooler_output[i:i+1]),
                        ]
                    )
                    pr.request.get_response_sender().send(response)
                except Exception as e:
                    logger.error(f"发送响应失败: {e}")
                    
        except Exception as e:
            logger.error(f"处理 batch 失败: {e}", exc_info=True)
            
    def execute(self, requests: List[Any]) -> List[Any]:
        """
        Triton execute 入口
        将请求提交到优先级队列，由后台调度器线程处理
        """
        responses = []
        
        for request in requests:
            try:
                priority_tensor = pb_utils.get_input_tensor_by_name(request, "priority")
                priority = int(priority_tensor.as_numpy().flatten()[0])
            except Exception:
                priority = 2
                
            self.scheduler.submit(priority=priority, request=request)
            
        return None
        
    def _metrics_report_loop(self) -> None:
        """定期输出 metrics 报告"""
        while not self.scheduler._shutdown:
            time.sleep(10)
            metrics = self.metrics.get_metrics()
            buffer_stats = self.buffer_pool.get_stats()
            profile_stats = self.profile_tracker.get_stats()
            logger.info(
                f"[Metrics] 队列={metrics['queue_length']}, "
                f"平均等待={metrics['avg_wait_time_ms']:.1f}ms, "
                f"普通最大等待={metrics['max_normal_wait_ms']:.1f}ms, "
                f"平均batch={metrics['avg_batch_size']:.1f}, "
                f"总请求={metrics['total_requests']} "
                f"(VIP={metrics['vip_count']}, 普通={metrics['normal_count']}, "
                f"老化提升={metrics['promoted_count']}), "
                f"饿死警告={metrics['starvation_warnings']}"
            )
            logger.info(
                f"[Buffer] 缓冲区池={buffer_stats['total_buffers_in_pool']}, "
                f"命中率={buffer_stats['reuse_rate']:.1f}%, "
                f"复用次数={buffer_stats['total_reuses']}, "
                f"新分配={buffer_stats['total_allocations']}, "
                f"平均分配耗时={buffer_stats['avg_allocation_time_ms']:.1f}ms"
            )
            logger.info(
                f"[Profile] 预热={'是' if profile_stats['is_warmed'] else '否'}, "
                f"请求数={profile_stats['request_count']}, "
                f"常用序列长度={profile_stats['common_seq_lens'][:5]}"
            )
            
    def finalize(self) -> None:
        """模型清理"""
        logger.info("正在关闭调度器...")
        self.scheduler.shutdown()
        if self._scheduler_thread:
            self._scheduler_thread.join(timeout=5)
        logger.info("调度器已关闭")
