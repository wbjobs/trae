from fastapi import APIRouter, Query, Depends
from typing import List, Optional
from sqlalchemy.orm import Session

from ..schemas.schemas import (
    FavoriteResponse,
    UserHistoryResponse,
    CodeSnippetSearchResponse
)
from ..models.models import Favorite, Comment, UserHistory
from ..services.vector_db_service import vector_db_service
from ..services.recommendation_service import recommendation_service
from ..core.database import get_db

router = APIRouter(prefix="/api/users", tags=["users"])


@router.get("/{user_id}/favorites", response_model=List[dict])
def get_user_favorites(
    user_id: str,
    db: Session = Depends(get_db)
):
    favorites = db.query(Favorite).filter(
        Favorite.user_id == user_id
    ).order_by(Favorite.created_at.desc()).all()

    result = []
    for fav in favorites:
        snippet = vector_db_service.get_code_snippet(fav.code_snippet_id)
        if snippet:
            result.append({
                "id": fav.id,
                "code_snippet_id": fav.code_snippet_id,
                "user_id": fav.user_id,
                "created_at": fav.created_at,
                "snippet_data": snippet
            })

    return result


@router.get("/{user_id}/history", response_model=List[UserHistoryResponse])
def get_user_history(
    user_id: str,
    limit: int = Query(20, ge=1, le=100),
    db: Session = Depends(get_db)
):
    histories = db.query(UserHistory).filter(
        UserHistory.user_id == user_id
    ).order_by(UserHistory.created_at.desc()).limit(limit).all()

    return histories


@router.get("/{user_id}/recommendations", response_model=List[dict])
def get_personalized_recommendations(
    user_id: str,
    top_k: int = Query(5, ge=1, le=20)
):
    recommendations = recommendation_service.get_personalized_recommendations(
        user_id=user_id,
        top_k=top_k
    )
    return recommendations
