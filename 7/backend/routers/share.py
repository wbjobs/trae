from fastapi import APIRouter, Depends, HTTPException, Request
from sqlalchemy.ext.asyncio import AsyncSession
from typing import List, Optional
from database import get_db
from services.share_link_service import ShareLinkService
from schemas import (
    ShareLinkCreate,
    ShareLinkUpdate,
    ShareLinkResponse,
    ShareAccessRequest,
    ShareAccessResponse
)
from datetime import datetime

router = APIRouter(prefix="/share", tags=["share"])

@router.post("", response_model=ShareLinkResponse)
async def create_share_link(
    share_data: ShareLinkCreate,
    request: Request,
    db: AsyncSession = Depends(get_db)
):
    service = ShareLinkService(db)
    share_link = await service.create_share_link(
        datasource_id=share_data.datasource_id,
        config=share_data.config,
        expires_at=share_data.expires_at,
        password=share_data.password
    )
    
    base_url = str(request.base_url).rstrip('/')
    return service.share_link_to_response(share_link, base_url)

@router.get("", response_model=List[ShareLinkResponse])
async def list_share_links(
    request: Request,
    db: AsyncSession = Depends(get_db)
):
    service = ShareLinkService(db)
    share_links = await service.get_all_share_links()
    
    base_url = str(request.base_url).rstrip('/')
    return [service.share_link_to_response(link, base_url) for link in share_links]

@router.get("/{token}")
async def get_share_link_by_token(
    token: str,
    request: Request,
    db: AsyncSession = Depends(get_db)
):
    service = ShareLinkService(db)
    share_link = await service.get_share_link_by_token(token)
    
    if not share_link:
        raise HTTPException(status_code=404, detail="Share link not found")
    
    base_url = str(request.base_url).rstrip('/')
    return service.share_link_to_response(share_link, base_url)

@router.post("/access", response_model=ShareAccessResponse)
async def access_share_link(
    access_request: ShareAccessRequest,
    db: AsyncSession = Depends(get_db)
):
    service = ShareLinkService(db)
    result = await service.validate_and_access(
        token=access_request.token,
        password=access_request.password
    )
    
    return result

@router.put("/{id}", response_model=ShareLinkResponse)
async def update_share_link(
    id: int,
    update_data: ShareLinkUpdate,
    request: Request,
    db: AsyncSession = Depends(get_db)
):
    service = ShareLinkService(db)
    share_link = await service.update_share_link(
        id=id,
        is_active=update_data.is_active,
        expires_at=update_data.expires_at
    )
    
    if not share_link:
        raise HTTPException(status_code=404, detail="Share link not found")
    
    base_url = str(request.base_url).rstrip('/')
    return service.share_link_to_response(share_link, base_url)

@router.delete("/{id}")
async def delete_share_link(
    id: int,
    db: AsyncSession = Depends(get_db)
):
    service = ShareLinkService(db)
    success = await service.delete_share_link(id)
    
    if not success:
        raise HTTPException(status_code=404, detail="Share link not found")
    
    return {"success": True}
