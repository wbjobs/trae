import logging
from typing import List, Optional, Dict, Any
from datetime import datetime
from difflib import SequenceMatcher

from ..core.database import SessionLocal
from ..models.models import CodeSnippetVersion

logger = logging.getLogger(__name__)


class VersionService:
    def create_version(
        self,
        code_snippet_id: str,
        code: str,
        title: Optional[str] = None,
        description: Optional[str] = None,
        language: str = 'python',
        tags: List[str] = None,
        auto_tags: List[str] = None,
        change_note: Optional[str] = None,
        user_id: str = 'anonymous'
    ) -> Dict[str, Any]:
        db = SessionLocal()
        try:
            latest_version = db.query(CodeSnippetVersion).filter(
                CodeSnippetVersion.code_snippet_id == code_snippet_id
            ).order_by(CodeSnippetVersion.version_number.desc()).first()

            next_version = 1
            if latest_version:
                next_version = latest_version.version_number + 1

            version = CodeSnippetVersion(
                code_snippet_id=code_snippet_id,
                version_number=next_version,
                title=title or '',
                code=code,
                language=language,
                tags=tags or [],
                description=description or '',
                auto_tags=auto_tags or [],
                change_note=change_note,
                created_by=user_id
            )

            db.add(version)
            db.commit()
            db.refresh(version)

            logger.info(f"Created version {next_version} for snippet {code_snippet_id}")

            return self._version_to_dict(version)
        except Exception as e:
            db.rollback()
            logger.error(f"Failed to create version: {e}")
            raise
        finally:
            db.close()

    def get_versions(
        self,
        code_snippet_id: str,
        limit: int = 20,
        offset: int = 0
    ) -> List[Dict[str, Any]]:
        db = SessionLocal()
        try:
            versions = db.query(CodeSnippetVersion).filter(
                CodeSnippetVersion.code_snippet_id == code_snippet_id
            ).order_by(
                CodeSnippetVersion.version_number.desc()
            ).offset(offset).limit(limit).all()

            return [self._version_to_dict(v) for v in versions]
        except Exception as e:
            logger.error(f"Failed to get versions: {e}")
            raise
        finally:
            db.close()

    def get_version(
        self,
        code_snippet_id: str,
        version_number: int
    ) -> Optional[Dict[str, Any]]:
        db = SessionLocal()
        try:
            version = db.query(CodeSnippetVersion).filter(
                CodeSnippetVersion.code_snippet_id == code_snippet_id,
                CodeSnippetVersion.version_number == version_number
            ).first()

            if version:
                return self._version_to_dict(version)
            return None
        except Exception as e:
            logger.error(f"Failed to get version: {e}")
            raise
        finally:
            db.close()

    def get_latest_version(
        self,
        code_snippet_id: str
    ) -> Optional[Dict[str, Any]]:
        db = SessionLocal()
        try:
            version = db.query(CodeSnippetVersion).filter(
                CodeSnippetVersion.code_snippet_id == code_snippet_id
            ).order_by(
                CodeSnippetVersion.version_number.desc()
            ).first()

            if version:
                return self._version_to_dict(version)
            return None
        except Exception as e:
            logger.error(f"Failed to get latest version: {e}")
            raise
        finally:
            db.close()

    def get_version_count(self, code_snippet_id: str) -> int:
        db = SessionLocal()
        try:
            count = db.query(CodeSnippetVersion).filter(
                CodeSnippetVersion.code_snippet_id == code_snippet_id
            ).count()
            return count
        except Exception as e:
            logger.error(f"Failed to get version count: {e}")
            return 0
        finally:
            db.close()

    def delete_versions(self, code_snippet_id: str) -> int:
        db = SessionLocal()
        try:
            count = db.query(CodeSnippetVersion).filter(
                CodeSnippetVersion.code_snippet_id == code_snippet_id
            ).delete()
            db.commit()
            logger.info(f"Deleted {count} versions for snippet {code_snippet_id}")
            return count
        except Exception as e:
            db.rollback()
            logger.error(f"Failed to delete versions: {e}")
            raise
        finally:
            db.close()

    def compare_versions(
        self,
        code_snippet_id: str,
        version1: int,
        version2: int
    ) -> Optional[Dict[str, Any]]:
        v1 = self.get_version(code_snippet_id, version1)
        v2 = self.get_version(code_snippet_id, version2)

        if not v1 or not v2:
            return None

        code_diff = self._diff_text(v1['code'], v2['code'])
        title_diff = self._diff_text(v1.get('title', ''), v2.get('title', ''))
        desc_diff = self._diff_text(v1.get('description', ''), v2.get('description', ''))

        tags_v1 = set(v1.get('tags', []))
        tags_v2 = set(v2.get('tags', []))
        tags_added = list(tags_v2 - tags_v1)
        tags_removed = list(tags_v1 - tags_v2)

        return {
            'version1': v1,
            'version2': v2,
            'code_diff': code_diff,
            'title_diff': title_diff,
            'description_diff': desc_diff,
            'tags_added': tags_added,
            'tags_removed': tags_removed,
            'language_changed': v1.get('language') != v2.get('language'),
        }

    def _diff_text(self, text1: str, text2: str) -> Dict[str, Any]:
        if text1 == text2:
            return {'changed': False}

        matcher = SequenceMatcher(None, text1, text2)
        similarity = matcher.ratio()

        return {
            'changed': True,
            'similarity': round(similarity, 3),
        }

    def _version_to_dict(self, version: CodeSnippetVersion) -> Dict[str, Any]:
        return {
            'id': version.id,
            'code_snippet_id': version.code_snippet_id,
            'version_number': version.version_number,
            'title': version.title,
            'code': version.code,
            'language': version.language,
            'tags': version.tags or [],
            'description': version.description,
            'auto_tags': version.auto_tags or [],
            'change_note': version.change_note,
            'created_at': version.created_at.isoformat() if version.created_at else None,
            'created_by': version.created_by
        }


version_service = VersionService()
