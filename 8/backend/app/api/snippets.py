from fastapi import APIRouter, HTTPException, Query, Depends
from typing import List, Optional, Dict, Any
from sqlalchemy.orm import Session

from ..schemas.schemas import (
    CodeSnippetCreate,
    CodeSnippetUpdate,
    CodeSnippetResponse,
    CodeSnippetSearchResponse,
    CodeSnippetVersionResponse,
    AutoTagResult,
    SearchQuery,
    CommentCreate,
    CommentResponse,
    FavoriteCreate,
    FavoriteResponse
)
from ..services.vector_db_service import vector_db_service
from ..services.auto_tag_service import auto_tag_service
from ..services.version_service import version_service
from ..models.models import Comment, Favorite, UserHistory
from ..core.database import get_db, SessionLocal

router = APIRouter(prefix="/api/snippets", tags=["snippets"])


@router.post("", response_model=dict)
def create_snippet(
    snippet: CodeSnippetCreate,
    user_id: Optional[str] = Query("anonymous"),
    include_auto_tags: bool = Query(True)
):
    try:
        auto_tags = []
        if include_auto_tags:
            auto_tag_result = auto_tag_service.generate_auto_tags(
                code=snippet.code,
                language=snippet.language,
                title=snippet.title or '',
                description=snippet.description or '',
                existing_tags=snippet.tags
            )
            auto_tags = auto_tag_result['suggested_tags']

        all_tags = list(set(snippet.tags + auto_tags))

        result = vector_db_service.add_code_snippet(
            code=snippet.code,
            title=snippet.title,
            description=snippet.description,
            language=snippet.language,
            tags=all_tags
        )

        version_service.create_version(
            code_snippet_id=result['id'],
            code=snippet.code,
            title=snippet.title,
            description=snippet.description,
            language=snippet.language,
            tags=all_tags,
            auto_tags=auto_tags,
            change_note='Initial version',
            user_id=user_id
        )

        result['auto_tags'] = auto_tags
        result['version'] = 1
        return result
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))


@router.get("", response_model=List[dict])
def list_snippets(
    limit: int = Query(20, ge=1, le=100),
    offset: int = Query(0, ge=0)
):
    try:
        snippets = vector_db_service.get_all_snippets(limit=limit, offset=offset)
        return snippets
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))


@router.get("/{snippet_id}", response_model=dict)
def get_snippet(
    snippet_id: str,
    user_id: Optional[str] = Query("anonymous")
):
    snippet = vector_db_service.get_code_snippet(snippet_id)

    if not snippet:
        raise HTTPException(status_code=404, detail="Snippet not found")

    version_count = version_service.get_version_count(snippet_id)
    snippet['version'] = version_count

    db = SessionLocal()
    try:
        history = UserHistory(
            user_id=user_id,
            action_type="view",
            code_snippet_id=snippet_id
        )
        db.add(history)
        db.commit()
    finally:
        db.close()

    return snippet


@router.put("/{snippet_id}", response_model=dict)
def update_snippet(
    snippet_id: str,
    snippet: CodeSnippetUpdate,
    user_id: Optional[str] = Query("anonymous"),
    include_auto_tags: bool = Query(True)
):
    auto_tags = []
    if include_auto_tags:
        auto_tag_result = auto_tag_service.generate_auto_tags(
            code=snippet.code,
            language=snippet.language,
            title=snippet.title or '',
            description=snippet.description or '',
            existing_tags=snippet.tags
        )
        auto_tags = auto_tag_result['suggested_tags']

    all_tags = list(set(snippet.tags + auto_tags))

    result = vector_db_service.update_code_snippet(
        snippet_id=snippet_id,
        code=snippet.code,
        title=snippet.title,
        description=snippet.description,
        language=snippet.language,
        tags=all_tags
    )

    if not result:
        raise HTTPException(status_code=404, detail="Snippet not found")

    version_service.create_version(
        code_snippet_id=snippet_id,
        code=snippet.code,
        title=snippet.title,
        description=snippet.description,
        language=snippet.language,
        tags=all_tags,
        auto_tags=auto_tags,
        change_note=snippet.change_note or 'Updated',
        user_id=user_id
    )

    result['auto_tags'] = auto_tags
    return result


@router.delete("/{snippet_id}")
def delete_snippet(snippet_id: str):
    version_service.delete_versions(snippet_id)

    success = vector_db_service.delete_code_snippet(snippet_id)

    if not success:
        raise HTTPException(status_code=404, detail="Snippet not found")

    return {"message": "Snippet deleted successfully"}


@router.post("/search", response_model=List[CodeSnippetSearchResponse])
def search_snippets(
    query: SearchQuery,
    user_id: Optional[str] = Query("anonymous")
):
    try:
        db = SessionLocal()
        try:
            history = UserHistory(
                user_id=user_id,
                action_type="search",
                query_text=query.query
            )
            db.add(history)
            db.commit()
        finally:
            db.close()

        results = vector_db_service.search_by_query(
            query=query.query,
            top_k=query.top_k,
            language=query.language,
            tags=query.tags
        )
        return results
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))


@router.post("/preview-tags", response_model=AutoTagResult)
def preview_auto_tags(snippet: CodeSnippetCreate):
    try:
        result = auto_tag_service.generate_auto_tags(
            code=snippet.code,
            language=snippet.language,
            title=snippet.title or '',
            description=snippet.description or '',
            existing_tags=snippet.tags
        )
        return AutoTagResult(
            suggested_tags=result['suggested_tags'],
            keywords=result['keywords']
        )
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))


@router.get("/{snippet_id}/similar", response_model=List[CodeSnippetSearchResponse])
def get_similar_snippets(
    snippet_id: str,
    top_k: int = Query(5, ge=1, le=20)
):
    from ..services.recommendation_service import recommendation_service

    results = recommendation_service.get_similar_snippets(snippet_id, top_k=top_k)
    return results


@router.get("/{snippet_id}/versions", response_model=List[dict])
def get_snippet_versions(
    snippet_id: str,
    limit: int = Query(20, ge=1, le=100),
    offset: int = Query(0, ge=0)
):
    try:
        versions = version_service.get_versions(snippet_id, limit=limit, offset=offset)
        return versions
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))


@router.get("/{snippet_id}/versions/{version_number}", response_model=dict)
def get_specific_version(
    snippet_id: str,
    version_number: int
):
    version = version_service.get_version(snippet_id, version_number)

    if not version:
        raise HTTPException(status_code=404, detail="Version not found")

    return version


@router.get("/{snippet_id}/versions/compare", response_model=dict)
def compare_versions(
    snippet_id: str,
    version1: int = Query(..., ge=1),
    version2: int = Query(..., ge=1)
):
    if version1 == version2:
        raise HTTPException(status_code=400, detail="Versions must be different")

    comparison = version_service.compare_versions(snippet_id, version1, version2)

    if not comparison:
        raise HTTPException(status_code=404, detail="One or both versions not found")

    return comparison


@router.get("/{snippet_id}/comments", response_model=List[CommentResponse])
def get_comments(snippet_id: str, db: Session = Depends(get_db)):
    comments = db.query(Comment).filter(
        Comment.code_snippet_id == snippet_id
    ).order_by(Comment.created_at.desc()).all()

    return comments


@router.post("/{snippet_id}/comments", response_model=CommentResponse)
def add_comment(
    snippet_id: str,
    comment: CommentCreate,
    db: Session = Depends(get_db)
):
    db_comment = Comment(
        code_snippet_id=snippet_id,
        user_id=comment.user_id,
        content=comment.content
    )
    db.add(db_comment)
    db.commit()
    db.refresh(db_comment)

    return db_comment


@router.post("/{snippet_id}/favorite", response_model=dict)
def toggle_favorite(
    snippet_id: str,
    favorite: FavoriteCreate,
    db: Session = Depends(get_db)
):
    existing = db.query(Favorite).filter(
        Favorite.code_snippet_id == snippet_id,
        Favorite.user_id == favorite.user_id
    ).first()

    if existing:
        db.delete(existing)
        db.commit()
        return {"is_favorite": False}
    else:
        db_favorite = Favorite(
            code_snippet_id=snippet_id,
            user_id=favorite.user_id
        )
        db.add(db_favorite)
        db.commit()
        db.refresh(db_favorite)
        return {"is_favorite": True, "id": db_favorite.id}


@router.get("/{snippet_id}/is-favorite")
def check_favorite(
    snippet_id: str,
    user_id: str = Query("anonymous"),
    db: Session = Depends(get_db)
):
    existing = db.query(Favorite).filter(
        Favorite.code_snippet_id == snippet_id,
        Favorite.user_id == user_id
    ).first()

    return {"is_favorite": existing is not None}
