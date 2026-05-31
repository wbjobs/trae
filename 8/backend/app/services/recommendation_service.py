import logging
from typing import List, Optional, Dict, Any
from collections import Counter

from .vector_db_service import vector_db_service
from .embedding_service import embedding_service
from ..core.database import SessionLocal
from ..models.models import UserHistory, Favorite, Comment

logger = logging.getLogger(__name__)


class RecommendationService:
    def get_similar_snippets(
        self,
        snippet_id: str,
        top_k: int = 5
    ) -> List[Dict[str, Any]]:
        snippet = vector_db_service.get_code_snippet(snippet_id)
        if not snippet:
            return []

        embedding = embedding_service.embed_code(
            code=snippet["code"],
            title=snippet.get("title"),
            description=snippet.get("description"),
            language=snippet.get("language"),
            tags=snippet.get("tags", [])
        )

        results = vector_db_service.search_by_embedding(
            embedding=embedding,
            top_k=top_k + 1,
            exclude_ids=[snippet_id]
        )

        return results

    def _get_user_history(
        self,
        user_id: str,
        limit: int = 20
    ) -> List[Dict[str, Any]]:
        db = SessionLocal()
        try:
            histories = db.query(UserHistory).filter(
                UserHistory.user_id == user_id
            ).order_by(UserHistory.created_at.desc()).limit(limit).all()

            return [
                {
                    "id": h.id,
                    "action_type": h.action_type,
                    "code_snippet_id": h.code_snippet_id,
                    "query_text": h.query_text,
                    "created_at": h.created_at.isoformat()
                }
                for h in histories
            ]
        finally:
            db.close()

    def _get_user_favorites(self, user_id: str) -> List[str]:
        db = SessionLocal()
        try:
            favorites = db.query(Favorite).filter(
                Favorite.user_id == user_id
            ).all()
            return [f.code_snippet_id for f in favorites]
        finally:
            db.close()

    def get_personalized_recommendations(
        self,
        user_id: str,
        top_k: int = 5
    ) -> List[Dict[str, Any]]:
        history = self._get_user_history(user_id, limit=30)
        favorites = self._get_user_favorites(user_id)

        if not history and not favorites:
            return self._get_popular_snippets(top_k)

        viewed_snippets = []
        search_queries = []

        for h in history:
            if h["action_type"] == "view" and h["code_snippet_id"]:
                viewed_snippets.append(h["code_snippet_id"])
            elif h["action_type"] == "search" and h["query_text"]:
                search_queries.append(h["query_text"])

        all_relevant_snippets = list(set(viewed_snippets + favorites))

        if not all_relevant_snippets and not search_queries:
            return self._get_popular_snippets(top_k)

        recommendations = []

        for snippet_id in all_relevant_snippets[:5]:
            similar = self.get_similar_snippets(snippet_id, top_k=3)
            for s in similar:
                if s["id"] not in all_relevant_snippets:
                    s["reason"] = "基于您查看过的相似代码"
                    recommendations.append(s)

        for query in search_queries[:3]:
            results = vector_db_service.search_by_query(query, top_k=3)
            for r in results:
                if r["id"] not in all_relevant_snippets:
                    r["reason"] = f'基于您的搜索: "{query}"'
                    recommendations.append(r)

        recommendations.sort(key=lambda x: x.get("similarity", 0), reverse=True)

        seen_ids = set()
        unique_recommendations = []
        for rec in recommendations:
            if rec["id"] not in seen_ids:
                seen_ids.add(rec["id"])
                unique_recommendations.append(rec)
            if len(unique_recommendations) >= top_k:
                break

        return unique_recommendations

    def _get_popular_snippets(self, top_k: int) -> List[Dict[str, Any]]:
        snippets = vector_db_service.get_all_snippets(limit=top_k)

        db = SessionLocal()
        try:
            favorite_counts = db.query(
                Favorite.code_snippet_id
            ).all()
            count_map = Counter([f[0] for f in favorite_counts])

            for snippet in snippets:
                snippet["reason"] = "热门代码片段"
                snippet["popularity_score"] = count_map.get(snippet["id"], 0)

            snippets.sort(key=lambda x: x["popularity_score"], reverse=True)

            return snippets[:top_k]
        finally:
            db.close()


recommendation_service = RecommendationService()
