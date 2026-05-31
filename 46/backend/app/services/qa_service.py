import re
import uuid
from typing import List, Dict, Any, Optional, Tuple
from dataclasses import dataclass
from ..config import settings
from ..database import get_collection
from ..schemas.document import QARequest, QAResponse, SourceReference


@dataclass
class TextChunk:
    content: str
    start_idx: int
    end_idx: int
    page_number: Optional[int] = None


class QAService:
    def __init__(self):
        self.use_llm = bool(settings.OPENAI_API_KEY)
        self.documents_collection = get_collection("documents")
        self._init_llm()

    def _init_llm(self):
        if not self.use_llm:
            return
        try:
            from langchain_openai import ChatOpenAI
            from langchain_core.prompts import ChatPromptTemplate

            self.llm = ChatOpenAI(
                api_key=settings.OPENAI_API_KEY,
                model_name=settings.OPENAI_MODEL,
                temperature=0.3
            )

            self.qa_prompt = ChatPromptTemplate.from_messages([
                ("system", """你是一个专业的文档问答助手。请基于提供的文档内容回答用户的问题。

回答要求：
1. 只使用文档中提供的信息，不要使用外部知识
2. 如果文档中没有相关信息，请明确说明"文档中未找到相关信息"
3. 回答要准确、简洁、有条理
4. 重要信息可以适当引用原文
5. 对于表格数据，请清晰地呈现

请按照以下 JSON 格式输出回答：
{
  "answer": "你的回答内容",
  "confidence": 0.85,
  "sources": [
    {
      "text": "引用的原文片段",
      "page_number": 1,
      "start_index": 100,
      "end_index": 200
    }
  ]
}

confidence 表示回答的可信度，范围 0-1：
- 0.8-1.0: 文档中有明确、完整的答案
- 0.5-0.8: 文档中有部分相关信息，但不完整
- 0.0-0.5: 文档中没有直接答案，只能推测或没有相关信息"""),
                ("human", """文档内容：
{context}

用户问题：{question}

请基于文档内容回答问题。""")
            ])

        except Exception as e:
            print(f"初始化 LLM 失败: {e}")
            self.use_llm = False

    def _chunk_text(self, text: str, chunk_size: int = 1000, overlap: int = 200) -> List[TextChunk]:
        chunks = []
        if not text:
            return chunks

        page_pattern = r'--- 第 (\d+) 页 ---'
        page_matches = list(re.finditer(page_pattern, text))

        pages = []
        for i, match in enumerate(page_matches):
            page_num = int(match.group(1))
            start = match.end()
            end = page_matches[i + 1].start() if i + 1 < len(page_matches) else len(text)
            page_content = text[start:end].strip()
            pages.append((page_num, page_content, start))

        if not pages:
            pages = [(1, text, 0)]

        for page_num, page_content, page_start in pages:
            content_len = len(page_content)
            if content_len == 0:
                continue

            for i in range(0, content_len, chunk_size - overlap):
                chunk_end = min(i + chunk_size, content_len)
                chunk_content = page_content[i:chunk_end]

                if len(chunk_content.strip()) < 50:
                    continue

                chunks.append(TextChunk(
                    content=chunk_content,
                    start_idx=page_start + i,
                    end_idx=page_start + chunk_end,
                    page_number=page_num
                ))

        return chunks

    def _keyword_search(self, question: str, chunks: List[TextChunk], top_k: int = 5) -> List[TextChunk]:
        question_words = re.findall(r'[\u4e00-\u9fa5A-Za-z0-9]+', question.lower())
        question_words = [w for w in question_words if len(w) > 1]

        if not question_words:
            return chunks[:top_k]

        scored_chunks = []
        for chunk in chunks:
            score = 0
            chunk_lower = chunk.content.lower()

            for word in question_words:
                count = chunk_lower.count(word)
                if count > 0:
                    score += count * (1 + len(word) * 0.1)

            if score > 0:
                scored_chunks.append((score, chunk))

        scored_chunks.sort(key=lambda x: x[0], reverse=True)
        return [chunk for _, chunk in scored_chunks[:top_k]]

    def _build_context(self, chunks: List[TextChunk], max_chars: int = 4000) -> str:
        context_parts = []
        current_length = 0

        for chunk in chunks:
            chunk_text = f"[第 {chunk.page_number} 页] {chunk.content}\n\n"
            if current_length + len(chunk_text) > max_chars and context_parts:
                break
            context_parts.append(chunk_text)
            current_length += len(chunk_text)

        return "".join(context_parts)

    def _find_source_references(
        self,
        answer: str,
        chunks: List[TextChunk],
        full_text: str
    ) -> List[SourceReference]:
        sources = []
        answer_sentences = re.split(r'[。！？.!?\n]', answer)
        answer_sentences = [s.strip() for s in answer_sentences if len(s.strip()) > 10]

        for sentence in answer_sentences[:5]:
            best_match = None
            best_score = 0

            for chunk in chunks:
                chunk_lower = chunk.content.lower()
                sentence_lower = sentence.lower()

                words = re.findall(r'[\u4e00-\u9fa5A-Za-z0-9]+', sentence_lower)
                words = [w for w in words if len(w) > 2]
                if not words:
                    continue

                matches = sum(1 for w in words if w in chunk_lower)
                score = matches / len(words) if words else 0

                if score > best_score and score >= 0.3:
                    best_score = score
                    best_match = chunk

            if best_match:
                start_idx = max(0, full_text.find(best_match.content[:100]))
                end_idx = start_idx + len(best_match.content)

                existing = any(
                    s.text[:50] == best_match.content[:50]
                    for s in sources
                )

                if not existing:
                    snippet = best_match.content[:200]
                    if len(best_match.content) > 200:
                        snippet += "..."

                    sources.append(SourceReference(
                        text=snippet,
                        page_number=best_match.page_number,
                        start_index=start_idx if start_idx >= 0 else 0,
                        end_index=end_idx if end_idx >= 0 else len(best_match.content)
                    ))

        return sources[:3]

    def answer_question(self, request: QARequest) -> QAResponse:
        doc = self.documents_collection.find_one({"document_id": request.document_id})
        if not doc:
            return QAResponse(
                answer="未找到对应的文档，请检查文档ID是否正确。",
                confidence=0.0,
                sources=[],
                can_answer=False
            )

        full_text = doc.get("text_content", "")
        if not full_text or len(full_text.strip()) == 0:
            return QAResponse(
                answer="文档中没有可提取的文本内容，无法回答问题。",
                confidence=0.0,
                sources=[],
                can_answer=False
            )

        chunks = self._chunk_text(full_text)
        relevant_chunks = self._keyword_search(request.question, chunks, top_k=8)

        if not relevant_chunks:
            return QAResponse(
                answer="文档中未找到与问题相关的信息。",
                confidence=0.0,
                sources=[],
                can_answer=False
            )

        if self.use_llm:
            return self._answer_with_llm(request.question, relevant_chunks, full_text)
        else:
            return self._answer_with_rules(request.question, relevant_chunks, full_text)

    def _answer_with_llm(
        self,
        question: str,
        chunks: List[TextChunk],
        full_text: str
    ) -> QAResponse:
        try:
            context = self._build_context(chunks, max_chars=6000)
            chain = self.qa_prompt | self.llm
            result = chain.invoke({
                "context": context,
                "question": question
            })

            content = result.content.strip()

            import json
            json_match = re.search(r'\{[\s\S]*\}', content)
            if json_match:
                try:
                    data = json.loads(json_match.group(0))
                    answer = data.get("answer", "")
                    confidence = data.get("confidence", 0.5)
                    sources_data = data.get("sources", [])

                    sources = []
                    for s in sources_data[:3]:
                        sources.append(SourceReference(
                            text=s.get("text", "")[:300],
                            page_number=s.get("page_number"),
                            start_index=s.get("start_index", 0),
                            end_index=s.get("end_index", 0)
                        ))

                    if not sources:
                        sources = self._find_source_references(answer, chunks, full_text)

                    return QAResponse(
                        answer=answer,
                        confidence=confidence,
                        sources=sources,
                        can_answer=confidence > 0.3
                    )
                except Exception as e:
                    print(f"解析 LLM 响应失败: {e}")

            answer = content.replace("```json", "").replace("```", "").strip()
            sources = self._find_source_references(answer, chunks, full_text)

            return QAResponse(
                answer=answer,
                confidence=0.6,
                sources=sources,
                can_answer=True
            )

        except Exception as e:
            print(f"LLM 回答失败: {e}")
            return self._answer_with_rules(question, chunks, full_text)

    def _answer_with_rules(
        self,
        question: str,
        chunks: List[TextChunk],
        full_text: str
    ) -> QAResponse:
        answer_parts = []
        used_chunks = []

        question_keywords = self._extract_keywords(question)

        for chunk in chunks[:3]:
            chunk_keywords = self._extract_keywords(chunk.content)
            overlap = len(set(question_keywords) & set(chunk_keywords))

            if overlap > 0:
                sentences = re.split(r'(?<=[。！？.!?])', chunk.content)
                relevant_sentences = []

                for sentence in sentences:
                    if len(sentence.strip()) > 10:
                        sent_keywords = self._extract_keywords(sentence)
                        sent_overlap = len(set(question_keywords) & set(sent_keywords))
                        if sent_overlap > 0:
                            relevant_sentences.append(sentence.strip())

                if relevant_sentences:
                    answer_parts.append("".join(relevant_sentences[:3]))
                    used_chunks.append(chunk)

        if not answer_parts:
            most_relevant = chunks[0]
            snippet = most_relevant.content[:500]
            if len(most_relevant.content) > 500:
                snippet += "..."

            return QAResponse(
                answer=f"根据文档内容，最相关的片段如下：\n\n{snippet}",
                confidence=0.3,
                sources=[SourceReference(
                    text=most_relevant.content[:300],
                    page_number=most_relevant.page_number,
                    start_index=most_relevant.start_idx,
                    end_index=most_relevant.end_idx
                )],
                can_answer=False
            )

        answer = "\n\n".join(answer_parts)

        sources = []
        for chunk in used_chunks[:3]:
            snippet = chunk.content[:300]
            if len(chunk.content) > 300:
                snippet += "..."
            sources.append(SourceReference(
                text=snippet,
                page_number=chunk.page_number,
                start_index=chunk.start_idx,
                end_index=chunk.end_idx
            ))

        answer = f"根据文档内容，找到以下相关信息：\n\n{answer}"

        return QAResponse(
            answer=answer,
            confidence=0.5,
            sources=sources,
            can_answer=True
        )

    def _extract_keywords(self, text: str) -> List[str]:
        words = re.findall(r'[\u4e00-\u9fa5A-Za-z0-9]+', text.lower())
        stopwords = {
            '的', '是', '在', '了', '和', '与', '及', '或', '对', '为', '以', '于',
            '上', '下', '中', '内', '外', '前', '后', '左', '右',
            '个', '项', '条', '款', '页', '行', '列', '表', '图',
            '什么', '怎么', '如何', '为什么', '哪里', '哪个', '哪些',
            '是', '有', '要', '可以', '需要', '应该',
            'the', 'a', 'an', 'is', 'are', 'was', 'were',
            'in', 'on', 'at', 'to', 'for', 'of', 'with',
            'what', 'how', 'why', 'where', 'when', 'who', 'which'
        }
        return [w for w in words if len(w) > 1 and w not in stopwords]

    def get_qa_history(self, document_id: str, limit: int = 10) -> List[Dict[str, Any]]:
        qa_collection = get_collection("qa_history")
        cursor = qa_collection.find({"document_id": document_id}).sort("created_at", -1).limit(limit)
        return list(cursor)

    def save_qa_history(self, document_id: str, question: str, answer: QAResponse):
        qa_collection = get_collection("qa_history")
        qa_collection.insert_one({
            "document_id": document_id,
            "question": question,
            "answer": answer.model_dump(),
            "created_at": __import__("datetime").datetime.utcnow()
        })
