from fastapi import APIRouter, UploadFile, File, HTTPException, Query, Form
from typing import Dict, Any, List, Optional
import json

from ..services.vector_db_service import vector_db_service
from ..services.batch_import_service import batch_import_service
from ..schemas.schemas import MaintenanceResponse

router = APIRouter(prefix="/api/maintenance", tags=["maintenance"])


@router.get("/stats", response_model=Dict[str, Any])
def get_stats():
    stats = vector_db_service.get_collection_stats()
    return stats


@router.post("/rebuild-index", response_model=MaintenanceResponse)
def rebuild_index():
    try:
        success, count = vector_db_service.rebuild_index()
        if success:
            return MaintenanceResponse(
                success=True,
                message=f"Index rebuilt successfully with {count} snippets",
                details={"count": count}
            )
        else:
            raise HTTPException(status_code=500, detail="Failed to rebuild index")
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))


@router.get("/export", response_model=Dict[str, Any])
def export_data():
    try:
        return vector_db_service.export_data()
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))


@router.post("/import", response_model=MaintenanceResponse)
async def import_data(file: UploadFile = File(...)):
    try:
        content = await file.read()
        data = json.loads(content)

        if not isinstance(data, dict) or "snippets" not in data:
            raise HTTPException(
                status_code=400,
                detail="Invalid file format. Expected JSON with 'snippets' array"
            )

        success, count = vector_db_service.import_data(data)

        if success:
            return MaintenanceResponse(
                success=True,
                message=f"Successfully imported {count} snippets",
                details={"imported_count": count, "total_in_file": len(data.get("snippets", []))}
            )
        else:
            raise HTTPException(status_code=500, detail="Failed to import data")

    except json.JSONDecodeError:
        raise HTTPException(status_code=400, detail="Invalid JSON format")
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))


@router.post("/import-batch", response_model=Dict[str, Any])
async def import_batch(
    file: UploadFile = File(...),
    include_auto_tags: bool = Query(True, description="Include auto-generated tags"),
    indices: Optional[List[int]] = Query(None, description="Specific indices to import")
):
    try:
        content = await file.read()
        filename = file.filename or ''

        snippets: list = []
        errors: list = []
        source_type = ''

        if filename.lower().endswith('.json'):
            snippets, errors = batch_import_service.process_json_archive(content)
            source_type = 'JSON'
        elif filename.lower().endswith(('.zip', '.tar', '.tar.gz', '.tgz', '.tar.bz2', '.tar.xz')):
            snippets, errors = batch_import_service.process_archive(content, filename)
            source_type = 'Archive'
        else:
            raise HTTPException(
                status_code=400,
                detail="Unsupported file format. Supported: .json, .zip, .tar, .tar.gz, .tgz, .tar.bz2, .tar.xz"
            )

        if not snippets:
            return {
                "success": False,
                "message": "No valid code snippets found in file",
                "imported_count": 0,
                "skipped_count": 0,
                "failed_count": 0,
                "errors": errors[:10]
            }

        if indices is not None:
            selected_snippets = [snippets[i] for i in indices if 0 <= i < len(snippets)]
            skipped_count = len(snippets) - len(selected_snippets)
        else:
            selected_snippets = snippets
            skipped_count = 0

        import_result = batch_import_service.import_snippets(
            selected_snippets,
            include_auto_tags=include_auto_tags
        )

        return {
            "success": import_result["imported_count"] > 0,
            "message": f"Import completed: {import_result['imported_count']} imported, {skipped_count} skipped, {import_result['failed_count']} failed",
            "imported_count": import_result["imported_count"],
            "skipped_count": skipped_count,
            "failed_count": import_result["failed_count"],
            "errors": errors[:10] + import_result["errors"][:10]
        }

    except HTTPException:
        raise
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))


@router.post("/preview-batch", response_model=Dict[str, Any])
async def preview_batch(file: UploadFile = File(...)):
    try:
        content = await file.read()
        filename = file.filename or ''

        snippets: list = []
        errors: list = []
        source_type = ''

        if filename.lower().endswith('.json'):
            snippets, errors = batch_import_service.process_json_archive(content)
            source_type = 'JSON'
        elif filename.lower().endswith(('.zip', '.tar', '.tar.gz', '.tgz', '.tar.bz2', '.tar.xz')):
            snippets, errors = batch_import_service.process_archive(content, filename)
            source_type = 'Archive'
        else:
            raise HTTPException(
                status_code=400,
                detail="Unsupported file format. Supported: .json, .zip, .tar, .tar.gz, .tgz, .tar.bz2, .tar.xz"
            )

        items = []
        for snippet in snippets:
            code = snippet.get('code', '')
            line_count = code.count('\n') + 1 if code else 0
            
            items.append({
                "file_name": snippet.get('source_file', 'unnamed'),
                "success": True,
                "title": snippet.get('title'),
                "language": snippet.get('language'),
                "description": snippet.get('description'),
                "code_preview": code[:300] if code else None,
                "auto_tags": snippet.get('auto_tags', []),
                "tags": snippet.get('tags', []),
                "line_count": line_count
            })

        error_items = []
        for err in errors[:10]:
            error_items.append({
                "file_name": f"error_{len(error_items) + 1}",
                "success": False,
                "error": err
            })

        valid_count = len(items)
        error_count = len(error_items)
        all_items = items + error_items

        preview_items = []
        for snippet in snippets[:10]:
            preview_items.append({
                "title": snippet.get("title"),
                "language": snippet.get("language"),
                "description": snippet.get("description")[:200] if snippet.get("description") else None,
                "code_preview": snippet.get("code")[:300] if snippet.get("code") else None,
                "auto_tags": snippet.get("auto_tags", []),
                "tags": snippet.get("tags", []),
                "source_file": snippet.get("source_file")
            })

        return {
            "success": True,
            "source_type": source_type,
            "total_found": len(snippets),
            "valid_count": valid_count,
            "error_count": error_count,
            "items": all_items,
            "preview": preview_items,
            "errors": errors[:10]
        }

    except HTTPException:
        raise
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))
