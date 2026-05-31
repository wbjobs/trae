import json
import re
from typing import List, Dict, Optional, AsyncIterator, Tuple
import httpx

from config import settings


class LlamaCppClient:
    def __init__(self):
        self.base_url = settings.LLAMA_CPP_BASE_URL.rstrip("/")
        self.api_key = settings.LLAMA_CPP_API_KEY
        self.model = settings.LLAMA_CPP_MODEL

    def _build_prompt(self, query: str, contexts: List[Dict]) -> str:
        if not contexts:
            return f"""你是一个 helpful 的 AI 助手。

用户问题：{query}

请回答："""

        context_blocks = []
        for i, ctx in enumerate(contexts):
            source = ctx.get("doc_title", ctx.get("source", "未知"))
            similarity = ctx.get("similarity", 0)
            content = ctx["content"]
            context_blocks.append(
                f"[文档{i+1} | 来源: {source} | 相关度: {similarity:.2f}]\n{content}"
            )

        context_text = "\n\n---\n\n".join(context_blocks)

        prompt = f"""你是一个严谨的问答系统。请严格遵守以下规则：

【核心规则】
1. 你只能基于下方提供的参考文档来回答问题
2. 如果参考文档中没有足够信息来回答问题，请直接说"根据提供的文档，无法回答此问题"
3. 绝对不允许使用你自己的知识或猜测来回答
4. 回答时请注明引用来源（如：根据文档1...）

【参考文档】
{context_text}

【用户问题】
{query}

【回答要求】
- 仅使用参考文档中的信息
- 引用时注明文档编号
- 若信息不足，明确说明无法回答

请回答："""

        return prompt

    def _build_stream_prompt(self, query: str, contexts: List[Dict]) -> str:
        return self._build_prompt(query, contexts)

    def validate_relevance(self, query: str, contexts: List[Dict]) -> Tuple[bool, str]:
        if not contexts:
            return False, "未找到相关文档"

        avg_similarity = sum(ctx.get("similarity", 0) for ctx in contexts) / len(contexts)
        max_similarity = max(ctx.get("similarity", 0) for ctx in contexts)

        if max_similarity < settings.SIMILARITY_THRESHOLD:
            return False, f"所有文档的相关度过低 (最高: {max_similarity:.2f}, 阈值: {settings.SIMILARITY_THRESHOLD})"

        if avg_similarity < 0.3:
            return False, f"文档平均相关度过低 (平均: {avg_similarity:.2f})"

        query_keywords = self._extract_keywords(query)
        matched_contexts = 0
        for ctx in contexts:
            content_lower = ctx["content"].lower()
            keyword_matches = sum(1 for kw in query_keywords if kw.lower() in content_lower)
            if keyword_matches > 0:
                matched_contexts += 1

        if matched_contexts == 0 and len(query_keywords) > 0:
            return False, "查询关键词未在任何文档中出现"

        return True, "相关性验证通过"

    def _extract_keywords(self, text: str) -> List[str]:
        stop_words = {
            "的", "了", "在", "是", "我", "有", "和", "就", "不", "人", "都", "一", "一个",
            "上", "也", "很", "到", "说", "要", "去", "你", "会", "着", "没有", "看", "好",
            "自己", "这", "他", "她", "它", "们", "那", "些", "什么", "怎么", "如何",
            "为什么", "可以", "可能", "应该", "the", "a", "an", "is", "are", "was", "were",
            "be", "been", "being", "have", "has", "had", "do", "does", "did", "will", "would",
            "could", "should", "may", "might", "shall", "can", "need", "dare", "ought",
            "used", "to", "of", "in", "for", "on", "with", "at", "by", "from", "as",
            "into", "through", "during", "before", "after", "above", "below", "between",
            "and", "but", "or", "nor", "not", "so", "yet", "both", "either", "neither",
            "each", "every", "all", "any", "few", "more", "most", "other", "some", "such",
            "no", "only", "own", "same", "than", "too", "very", "s", "t", "just", "don",
            "what", "which", "who", "whom", "this", "that", "these", "those", "i", "me",
            "my", "we", "our", "you", "your", "he", "him", "his", "she", "her", "it", "its",
            "they", "them", "their"
        }

        words = re.findall(r'\b[\w\u4e00-\u9fff]+\b', text.lower())
        keywords = [w for w in words if w not in stop_words and len(w) > 1]
        return list(set(keywords))

    def filter_contexts_by_relevance(self, query: str, contexts: List[Dict]) -> List[Dict]:
        if not contexts:
            return contexts

        query_keywords = self._extract_keywords(query)
        if not query_keywords:
            return contexts

        scored_contexts = []
        for ctx in contexts:
            content_lower = ctx["content"].lower()
            keyword_matches = sum(1 for kw in query_keywords if kw.lower() in content_lower)
            keyword_ratio = keyword_matches / len(query_keywords) if query_keywords else 0

            adjusted_score = ctx.get("similarity", 0) * 0.7 + keyword_ratio * 0.3
            scored_contexts.append((adjusted_score, keyword_matches, ctx))

        scored_contexts.sort(key=lambda x: (x[0], x[1]), reverse=True)

        return [ctx for _, _, ctx in scored_contexts if _ > 0 or True][:settings.TOP_K]

    async def generate(
        self,
        query: str,
        contexts: List[Dict],
        temperature: Optional[float] = None,
        max_tokens: Optional[int] = None
    ) -> str:
        is_relevant, message = self.validate_relevance(query, contexts)
        if not is_relevant:
            return f"无法回答此问题。原因：{message}"

        filtered_contexts = self.filter_contexts_by_relevance(query, contexts)
        prompt = self._build_prompt(query, filtered_contexts)

        temp = temperature if temperature is not None else settings.TEMPERATURE
        tokens = max_tokens if max_tokens is not None else settings.MAX_TOKENS

        payload = {
            "model": self.model,
            "prompt": prompt,
            "temperature": temp,
            "max_tokens": tokens,
            "stream": False,
            "stop": ["[文档", "---", "用户问题"]
        }

        url = f"{self.base_url}/v1/completions"
        headers = {
            "Content-Type": "application/json",
            "Authorization": f"Bearer {self.api_key}"
        }

        async with httpx.AsyncClient(timeout=120.0) as client:
            response = await client.post(url, json=payload, headers=headers)
            response.raise_for_status()
            data = response.json()
            answer = data.get("choices", [{}])[0].get("text", "")

            cleaned_answer = self._clean_answer(answer)
            return cleaned_answer

    async def generate_stream(
        self,
        query: str,
        contexts: List[Dict],
        temperature: Optional[float] = None,
        max_tokens: Optional[int] = None
    ) -> AsyncIterator[str]:
        is_relevant, message = self.validate_relevance(query, contexts)
        if not is_relevant:
            yield f"无法回答此问题。原因：{message}"
            return

        filtered_contexts = self.filter_contexts_by_relevance(query, contexts)
        prompt = self._build_stream_prompt(query, filtered_contexts)

        temp = temperature if temperature is not None else settings.TEMPERATURE
        tokens = max_tokens if max_tokens is not None else settings.MAX_TOKENS

        payload = {
            "model": self.model,
            "prompt": prompt,
            "temperature": temp,
            "max_tokens": tokens,
            "stream": True,
            "stop": ["[文档", "---", "用户问题"]
        }

        url = f"{self.base_url}/v1/completions"
        headers = {
            "Content-Type": "application/json",
            "Authorization": f"Bearer {self.api_key}"
        }

        async with httpx.AsyncClient(timeout=300.0) as client:
            async with client.stream("POST", url, json=payload, headers=headers) as response:
                response.raise_for_status()
                async for line in response.aiter_lines():
                    if line.startswith("data: "):
                        data = line[6:]
                        if data == "[DONE]":
                            break
                        try:
                            json_data = json.loads(data)
                            content = json_data.get("choices", [{}])[0].get("text", "")
                            if content:
                                yield content
                        except json.JSONDecodeError:
                            continue

    def _clean_answer(self, answer: str) -> str:
        answer = answer.strip()

        patterns_to_remove = [
            r'\[文档\d+\].*?(?=\n|$)',
            r'---.*',
            r'用户问题.*',
            r'【参考文档】.*',
            r'【回答要求】.*',
            r'请回答.*',
        ]

        for pattern in patterns_to_remove:
            answer = re.sub(pattern, '', answer, flags=re.DOTALL)

        answer = re.sub(r'\n{3,}', '\n\n', answer)
        answer = answer.strip()

        if not answer:
            return "根据提供的文档，无法回答此问题。"

        return answer

    async def check_health(self) -> Dict:
        try:
            url = f"{self.base_url}/health"
            async with httpx.AsyncClient(timeout=10.0) as client:
                response = await client.get(url)
                if response.status_code == 200:
                    return {"status": "healthy", "details": response.json()}
                return {"status": "unhealthy", "status_code": response.status_code}
        except Exception as e:
            return {"status": "unreachable", "error": str(e)}
