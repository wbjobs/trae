import time
from typing import List, Dict, Any
from fastapi import APIRouter, HTTPException
from ..schemas.document import QARequest, QAResponse
from ..services.qa_service import QAService

router = APIRouter(prefix="/qa", tags=["文档问答"])
qa_service = QAService()


@router.post("/ask", response_model=QAResponse)
async def ask_question(request: QARequest):
    start_time = time.time()
    try:
        response = qa_service.answer_question(request)
        response.response_time = time.time() - start_time

        try:
            qa_service.save_qa_history(request.document_id, request.question, response)
        except Exception:
            pass

        return response
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"问答失败: {str(e)}")


@router.get("/history/{document_id}", response_model=List[Dict[str, Any]])
async def get_qa_history(document_id: str, limit: int = 10):
    try:
        return qa_service.get_qa_history(document_id, limit)
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"获取历史记录失败: {str(e)}")
