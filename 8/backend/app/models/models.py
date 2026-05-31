from sqlalchemy import Column, Integer, String, Text, DateTime, ForeignKey, JSON
from sqlalchemy.orm import relationship
from datetime import datetime

from ..core.database import Base


class Favorite(Base):
    __tablename__ = "favorites"

    id = Column(Integer, primary_key=True, index=True)
    code_snippet_id = Column(String, index=True)
    user_id = Column(String, index=True, default="anonymous")
    created_at = Column(DateTime, default=datetime.utcnow)

    comments = relationship("Comment", back_populates="favorite", cascade="all, delete-orphan")


class Comment(Base):
    __tablename__ = "comments"

    id = Column(Integer, primary_key=True, index=True)
    code_snippet_id = Column(String, index=True)
    user_id = Column(String, index=True, default="anonymous")
    content = Column(Text)
    created_at = Column(DateTime, default=datetime.utcnow)

    favorite_id = Column(Integer, ForeignKey("favorites.id"), nullable=True)
    favorite = relationship("Favorite", back_populates="comments")


class UserHistory(Base):
    __tablename__ = "user_history"

    id = Column(Integer, primary_key=True, index=True)
    user_id = Column(String, index=True, default="anonymous")
    action_type = Column(String)
    code_snippet_id = Column(String, index=True, nullable=True)
    query_text = Column(Text, nullable=True)
    created_at = Column(DateTime, default=datetime.utcnow)


class CodeSnippetVersion(Base):
    __tablename__ = "code_snippet_versions"

    id = Column(Integer, primary_key=True, index=True)
    code_snippet_id = Column(String, index=True)
    version_number = Column(Integer, default=1)
    title = Column(String, nullable=True)
    code = Column(Text)
    language = Column(String, default="python")
    tags = Column(JSON, default=list)
    description = Column(Text, nullable=True)
    auto_tags = Column(JSON, default=list)
    change_note = Column(String, nullable=True)
    created_at = Column(DateTime, default=datetime.utcnow)
    created_by = Column(String, default="anonymous")
