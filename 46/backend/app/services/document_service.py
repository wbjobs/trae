import os
import shutil
import uuid
from typing import List, Optional, Dict, Any, Tuple
from datetime import datetime
from fastapi import UploadFile
from bson import ObjectId
from ..config import settings
from ..database import get_collection
from ..parsers import ParserFactory
from ..schemas.document import (
    DocumentParseResponse,
    DocumentInfo,
    TableData,
    ImageData,
    KnowledgeGraph,
    DocumentSearchRequest,
    DocumentSearchResponse
)
from .knowledge_extractor import KnowledgeExtractorService


class DocumentService:
    def __init__(self):
        self.documents_collection = get_collection("documents")
        self.knowledge_extractor = KnowledgeExtractorService()

    async def upload_and_parse(self, file: UploadFile, extract_knowledge: bool = True) -> DocumentParseResponse:
        if file.size and file.size > settings.MAX_FILE_SIZE:
            raise ValueError(f"文件大小超过限制，最大支持 {settings.MAX_FILE_SIZE // 1024 // 1024}MB")

        ext = os.path.splitext(file.filename)[1].lower().lstrip(".")
        if ext not in settings.ALLOWED_EXTENSIONS:
            raise ValueError(f"不支持的文件类型: {ext}")

        file_id = str(uuid.uuid4())
        file_path = os.path.join(settings.UPLOAD_DIR, f"{file_id}_{file.filename}")

        try:
            with open(file_path, "wb") as buffer:
                shutil.copyfileobj(file.file, buffer)

            parser = ParserFactory.get_parser(file_path, file.filename)
            text_content, tables, images, metadata = parser.parse()

            doc_info_dict = parser.get_document_info()
            doc_info_dict.update({
                "file_type": metadata.get("file_type", ext),
                "title": metadata.get("title"),
                "author": metadata.get("author"),
                "creation_date": metadata.get("creation_date"),
                "page_count": metadata.get("page_count"),
            })
            doc_info = DocumentInfo(**doc_info_dict)

            knowledge_graph = None
            if extract_knowledge and text_content:
                knowledge_graph = self.knowledge_extractor.extract(text_content)

            document_data = {
                "document_id": doc_info.document_id,
                "filename": doc_info.filename,
                "file_type": doc_info.file_type,
                "file_size": doc_info.file_size,
                "upload_time": doc_info.upload_time,
                "title": doc_info.title,
                "author": doc_info.author,
                "creation_date": doc_info.creation_date,
                "page_count": doc_info.page_count,
                "text_content": text_content,
                "tables": [t.model_dump() for t in tables],
                "images": [img.model_dump() for img in images],
                "knowledge_graph": knowledge_graph.model_dump() if knowledge_graph else None,
                "structured_data": metadata,
                "file_path": file_path,
                "created_at": datetime.utcnow(),
                "updated_at": datetime.utcnow()
            }

            self.documents_collection.insert_one(document_data)

            return DocumentParseResponse(
                document=doc_info,
                text_content=text_content,
                tables=tables,
                images=images,
                knowledge_graph=knowledge_graph,
                structured_data=metadata
            )

        except Exception as e:
            if os.path.exists(file_path):
                os.remove(file_path)
            raise e

    def get_document(self, document_id: str) -> Optional[DocumentParseResponse]:
        doc = self.documents_collection.find_one({"document_id": document_id})
        if not doc:
            return None
        return self._mongo_to_response(doc)

    def list_documents(self, skip: int = 0, limit: int = 20) -> Tuple[List[DocumentInfo], int]:
        total = self.documents_collection.count_documents({})
        cursor = self.documents_collection.find({}, {
            "document_id": 1, "filename": 1, "file_type": 1,
            "file_size": 1, "upload_time": 1, "title": 1,
            "author": 1, "creation_date": 1, "page_count": 1
        }).sort("upload_time", -1).skip(skip).limit(limit)

        documents = []
        for doc in cursor:
            documents.append(DocumentInfo(
                document_id=doc["document_id"],
                filename=doc["filename"],
                file_type=doc["file_type"],
                file_size=doc["file_size"],
                upload_time=doc["upload_time"],
                title=doc.get("title"),
                author=doc.get("author"),
                creation_date=doc.get("creation_date"),
                page_count=doc.get("page_count")
            ))

        return documents, total

    def search_documents(self, request: DocumentSearchRequest) -> DocumentSearchResponse:
        query = {}

        if request.query:
            query["$or"] = [
                {"filename": {"$regex": request.query, "$options": "i"}},
                {"text_content": {"$regex": request.query, "$options": "i"}},
                {"title": {"$regex": request.query, "$options": "i"}}
            ]

        if request.file_type:
            query["file_type"] = request.file_type

        if request.start_date or request.end_date:
            query["upload_time"] = {}
            if request.start_date:
                query["upload_time"]["$gte"] = request.start_date
            if request.end_date:
                query["upload_time"]["$lte"] = request.end_date

        total = self.documents_collection.count_documents(query)
        cursor = self.documents_collection.find(query, {
            "document_id": 1, "filename": 1, "file_type": 1,
            "file_size": 1, "upload_time": 1, "title": 1,
            "author": 1, "creation_date": 1, "page_count": 1,
            "text_content": 1
        }).sort("upload_time", -1).skip(request.skip).limit(request.limit)

        documents = []
        highlights = {}

        for doc in cursor:
            documents.append(DocumentInfo(
                document_id=doc["document_id"],
                filename=doc["filename"],
                file_type=doc["file_type"],
                file_size=doc["file_size"],
                upload_time=doc["upload_time"],
                title=doc.get("title"),
                author=doc.get("author"),
                creation_date=doc.get("creation_date"),
                page_count=doc.get("page_count")
            ))

            if request.query and "text_content" in doc:
                content = doc["text_content"]
                idx = content.lower().find(request.query.lower())
                if idx >= 0:
                    start = max(0, idx - 50)
                    end = min(len(content), idx + 100)
                    highlights[doc["document_id"]] = content[start:end] + "..."

        return DocumentSearchResponse(
            total=total,
            documents=documents,
            highlights=highlights
        )

    def delete_document(self, document_id: str) -> bool:
        doc = self.documents_collection.find_one({"document_id": document_id})
        if not doc:
            return False

        file_path = doc.get("file_path")
        if file_path and os.path.exists(file_path):
            try:
                os.remove(file_path)
            except Exception:
                pass

        result = self.documents_collection.delete_one({"document_id": document_id})
        return result.deleted_count > 0

    def _mongo_to_response(self, doc: Dict[str, Any]) -> DocumentParseResponse:
        tables = [TableData(**t) for t in doc.get("tables", [])]
        images = [ImageData(**img) for img in doc.get("images", [])]
        knowledge_graph = None
        if doc.get("knowledge_graph"):
            knowledge_graph = KnowledgeGraph(**doc["knowledge_graph"])

        return DocumentParseResponse(
            document=DocumentInfo(
                document_id=doc["document_id"],
                filename=doc["filename"],
                file_type=doc["file_type"],
                file_size=doc["file_size"],
                upload_time=doc["upload_time"],
                title=doc.get("title"),
                author=doc.get("author"),
                creation_date=doc.get("creation_date"),
                page_count=doc.get("page_count")
            ),
            text_content=doc.get("text_content", ""),
            tables=tables,
            images=images,
            knowledge_graph=knowledge_graph,
            structured_data=doc.get("structured_data", {})
        )
