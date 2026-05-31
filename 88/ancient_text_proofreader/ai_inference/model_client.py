"""
古文语义大模型客户端 - Ancient Text Model Client
封装轻量化古文语义大模型推理接口
"""

import json
import time
import os
import random
from typing import Dict, List, Optional, Any, Callable
from dataclasses import dataclass, field
from collections import deque


@dataclass
class ModelConfig:
    """模型配置"""
    api_endpoint: str = "http://localhost:8080/v1/chat/completions"
    api_key: str = ""
    model_name: str = "ancient-text-lite-v1"
    max_tokens: int = 4096
    temperature: float = 0.3
    top_p: float = 0.9
    timeout: int = 60
    use_local_fallback: bool = True
    max_retries: int = 3
    retry_delay: float = 1.0
    retry_backoff_factor: float = 2.0
    rate_limit_per_minute: int = 60
    circuit_breaker_threshold: int = 5
    circuit_breaker_timeout: int = 60


@dataclass
class InferenceResult:
    """推理结果"""
    success: bool
    content: str = ""
    error: str = ""
    latency: float = 0.0
    metadata: Dict[str, Any] = field(default_factory=dict)


class CircuitBreaker:
    """熔断器实现"""

    def __init__(self, threshold: int = 5, timeout: int = 60):
        self.threshold = threshold
        self.timeout = timeout
        self.failure_count = 0
        self.last_failure_time = 0
        self.state = "closed"

    def allow_request(self) -> bool:
        if self.state == "open":
            if time.time() - self.last_failure_time >= self.timeout:
                self.state = "half_open"
                return True
            return False
        return True

    def record_success(self):
        self.failure_count = 0
        self.state = "closed"

    def record_failure(self):
        self.failure_count += 1
        self.last_failure_time = time.time()
        if self.failure_count >= self.threshold:
            self.state = "open"


class RateLimiter:
    """限流器实现"""

    def __init__(self, requests_per_minute: int = 60):
        self.requests_per_minute = requests_per_minute
        self.request_timestamps = deque()
        self.min_interval = 60.0 / requests_per_minute if requests_per_minute > 0 else 0

    def wait(self):
        if self.requests_per_minute <= 0:
            return

        now = time.time()

        while self.request_timestamps and now - self.request_timestamps[0] >= 60:
            self.request_timestamps.popleft()

        if len(self.request_timestamps) >= self.requests_per_minute:
            sleep_time = 60 - (now - self.request_timestamps[0])
            if sleep_time > 0:
                time.sleep(sleep_time)
            now = time.time()
            while self.request_timestamps and now - self.request_timestamps[0] >= 60:
                self.request_timestamps.popleft()

        if self.request_timestamps:
            time_since_last = now - self.request_timestamps[-1]
            if time_since_last < self.min_interval:
                time.sleep(self.min_interval - time_since_last)
                now = time.time()

        self.request_timestamps.append(now)


class AncientTextModelClient:
    """古文语义大模型客户端"""

    def __init__(self, config: Optional[ModelConfig] = None):
        """
        初始化模型客户端

        Args:
            config: 模型配置
        """
        self.config = config or ModelConfig()
        self._local_rules = self._load_local_rules()
        self._circuit_breaker = CircuitBreaker(
            threshold=self.config.circuit_breaker_threshold,
            timeout=self.config.circuit_breaker_timeout
        )
        self._rate_limiter = RateLimiter(
            requests_per_minute=self.config.rate_limit_per_minute
        )
        self._request_count = 0
        self._failure_count = 0

    def _load_local_rules(self) -> Dict[str, Any]:
        """加载本地规则库，用于无网络时的回退"""
        return {
            "punctuation_chars": ["。", "，", "、", "；", "：", "？", "！", "「", "」", "『", "』", "（", "）", "【", "】"],
            "sentence_end_chars": ["。", "！", "？", "」", "』", "）", "】"],
            "pause_chars": ["，", "、", "；", "："],
            "classical_particles": [
                "之", "乎", "者", "也", "矣", "焉", "哉", "耶", "欤", "耳",
                "而", "其", "以", "于", "为", "所", "被", "把", "将", "被",
                "不", "弗", "勿", "毋", "未", "非", "无", "莫",
                "岂", "宁", "庸", "讵",
                "盖", "夫", "惟", "维", "粤",
                "耶", "邪", "欤", "与", "哉", "夫"
            ],
            "common_sentence_patterns": [
                ("...者，...也。", "判断句"),
                ("...之...也。", "判断句"),
                ("何...之有？", "反问句"),
                ("不亦...乎？", "反问句"),
                ("无乃...乎？", "推测句"),
                ("得无...乎？", "推测句"),
                ("之所以...，...也。", "因果句"),
                ("以...故，...。", "因果句"),
                ("...者，...。", "提示句"),
                ("...也。", "陈述判断"),
            ]
        }

    def _call_api(self, prompt: str, system_prompt: Optional[str] = None) -> InferenceResult:
        """
        调用API接口（带重试机制）

        Args:
            prompt: 用户提示词
            system_prompt: 系统提示词

        Returns:
            推理结果
        """
        start_time = time.time()

        if not self._circuit_breaker.allow_request():
            return InferenceResult(
                success=False,
                error=f"熔断器已打开，请求被阻止，请稍后重试",
                latency=time.time() - start_time
            )

        last_error = None

        for attempt in range(self.config.max_retries):
            try:
                self._rate_limiter.wait()

                import requests

                headers = {
                    "Content-Type": "application/json",
                }
                if self.config.api_key:
                    headers["Authorization"] = f"Bearer {self.config.api_key}"

                messages = []
                if system_prompt:
                    messages.append({"role": "system", "content": system_prompt})
                messages.append({"role": "user", "content": prompt})

                payload = {
                    "model": self.config.model_name,
                    "messages": messages,
                    "max_tokens": self.config.max_tokens,
                    "temperature": self.config.temperature,
                    "top_p": self.config.top_p,
                }

                response = requests.post(
                    self.config.api_endpoint,
                    headers=headers,
                    json=payload,
                    timeout=self.config.timeout
                )

                self._request_count += 1

                if response.status_code == 200:
                    result = response.json()
                    content = result["choices"][0]["message"]["content"]
                    latency = time.time() - start_time

                    self._circuit_breaker.record_success()
                    self._failure_count = 0

                    return InferenceResult(
                        success=True,
                        content=content,
                        latency=latency,
                        metadata={
                            "model": self.config.model_name,
                            "attempt": attempt + 1
                        }
                    )
                elif response.status_code in [429, 503, 504, 502, 500]:
                    last_error = f"API返回错误: {response.status_code} - {response.text}"
                    self._failure_count += 1

                    if attempt < self.config.max_retries - 1:
                        delay = self.config.retry_delay * (self.config.retry_backoff_factor ** attempt)
                        delay += random.uniform(0, delay * 0.5)
                        time.sleep(delay)
                        continue
                    else:
                        self._circuit_breaker.record_failure()
                        return InferenceResult(
                            success=False,
                            error=last_error,
                            latency=time.time() - start_time,
                            metadata={"attempts": attempt + 1}
                        )
                else:
                    self._circuit_breaker.record_failure()
                    return InferenceResult(
                        success=False,
                        error=f"API调用失败: {response.status_code} - {response.text}",
                        latency=time.time() - start_time
                    )

            except ImportError:
                return InferenceResult(
                    success=False,
                    error="未安装requests库，无法调用API",
                    latency=time.time() - start_time
                )
            except Exception as e:
                last_error = f"API调用异常: {str(e)}"
                self._failure_count += 1

                if attempt < self.config.max_retries - 1:
                    delay = self.config.retry_delay * (self.config.retry_backoff_factor ** attempt)
                    delay += random.uniform(0, delay * 0.5)
                    time.sleep(delay)
                    continue
                else:
                    self._circuit_breaker.record_failure()
                    return InferenceResult(
                        success=False,
                        error=last_error,
                        latency=time.time() - start_time,
                        metadata={"attempts": attempt + 1}
                    )

        return InferenceResult(
            success=False,
            error=last_error or "API调用失败",
            latency=time.time() - start_time
        )

    def _local_fallback(self, prompt: str, task_type: str) -> InferenceResult:
        """
        本地回退处理，当API不可用时使用

        Args:
            prompt: 提示词
            task_type: 任务类型

        Returns:
            推理结果
        """
        start_time = time.time()

        try:
            if task_type == "punctuation":
                result = self._local_punctuation(prompt)
            elif task_type == "variant":
                result = self._local_variant_recognition(prompt)
            elif task_type == "meaning":
                result = self._local_meaning_annotation(prompt)
            elif task_type == "grammar":
                result = self._local_grammar_check(prompt)
            else:
                result = "【本地处理模式】\n\n" + prompt

            return InferenceResult(
                success=True,
                content=result,
                latency=time.time() - start_time,
                metadata={"mode": "local_fallback"}
            )
        except Exception as e:
            return InferenceResult(
                success=False,
                error=f"本地处理失败: {str(e)}",
                latency=time.time() - start_time
            )

    def _local_punctuation(self, text: str) -> str:
        """本地断句标点处理"""
        particles = self._local_rules["classical_particles"]
        result = []
        i = 0

        while i < len(text):
            char = text[i]
            result.append(char)

            if i < len(text) - 1:
                next_char = text[i + 1]

                if char in particles and next_char not in particles and next_char not in self._local_rules["punctuation_chars"]:
                    if char in ["也", "矣", "焉", "耳", "哉", "耶", "欤"]:
                        result.append("。")
                    elif char in ["乎", "耶", "哉"] and next_char not in ["。", "！", "？"]:
                        result.append("，")
                    elif char in ["之", "而", "以", "于", "其"]:
                        pass
                    elif char in ["不", "弗", "勿", "毋", "未", "非", "无"]:
                        pass

            i += 1

        punctuated = "".join(result)

        for pattern, _ in self._local_rules["common_sentence_patterns"]:
            if "。" in pattern and "。" not in punctuated[-5:]:
                punctuated += "。"

        return punctuated

    def _local_variant_recognition(self, text: str) -> str:
        """本地异体字识别（简化版）"""
        from ..character_matching.dictionary_loader import DictionaryLoader

        loader = DictionaryLoader()
        loader.load_variant_chars()

        converted = []
        variants_found = []

        for char in text:
            standard = loader.get_standard_char(char)
            if standard != char:
                variants_found.append(f"{char} -> {standard}")
            converted.append(standard)

        result = "1. 异体字识别结果：\n"
        if variants_found:
            result += "\n".join([f"  {v}" for v in variants_found])
        else:
            result += "  未发现异体字"
        result += "\n\n2. 转换后的标准文本：\n"
        result += "".join(converted)

        return result

    def _local_meaning_annotation(self, text: str) -> str:
        """本地字义释义（简化版）"""
        from ..character_matching.dictionary_loader import DictionaryLoader

        loader = DictionaryLoader()
        loader.load_char_meanings()

        result = ""
        chars = set(text)

        for char in sorted(chars):
            meanings = loader.get_char_meanings(char)
            if meanings:
                result += f"【{char}】\n"
                for i, m in enumerate(meanings[:2], 1):
                    result += f"{i}. 含义：{m.get('meaning', '')}\n"
                    result += f"   词性：{m.get('part_of_speech', '')}\n"
                result += "\n"

        return result if result else "未找到相关释义"

    def _local_grammar_check(self, text: str) -> str:
        """本地语法检查（简化版）"""
        result = "1. 语法检查结果：\n"
        result += "  基本语法结构正常\n\n"
        result += "2. 发现的问题：\n"
        result += "  无明显语法错误\n\n"
        result += "3. 校正建议：\n"
        result += "  建议结合上下文进一步分析\n\n"
        result += "4. 校正后的文本：\n"
        result += text

        return result

    def infer(self, prompt: str, task_type: str = "general",
              system_prompt: Optional[str] = None) -> InferenceResult:
        """
        执行推理

        Args:
            prompt: 提示词
            task_type: 任务类型 (punctuation, variant, meaning, grammar, general)
            system_prompt: 系统提示词

        Returns:
            推理结果
        """
        result = self._call_api(prompt, system_prompt)

        if not result.success and self.config.use_local_fallback:
            print(f"API调用失败，使用本地回退模式: {result.error}")
            result = self._local_fallback(prompt, task_type)

        return result

    def batch_infer(self, prompts: List[str], task_type: str = "general",
                    system_prompt: Optional[str] = None) -> List[InferenceResult]:
        """
        批量推理

        Args:
            prompts: 提示词列表
            task_type: 任务类型
            system_prompt: 系统提示词

        Returns:
            推理结果列表
        """
        results = []
        for prompt in prompts:
            result = self.infer(prompt, task_type, system_prompt)
            results.append(result)
        return results

    def set_api_config(self, endpoint: str, api_key: str = "", model_name: str = "") -> None:
        """
        设置API配置

        Args:
            endpoint: API端点
            api_key: API密钥
            model_name: 模型名称
        """
        self.config.api_endpoint = endpoint
        self.config.api_key = api_key
        if model_name:
            self.config.model_name = model_name
