from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy import select, update
from sqlalchemy.orm import selectinload
from typing import Optional, List, Dict, Any
from models import ShareLink
from datetime import datetime, timedelta
import uuid
import hashlib

class ShareLinkService:
    def __init__(self, db: AsyncSession):
        self.db = db
    
    def _hash_password(self, password: str) -> str:
        return hashlib.sha256(password.encode('utf-8')).hexdigest()
    
    def _generate_token(self) -> str:
        return uuid.uuid4().hex
    
    async def create_share_link(
        self,
        datasource_id: int,
        config: Dict[str, Any],
        expires_at: Optional[datetime] = None,
        password: Optional[str] = None,
        created_by: str = "anonymous"
    ) -> ShareLink:
        token = self._generate_token()
        
        password_hash = None
        if password:
            password_hash = self._hash_password(password)
        
        share_link = ShareLink(
            token=token,
            datasource_id=datasource_id,
            config=config,
            expires_at=expires_at,
            password_hash=password_hash,
            created_by=created_by,
            is_active=True,
            view_count=0
        )
        
        self.db.add(share_link)
        await self.db.commit()
        await self.db.refresh(share_link)
        
        return share_link
    
    async def get_share_link_by_token(self, token: str) -> Optional[ShareLink]:
        result = await self.db.execute(
            select(ShareLink).options(selectinload(ShareLink.datasource)).where(ShareLink.token == token)
        )
        return result.scalar_one_or_none()
    
    async def get_share_link_by_id(self, id: int) -> Optional[ShareLink]:
        result = await self.db.execute(
            select(ShareLink).options(selectinload(ShareLink.datasource)).where(ShareLink.id == id)
        )
        return result.scalar_one_or_none()
    
    async def get_all_share_links(self) -> List[ShareLink]:
        result = await self.db.execute(
            select(ShareLink).options(selectinload(ShareLink.datasource)).order_by(ShareLink.created_at.desc())
        )
        return result.scalars().all()
    
    async def validate_and_access(
        self,
        token: str,
        password: Optional[str] = None
    ) -> Dict[str, Any]:
        share_link = await self.get_share_link_by_token(token)
        
        if not share_link:
            return {
                "success": False,
                "message": "分享链接不存在或已失效"
            }
        
        if not share_link.is_active:
            return {
                "success": False,
                "message": "分享链接已被禁用"
            }
        
        if share_link.expires_at and datetime.utcnow() > share_link.expires_at:
            return {
                "success": False,
                "message": "分享链接已过期"
            }
        
        if share_link.password_hash:
            if not password:
                return {
                    "success": False,
                    "message": "需要密码才能访问",
                    "require_password": True
                }
            
            if self._hash_password(password) != share_link.password_hash:
                return {
                    "success": False,
                    "message": "密码错误"
                }
        
        await self.db.execute(
            update(ShareLink)
            .where(ShareLink.id == share_link.id)
            .values(
                view_count=ShareLink.view_count + 1,
                last_accessed_at=datetime.utcnow()
            )
        )
        await self.db.commit()
        
        return {
            "success": True,
            "datasource_id": share_link.datasource_id,
            "config": share_link.config
        }
    
    async def update_share_link(
        self,
        id: int,
        is_active: Optional[bool] = None,
        expires_at: Optional[datetime] = None
    ) -> Optional[ShareLink]:
        share_link = await self.get_share_link_by_id(id)
        if not share_link:
            return None
        
        if is_active is not None:
            share_link.is_active = is_active
        if expires_at is not None:
            share_link.expires_at = expires_at
        
        share_link.updated_at = datetime.utcnow()
        
        await self.db.commit()
        await self.db.refresh(share_link)
        
        return share_link
    
    async def delete_share_link(self, id: int) -> bool:
        share_link = await self.get_share_link_by_id(id)
        if not share_link:
            return False
        
        await self.db.delete(share_link)
        await self.db.commit()
        
        return True
    
    def share_link_to_response(self, share_link: ShareLink, base_url: str = "") -> Dict[str, Any]:
        return {
            "id": share_link.id,
            "token": share_link.token,
            "datasource_id": share_link.datasource_id,
            "config": share_link.config,
            "expires_at": share_link.expires_at,
            "is_active": share_link.is_active,
            "view_count": share_link.view_count,
            "has_password": share_link.password_hash is not None,
            "created_by": share_link.created_by,
            "created_at": share_link.created_at,
            "last_accessed_at": share_link.last_accessed_at,
            "share_url": f"{base_url}/share/{share_link.token}" if base_url else None
        }
