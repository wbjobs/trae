#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""
AI勘校人工复核批注模块 - Manual Review Module
提供AI勘校结果的人工复核、批注、修正功能
"""

import json
import os
import time
from typing import Dict, List, Optional, Any, Tuple
from dataclasses import dataclass, field, asdict
from datetime import datetime


@dataclass
class ReviewComment:
    """复核批注"""
    comment_id: str
    position: int
    original_text: str
    suggested_text: str
    comment_type: str
    content: str
    reviewer: str
    timestamp: str
    status: str = "pending"
    resolved_text: Optional[str] = None

    def to_dict(self) -> Dict[str, Any]:
        return asdict(self)


@dataclass
class CorrectionRecord:
    """修正记录"""
    correction_id: str
    position: int
    original: str
    corrected: str
    correction_type: str
    reason: str
    reviewer: str
    timestamp: str
    ai_suggestion: Optional[str] = None
    confidence: float = 0.0

    def to_dict(self) -> Dict[str, Any]:
        return asdict(self)


@dataclass
class ReviewSession:
    """复核会话"""
    session_id: str
    document_id: str
    document_title: str
    created_at: str
    updated_at: str
    status: str = "in_progress"
    reviewer: str = ""
    comments: List[ReviewComment] = field(default_factory=list)
    corrections: List[CorrectionRecord] = field(default_factory=list)
    ai_results: Dict[str, Any] = field(default_factory=dict)
    statistics: Dict[str, Any] = field(default_factory=dict)

    def to_dict(self) -> Dict[str, Any]:
        return {
            "session_id": self.session_id,
            "document_id": self.document_id,
            "document_title": self.document_title,
            "created_at": self.created_at,
            "updated_at": self.updated_at,
            "status": self.status,
            "reviewer": self.reviewer,
            "comments": [c.to_dict() for c in self.comments],
            "corrections": [c.to_dict() for c in self.corrections],
            "ai_results": self.ai_results,
            "statistics": self.statistics
        }


class ReviewManager:
    """人工复核管理器"""

    def __init__(self, review_dir: Optional[str] = None):
        """
        初始化复核管理器

        Args:
            review_dir: 复核数据保存目录
        """
        if review_dir is None:
            review_dir = os.path.join(
                os.path.dirname(os.path.dirname(os.path.abspath(__file__))),
                "review_data"
            )
        self.review_dir = review_dir
        os.makedirs(self.review_dir, exist_ok=True)

        self.current_session: Optional[ReviewSession] = None
        self.sessions: Dict[str, ReviewSession] = {}

        self.comment_types = [
            "variant_error",
            "punctuation_error",
            "meaning_error",
            "grammar_error",
            "format_error",
            "other"
        ]

        self.correction_types = [
            "variant_correction",
            "punctuation_correction",
            "meaning_correction",
            "grammar_correction",
            "format_correction",
            "other"
        ]

        self.session_statuses = [
            "in_progress",
            "reviewing",
            "completed",
            "approved",
            "rejected"
        ]

    def create_session(self, document_id: str, document_title: str,
                       ai_results: Optional[Dict[str, Any]] = None,
                       reviewer: str = "") -> ReviewSession:
        """
        创建新的复核会话

        Args:
            document_id: 文档ID
            document_title: 文档标题
            ai_results: AI勘校结果
            reviewer: 复核人

        Returns:
            复核会话
        """
        now = datetime.now().isoformat()
        session_id = f"review_{document_id}_{int(time.time())}"

        session = ReviewSession(
            session_id=session_id,
            document_id=document_id,
            document_title=document_title,
            created_at=now,
            updated_at=now,
            status="in_progress",
            reviewer=reviewer,
            ai_results=ai_results or {},
            statistics=self._initialize_statistics()
        )

        self.sessions[session_id] = session
        self.current_session = session

        return session

    def _initialize_statistics(self) -> Dict[str, Any]:
        """初始化统计信息"""
        return {
            "total_comments": 0,
            "total_corrections": 0,
            "resolved_comments": 0,
            "pending_comments": 0,
            "corrections_by_type": {},
            "comments_by_type": {},
            "ai_accuracy_estimation": 0.0,
            "review_duration_minutes": 0.0
        }

    def load_session(self, session_id: str) -> Optional[ReviewSession]:
        """
        加载已保存的复核会话

        Args:
            session_id: 会话ID

        Returns:
            复核会话，如果不存在则返回None
        """
        session_file = os.path.join(self.review_dir, f"{session_id}.json")
        if not os.path.exists(session_file):
            return None

        try:
            with open(session_file, "r", encoding="utf-8") as f:
                data = json.load(f)

            session = self._dict_to_session(data)
            self.sessions[session_id] = session
            self.current_session = session
            return session
        except Exception as e:
            print(f"加载复核会话失败: {e}")
            return None

    def _dict_to_session(self, data: Dict[str, Any]) -> ReviewSession:
        """从字典创建会话对象"""
        comments = []
        for c in data.get("comments", []):
            comments.append(ReviewComment(
                comment_id=c["comment_id"],
                position=c["position"],
                original_text=c["original_text"],
                suggested_text=c["suggested_text"],
                comment_type=c["comment_type"],
                content=c["content"],
                reviewer=c["reviewer"],
                timestamp=c["timestamp"],
                status=c.get("status", "pending"),
                resolved_text=c.get("resolved_text")
            ))

        corrections = []
        for c in data.get("corrections", []):
            corrections.append(CorrectionRecord(
                correction_id=c["correction_id"],
                position=c["position"],
                original=c["original"],
                corrected=c["corrected"],
                correction_type=c["correction_type"],
                reason=c["reason"],
                reviewer=c["reviewer"],
                timestamp=c["timestamp"],
                ai_suggestion=c.get("ai_suggestion"),
                confidence=c.get("confidence", 0.0)
            ))

        return ReviewSession(
            session_id=data["session_id"],
            document_id=data["document_id"],
            document_title=data["document_title"],
            created_at=data["created_at"],
            updated_at=data["updated_at"],
            status=data.get("status", "in_progress"),
            reviewer=data.get("reviewer", ""),
            comments=comments,
            corrections=corrections,
            ai_results=data.get("ai_results", {}),
            statistics=data.get("statistics", self._initialize_statistics())
        )

    def save_session(self, session: Optional[ReviewSession] = None) -> bool:
        """
        保存复核会话

        Args:
            session: 要保存的会话，如果为空则保存当前会话

        Returns:
            是否保存成功
        """
        session = session or self.current_session
        if not session:
            return False

        try:
            session.updated_at = datetime.now().isoformat()
            session.statistics = self._update_statistics(session)

            session_file = os.path.join(self.review_dir, f"{session.session_id}.json")
            with open(session_file, "w", encoding="utf-8") as f:
                json.dump(session.to_dict(), f, ensure_ascii=False, indent=2)

            return True
        except Exception as e:
            print(f"保存复核会话失败: {e}")
            return False

    def add_comment(self, position: int, original_text: str, suggested_text: str,
                    comment_type: str, content: str, reviewer: str,
                    session: Optional[ReviewSession] = None) -> Optional[ReviewComment]:
        """
        添加复核批注

        Args:
            position: 文本位置
            original_text: 原始文本
            suggested_text: 建议修改文本
            comment_type: 批注类型
            content: 批注内容
            reviewer: 复核人
            session: 会话对象

        Returns:
            创建的批注
        """
        session = session or self.current_session
        if not session:
            return None

        if comment_type not in self.comment_types:
            comment_type = "other"

        comment_id = f"comment_{session.session_id}_{len(session.comments)}_{int(time.time())}"

        comment = ReviewComment(
            comment_id=comment_id,
            position=position,
            original_text=original_text,
            suggested_text=suggested_text,
            comment_type=comment_type,
            content=content,
            reviewer=reviewer,
            timestamp=datetime.now().isoformat(),
            status="pending"
        )

        session.comments.append(comment)
        return comment

    def resolve_comment(self, comment_id: str, resolved_text: str,
                        reviewer: str, session: Optional[ReviewSession] = None) -> bool:
        """
        解决批注

        Args:
            comment_id: 批注ID
            resolved_text: 解决后的文本
            reviewer: 处理人
            session: 会话对象

        Returns:
            是否成功
        """
        session = session or self.current_session
        if not session:
            return False

        for comment in session.comments:
            if comment.comment_id == comment_id:
                comment.status = "resolved"
                comment.resolved_text = resolved_text
                return True

        return False

    def add_correction(self, position: int, original: str, corrected: str,
                       correction_type: str, reason: str, reviewer: str,
                       ai_suggestion: Optional[str] = None, confidence: float = 0.0,
                       session: Optional[ReviewSession] = None) -> Optional[CorrectionRecord]:
        """
        添加修正记录

        Args:
            position: 文本位置
            original: 原始文本
            corrected: 修正后文本
            correction_type: 修正类型
            reason: 修正原因
            reviewer: 复核人
            ai_suggestion: AI建议
            confidence: 置信度
            session: 会话对象

        Returns:
            创建的修正记录
        """
        session = session or self.current_session
        if not session:
            return None

        if correction_type not in self.correction_types:
            correction_type = "other"

        correction_id = f"correction_{session.session_id}_{len(session.corrections)}_{int(time.time())}"

        correction = CorrectionRecord(
            correction_id=correction_id,
            position=position,
            original=original,
            corrected=corrected,
            correction_type=correction_type,
            reason=reason,
            reviewer=reviewer,
            timestamp=datetime.now().isoformat(),
            ai_suggestion=ai_suggestion,
            confidence=confidence
        )

        session.corrections.append(correction)
        return correction

    def apply_corrections_to_text(self, text: str,
                                   session: Optional[ReviewSession] = None) -> str:
        """
        将修正应用到文本

        Args:
            text: 原始文本
            session: 会话对象

        Returns:
            应用修正后的文本
        """
        session = session or self.current_session
        if not session or not session.corrections:
            return text

        corrections = sorted(session.corrections, key=lambda x: x.position, reverse=True)
        result = list(text)

        for corr in corrections:
            if 0 <= corr.position < len(result):
                if result[corr.position:corr.position + len(corr.original)] == list(corr.original):
                    result[corr.position:corr.position + len(corr.original)] = list(corr.corrected)

        return "".join(result)

    def update_session_status(self, status: str,
                              session: Optional[ReviewSession] = None) -> bool:
        """
        更新会话状态

        Args:
            status: 新状态
            session: 会话对象

        Returns:
            是否成功
        """
        if status not in self.session_statuses:
            return False

        session = session or self.current_session
        if not session:
            return False

        session.status = status
        session.updated_at = datetime.now().isoformat()
        return True

    def _update_statistics(self, session: ReviewSession) -> Dict[str, Any]:
        """更新统计信息"""
        stats = session.statistics.copy()

        stats["total_comments"] = len(session.comments)
        stats["total_corrections"] = len(session.corrections)
        stats["resolved_comments"] = sum(1 for c in session.comments if c.status == "resolved")
        stats["pending_comments"] = sum(1 for c in session.comments if c.status == "pending")

        stats["corrections_by_type"] = {}
        for corr in session.corrections:
            stats["corrections_by_type"][corr.correction_type] = \
                stats["corrections_by_type"].get(corr.correction_type, 0) + 1

        stats["comments_by_type"] = {}
        for comment in session.comments:
            stats["comments_by_type"][comment.comment_type] = \
                stats["comments_by_type"].get(comment.comment_type, 0) + 1

        if stats["total_comments"] > 0:
            stats["resolution_rate"] = stats["resolved_comments"] / stats["total_comments"]
        else:
            stats["resolution_rate"] = 0.0

        try:
            created = datetime.fromisoformat(session.created_at)
            updated = datetime.fromisoformat(session.updated_at)
            stats["review_duration_minutes"] = (updated - created).total_seconds() / 60
        except Exception:
            pass

        return stats

    def generate_review_report(self, session: Optional[ReviewSession] = None) -> str:
        """
        生成复核报告

        Args:
            session: 会话对象

        Returns:
            报告文本
        """
        session = session or self.current_session
        if not session:
            return "没有可用的复核会话"

        stats = self._update_statistics(session)

        report = "=" * 60 + "\n"
        report += "【AI勘校人工复核报告】\n"
        report += "=" * 60 + "\n\n"

        report += f"文档标题: {session.document_title}\n"
        report += f"文档ID: {session.document_id}\n"
        report += f"会话ID: {session.session_id}\n"
        report += f"复核人: {session.reviewer}\n"
        report += f"创建时间: {session.created_at}\n"
        report += f"更新时间: {session.updated_at}\n"
        report += f"状态: {session.status}\n\n"

        report += "【统计信息】\n"
        report += f"  批注总数: {stats['total_comments']}\n"
        report += f"  已解决: {stats['resolved_comments']}\n"
        report += f"  待处理: {stats['pending_comments']}\n"
        report += f"  修正记录: {stats['total_corrections']}\n"
        report += f"  解决率: {stats.get('resolution_rate', 0) * 100:.1f}%\n"
        report += f"  复核时长: {stats.get('review_duration_minutes', 0):.1f}分钟\n\n"

        if stats.get("corrections_by_type"):
            report += "【修正类型分布】\n"
            for corr_type, count in stats["corrections_by_type"].items():
                report += f"  {corr_type}: {count}个\n"
            report += "\n"

        if session.comments:
            report += "【批注详情】\n"
            for i, comment in enumerate(session.comments, 1):
                report += f"\n{i}. [{comment.status}] {comment.comment_type}\n"
                report += f"   位置: {comment.position}\n"
                report += f"   原文: {comment.original_text}\n"
                report += f"   建议: {comment.suggested_text}\n"
                report += f"   内容: {comment.content}\n"
                report += f"   复核人: {comment.reviewer}\n"
                if comment.resolved_text:
                    report += f"   解决: {comment.resolved_text}\n"

        if session.corrections:
            report += "\n【修正记录】\n"
            for i, corr in enumerate(session.corrections, 1):
                report += f"\n{i}. {corr.correction_type}\n"
                report += f"   位置: {corr.position}\n"
                report += f"   原文: {corr.original}\n"
                report += f"   修正: {corr.corrected}\n"
                report += f"   原因: {corr.reason}\n"
                report += f"   复核人: {corr.reviewer}\n"
                if corr.ai_suggestion:
                    report += f"   AI建议: {corr.ai_suggestion}\n"

        return report

    def list_sessions(self) -> List[Dict[str, Any]]:
        """列出所有复核会话"""
        sessions = []

        for filename in os.listdir(self.review_dir):
            if not filename.endswith(".json"):
                continue

            try:
                file_path = os.path.join(self.review_dir, filename)
                with open(file_path, "r", encoding="utf-8") as f:
                    data = json.load(f)

                sessions.append({
                    "session_id": data["session_id"],
                    "document_id": data["document_id"],
                    "document_title": data["document_title"],
                    "created_at": data["created_at"],
                    "updated_at": data["updated_at"],
                    "status": data.get("status", "in_progress"),
                    "reviewer": data.get("reviewer", ""),
                    "comments_count": len(data.get("comments", [])),
                    "corrections_count": len(data.get("corrections", []))
                })
            except Exception as e:
                print(f"读取会话文件失败 {filename}: {e}")
                continue

        return sorted(sessions, key=lambda x: x["updated_at"], reverse=True)

    def delete_session(self, session_id: str) -> bool:
        """
        删除复核会话

        Args:
            session_id: 会话ID

        Returns:
            是否删除成功
        """
        session_file = os.path.join(self.review_dir, f"{session_id}.json")
        if not os.path.exists(session_file):
            return False

        try:
            os.remove(session_file)
            if session_id in self.sessions:
                del self.sessions[session_id]
            if self.current_session and self.current_session.session_id == session_id:
                self.current_session = None
            return True
        except Exception as e:
            print(f"删除会话失败: {e}")
            return False

    def export_review_data(self, session: Optional[ReviewSession] = None,
                           export_format: str = "json") -> Optional[str]:
        """
        导出复核数据

        Args:
            session: 会话对象
            export_format: 导出格式 (json, txt)

        Returns:
            导出的数据字符串
        """
        session = session or self.current_session
        if not session:
            return None

        if export_format == "json":
            return json.dumps(session.to_dict(), ensure_ascii=False, indent=2)
        elif export_format == "txt":
            return self.generate_review_report(session)
        else:
            return None

    def batch_apply_corrections(self, sessions: List[ReviewSession],
                                 texts: Dict[str, str]) -> Dict[str, str]:
        """
        批量应用修正

        Args:
            sessions: 会话列表
            texts: 文档ID到文本的映射

        Returns:
            文档ID到修正后文本的映射
        """
        results = {}
        for session in sessions:
            doc_id = session.document_id
            if doc_id in texts:
                results[doc_id] = self.apply_corrections_to_text(texts[doc_id], session)
        return results
