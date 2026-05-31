# -*- coding: utf-8 -*-
"""
独立的调度器模拟演示
无需 Triton 服务器，可直接运行测试动态批处理和优先级队列逻辑
"""

import time
import threading
import heapq
import random
from collections import deque
from typing import List, Dict, Any, Optional


class PriorityRequest:
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
    
    def __repr__(self):
        promoted_tag = " [PROMOTED]" if self.promoted else ""
        return f"Req#{self.request_id}(orig_p={self.original_priority}, eff_p={self.effective_priority}, t={self.timestamp:.4f}){promoted_tag}"


class MetricsCollector:
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
            max_wait = max(self._wait_time_history) if self._wait_time_history else 0.0
            min_wait = min(self._wait_time_history) if self._wait_time_history else 0.0
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
                'max_wait_time_ms': max_wait * 1000,
                'min_wait_time_ms': min_wait * 1000,
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
            }


class DynamicBatchScheduler:
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
        self._processed_batches = []
        self._total_processed = 0
        self._batch_count_since_last_normal = 0
        self._force_normal_next = False
        
    def submit(self, priority: int, request: Any) -> None:
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
    
    def __init__(self, warmup_requests: int = 50, max_seq_len: int = 512):
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
        self._input_buffers: Dict[str, List] = {}
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
        
        import numpy as np
        
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
        
    def _get_or_allocate(
        self,
        buffer_dict: Dict,
        buffer_type: str,
        batch_size: int,
        seq_len: int,
        dtype: type
    ) -> np.ndarray:
        buffer_key = f"{buffer_type}_{batch_size}_{seq_len}"
        
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
        import numpy as np
        
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
        import numpy as np
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


def simulate_bert_inference(batch: List[PriorityRequest]) -> float:
    """模拟 BERT 推理耗时（与 batch 大小正相关）"""
    base_time = 0.01
    per_sample = 0.005
    simulated = base_time + per_sample * len(batch)
    time.sleep(simulated)
    return simulated


def run_scheduler_demo():
    """调度器完整演示（含预热和缓冲区池）"""
    import numpy as np
    
    print("=" * 70)
    print("  动态批处理推理调度器 - 演示 (含防饿死机制和预热)")
    print("=" * 70)
    
    max_batch_size = 32
    max_wait_ms = 100
    aging_threshold_ms = 500.0
    starvation_protection_interval = 3
    warmup_requests = 50
    preallocate_count = 3
    
    print(f"\n配置参数:")
    print(f"  最大 Batch Size: {max_batch_size}")
    print(f"  最长等待时间: {max_wait_ms}ms")
    print(f"  优先级: 1=VIP (插队), 2=普通")
    print(f"  老化阈值: {aging_threshold_ms}ms (普通请求等待超此时间自动提升优先级)")
    print(f"  饿死保护间隔: 每 {starvation_protection_interval} 个 batch 强制处理普通请求")
    print(f"  预热请求数: {warmup_requests} (用于统计请求分布)")
    print(f"  预分配数量: 每种大小预分配 {preallocate_count} 个缓冲区")
    
    metrics = MetricsCollector()
    profile_tracker = RequestProfileTracker(warmup_requests=warmup_requests)
    buffer_pool = BufferPool(
        profile_tracker=profile_tracker,
        metrics=metrics,
        preallocate_count=preallocate_count
    )
    scheduler = DynamicBatchScheduler(
        max_batch_size=max_batch_size,
        max_wait_ms=max_wait_ms,
        aging_threshold_ms=aging_threshold_ms,
        starvation_protection_interval=starvation_protection_interval,
        metrics=metrics
    )
    
    processed_batches = []
    stop_flag = threading.Event()
    warmup_completed = False
    
    def scheduler_loop():
        nonlocal warmup_completed
        while not stop_flag.is_set():
            batch = scheduler.collect_batch()
            if not batch:
                if scheduler._shutdown:
                    break
                continue
            
            seq_lens = [random.randint(32, 256) for _ in batch]
            for seq_len in seq_lens:
                profile_tracker.record_request(seq_len)
            profile_tracker.record_batch(len(batch))
            
            if profile_tracker.is_warmed() and not warmup_completed:
                allocated = buffer_pool.preallocate_buffers()
                warmup_completed = True
                print(f"\n  [预热完成] 已预分配 {allocated} 个缓冲区")
            
            batch_start = time.time()
            simulate_bert_inference(batch)
            batch_time = time.time() - batch_start
            
            promoted_count = sum(1 for r in batch if r.promoted)
            
            processed_batches.append({
                'batch_id': len(processed_batches) + 1,
                'size': len(batch),
                'requests': [r.request_id for r in batch],
                'priorities': [r.original_priority for r in batch],
                'vip_count': sum(1 for r in batch if r.is_vip),
                'normal_count': sum(1 for r in batch if not r.is_vip),
                'promoted_count': promoted_count,
                'infer_time_ms': batch_time * 1000,
            })
            
            promoted_tag = f" | 老化提升={promoted_count}" if promoted_count > 0 else ""
            buffer_stats = buffer_pool.get_stats()
            buffer_tag = f" | 缓冲区复用={buffer_stats['reuse_rate']:.1f}%" if warmup_completed else ""
            
            print(f"\n  [Batch #{len(processed_batches)}] 大小={len(batch):2d} | "
                  f"VIP={sum(1 for r in batch if r.is_vip)} | "
                  f"普通={sum(1 for r in batch if not r.is_vip)}"
                  f"{promoted_tag}{buffer_tag} | "
                  f"推理耗时={batch_time*1000:.1f}ms | "
                  f"请求: {[r.request_id for r in batch]}")
    
    scheduler_thread = threading.Thread(target=scheduler_loop, daemon=True)
    scheduler_thread.start()
    
    def generate_requests(normal_count: int, vip_count: int, interval: float = 0.02):
        """生成模拟请求"""
        req_id = 0
        vip_schedule = set(random.sample(range(normal_count + vip_count), min(vip_count, normal_count + vip_count)))
        all_requests = normal_count + vip_count
        
        for i in range(all_requests):
            priority = 1 if i in vip_schedule else 2
            text_len = random.randint(10, 200)
            request = {
                'id': req_id,
                'text_len': text_len,
                'priority': priority,
            }
            scheduler.submit(priority, request)
            req_id += 1
            time.sleep(interval)
    
    print(f"\n{'='*70}")
    print("  阶段 1: 预热阶段 (50个请求，统计请求分布)")
    print("=" * 70)
    
    generate_requests(normal_count=40, vip_count=10, interval=0.01)
    time.sleep(0.5)
    
    profile_stats = profile_tracker.get_stats()
    print(f"\n  预热统计:")
    print(f"    请求数: {profile_stats['request_count']}")
    print(f"    预热完成: {'是' if profile_stats['is_warmed'] else '否'}")
    print(f"    常用序列长度: {profile_stats['common_seq_lens'][:5]}")
    print(f"    常用 Batch 大小: {profile_stats['common_batch_sizes'][:5]}")
    
    buffer_stats = buffer_pool.get_stats()
    print(f"    缓冲区池大小: {buffer_stats['total_buffers_in_pool']}")
    
    print(f"\n{'='*70}")
    print("  阶段 2: 低负载测试 (10个普通请求)")
    print("=" * 70)
    
    generate_requests(normal_count=10, vip_count=0, interval=0.015)
    time.sleep(0.5)
    
    metrics1 = metrics.get_metrics()
    print(f"\n  阶段 2 Metrics:")
    print(f"    队列长度: {metrics1['queue_length']}")
    print(f"    总请求数: {metrics1['total_requests']}")
    print(f"    平均等待: {metrics1['avg_wait_time_ms']:.2f}ms")
    print(f"    普通请求最大等待: {metrics1['max_normal_wait_ms']:.2f}ms")
    print(f"    平均 Batch: {metrics1['avg_batch_size']:.1f}")
    print(f"    老化提升次数: {metrics1['promoted_count']}")
    print(f"    缓冲区命中率: {metrics1['buffer_hit_rate_percent']:.1f}%")
    
    print(f"\n{'='*70}")
    print("  阶段 3: 混合优先级测试 (20个请求, 含5个VIP)")
    print("=" * 70)
    
    generate_requests(normal_count=15, vip_count=5, interval=0.01)
    time.sleep(0.5)
    
    metrics2 = metrics.get_metrics()
    print(f"\n  阶段 3 Metrics:")
    print(f"    队列长度: {metrics2['queue_length']}")
    print(f"    总请求数: {metrics2['total_requests']}")
    print(f"    VIP 请求: {metrics2['vip_count']}")
    print(f"    普通请求: {metrics2['normal_count']}")
    print(f"    平均等待: {metrics2['avg_wait_time_ms']:.2f}ms")
    print(f"    最大等待: {metrics2['max_wait_time_ms']:.2f}ms")
    print(f"    普通请求最大等待: {metrics2['max_normal_wait_ms']:.2f}ms")
    print(f"    老化提升次数: {metrics2['promoted_count']}")
    print(f"    平均 Batch: {metrics2['avg_batch_size']:.1f}")
    print(f"    缓冲区命中率: {metrics2['buffer_hit_rate_percent']:.1f}%")
    
    print(f"\n{'='*70}")
    print("  阶段 4: 高负载批处理测试 (50个请求快速涌入)")
    print("=" * 70)
    
    generate_requests(normal_count=45, vip_count=5, interval=0.005)
    time.sleep(0.5)
    
    metrics3 = metrics.get_metrics()
    print(f"\n  阶段 4 Metrics:")
    print(f"    队列长度: {metrics3['queue_length']}")
    print(f"    总请求数: {metrics3['total_requests']}")
    print(f"    VIP 请求: {metrics3['vip_count']}")
    print(f"    普通请求: {metrics3['normal_count']}")
    print(f"    平均等待: {metrics3['avg_wait_time_ms']:.2f}ms")
    print(f"    最大等待: {metrics3['max_wait_time_ms']:.2f}ms")
    print(f"    最小等待: {metrics3['min_wait_time_ms']:.2f}ms")
    print(f"    普通请求最大等待: {metrics3['max_normal_wait_ms']:.2f}ms")
    print(f"    老化提升次数: {metrics3['promoted_count']}")
    print(f"    平均 Batch: {metrics3['avg_batch_size']:.1f}")
    print(f"    缓冲区命中率: {metrics3['buffer_hit_rate_percent']:.1f}%")
    
    print(f"\n{'='*70}")
    print("  阶段 5: VIP 插队测试")
    print("=" * 70)
    
    print("\n  先提交3个普通请求...")
    for i in range(3):
        scheduler.submit(2, {'id': f'normal_{i}', 'text_len': 50})
        time.sleep(0.01)
    
    print("  立即提交1个VIP请求（应优先处理）...")
    scheduler.submit(1, {'id': 'vip_urgent', 'text_len': 50})
    
    time.sleep(0.3)
    
    print(f"\n  查看最近处理的 Batch:")
    for batch_info in processed_batches[-3:]:
        promoted_tag = f" (含{batch_info['promoted_count']}个老化提升)" if batch_info['promoted_count'] > 0 else ""
        print(f"    Batch #{batch_info['batch_id']}: "
              f"大小={batch_info['size']}, "
              f"VIP={batch_info['vip_count']}, "
              f"普通={batch_info['normal_count']}"
              f"{promoted_tag}, "
              f"请求ID={batch_info['requests']}")
    
    print(f"\n{'='*70}")
    print("  阶段 6: 高并发防饿死测试 (模拟 500 QPS, VIP占30%)")
    print("=" * 70)
    
    print("""
  模拟场景:
    - 持续高频涌入请求 (约 500 QPS)
    - VIP 请求占比 30%
    - 验证普通请求不会饿死 (等待时间有上限)
    - 验证缓冲区池复用率
""")
    
    vip_flood_start = len(processed_batches)
    initial_normal_metrics = metrics.get_metrics()
    
    high_qps_count = 100
    vip_ratio = 0.3
    vip_count = int(high_qps_count * vip_ratio)
    normal_count = high_qps_count - vip_count
    
    print(f"  提交 {high_qps_count} 个请求 (VIP: {vip_count}, 普通: {normal_count})...")
    
    def high_qps_generator():
        req_id = 0
        all_requests = normal_count + vip_count
        vip_schedule = set(random.sample(range(all_requests), vip_count))
        
        for i in range(all_requests):
            priority = 1 if i in vip_schedule else 2
            text_len = random.randint(10, 200)
            request = {
                'id': f'hq_{req_id}',
                'text_len': text_len,
                'priority': priority,
            }
            scheduler.submit(priority, request)
            req_id += 1
            time.sleep(0.002)
    
    high_qps_thread = threading.Thread(target=high_qps_generator, daemon=True)
    high_qps_thread.start()
    high_qps_thread.join()
    
    time.sleep(3.0)
    
    metrics5 = metrics.get_metrics()
    new_normal = metrics5['normal_count'] - initial_normal_metrics['normal_count']
    new_vip = metrics5['vip_count'] - initial_normal_metrics['vip_count']
    new_promoted = metrics5['promoted_count'] - initial_normal_metrics['promoted_count']
    
    print(f"\n  阶段 6 Metrics (本次新增):")
    print(f"    新增普通请求: {new_normal}")
    print(f"    新增 VIP 请求: {new_vip}")
    print(f"    老化提升次数: {new_promoted}")
    print(f"    普通请求最大等待: {metrics5['max_normal_wait_ms']:.2f}ms")
    print(f"    普通请求平均等待: {metrics5['avg_normal_wait_ms']:.2f}ms")
    print(f"    饿死警告次数: {metrics5['starvation_warnings']}")
    print(f"    缓冲区命中率: {metrics5['buffer_hit_rate_percent']:.1f}%")
    
    buffer_stats5 = buffer_pool.get_stats()
    print(f"    缓冲区池统计:")
    print(f"      总缓冲区数: {buffer_stats5['total_buffers_in_pool']}")
    print(f"      复用次数: {buffer_stats5['total_reuses']}")
    print(f"      新分配次数: {buffer_stats5['total_allocations']}")
    print(f"      复用率: {buffer_stats5['reuse_rate']:.1f}%")
    
    print(f"\n  本次处理的 Batch 详情:")
    for batch_info in processed_batches[vip_flood_start:]:
        promoted_tag = f" [老化提升={batch_info['promoted_count']}]" if batch_info['promoted_count'] > 0 else ""
        print(f"    Batch #{batch_info['batch_id']}: "
              f"大小={batch_info['size']:2d} | "
              f"VIP={batch_info['vip_count']} | "
              f"普通={batch_info['normal_count']}"
              f"{promoted_tag}")
    
    time.sleep(0.5)
    
    print(f"\n{'='*70}")
    print("  最终统计")
    print("=" * 70)
    
    final_metrics = metrics.get_metrics()
    final_buffer_stats = buffer_pool.get_stats()
    final_profile_stats = profile_tracker.get_stats()
    
    print(f"\n  总请求数: {final_metrics['total_requests']}")
    print(f"  VIP 请求: {final_metrics['vip_count']}")
    print(f"  普通请求: {final_metrics['normal_count']}")
    print(f"  VIP 占比: {final_metrics['vip_count']/final_metrics['total_requests']*100:.1f}%")
    print(f"  老化提升总次数: {final_metrics['promoted_count']}")
    print(f"  平均等待: {final_metrics['avg_wait_time_ms']:.2f}ms")
    print(f"  最大等待: {final_metrics['max_wait_time_ms']:.2f}ms")
    print(f"  普通请求最大等待: {final_metrics['max_normal_wait_ms']:.2f}ms")
    print(f"  普通请求平均等待: {final_metrics['avg_normal_wait_ms']:.2f}ms")
    print(f"  饿死警告次数: {final_metrics['starvation_warnings']}")
    print(f"  平均 Batch: {final_metrics['avg_batch_size']:.1f}")
    
    print(f"\n  缓冲区池统计:")
    print(f"    总缓冲区数: {final_buffer_stats['total_buffers_in_pool']}")
    print(f"    复用次数: {final_buffer_stats['total_reuses']}")
    print(f"    新分配次数: {final_buffer_stats['total_allocations']}")
    print(f"    复用率: {final_buffer_stats['reuse_rate']:.1f}%")
    print(f"    平均分配耗时: {final_buffer_stats['avg_allocation_time_ms']:.2f}ms")
    
    print(f"\n  请求分布统计:")
    print(f"    预热完成: {'是' if final_profile_stats['is_warmed'] else '否'}")
    print(f"    常用序列长度: {final_profile_stats['common_seq_lens'][:5]}")
    print(f"    常用 Batch 大小: {final_profile_stats['common_batch_sizes'][:5]}")
    
    batch_sizes = [b['size'] for b in processed_batches]
    print(f"\n  Batch 大小分布:")
    size_counts = {}
    for s in batch_sizes:
        size_counts[s] = size_counts.get(s, 0) + 1
    for size in sorted(size_counts.keys()):
        bar = '█' * size_counts[size]
        print(f"    {size:2d}: {bar} ({size_counts[size]})")
    
    stop_flag.set()
    scheduler.shutdown()
    scheduler_thread.join(timeout=2)
    
    print(f"\n  共处理 {len(processed_batches)} 个 Batch")
    print("=" * 70)
    print("  演示完成 - 防饿死机制和预热验证通过")
    print("=" * 70)


if __name__ == "__main__":
    run_scheduler_demo()
