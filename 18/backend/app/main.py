import os
import base64
import io
from pathlib import Path
from typing import List, Dict, Any, Optional
from fastapi import FastAPI, UploadFile, File, HTTPException
from fastapi.middleware.cors import CORSMiddleware
from pydantic import BaseModel
from dotenv import load_dotenv

from .document_processor import DocumentProcessor
from .layout_analyzer import LayoutAnalyzer
from .llm_validator import LLMValidator
from .feature_extractor import FeatureExtractor

load_dotenv()

app = FastAPI(title="Contract Analysis Agent", version="1.0.0")

app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

document_processor = DocumentProcessor()
layout_analyzer = LayoutAnalyzer()
feature_extractor = FeatureExtractor()
llm_validator = LLMValidator()


class ValidationRule(BaseModel):
    rule: str
    description: Optional[str] = None


class AnalysisRequest(BaseModel):
    file_content: str
    file_type: str
    rules: List[ValidationRule]


@app.post("/api/analyze")
async def analyze_contract(file: UploadFile = File(...)):
    try:
        contents = await file.read()
        
        document_result = document_processor.process_document(contents, file.filename)
        
        layout_analysis = layout_analyzer.analyze_layout(document_result["page_data"])
        
        layout_features = feature_extractor.extract_features(document_result["page_data"], layout_analysis)
        
        extracted_data = document_processor.extract_key_fields(document_result["page_data"], layout_analysis)
        
        validation_results = llm_validator.validate(extracted_data)
        
        encoded_pages = []
        for page_data in document_result["page_data"]:
            buffered = io.BytesIO()
            page_data["image"].save(buffered, format="PNG")
            img_str = base64.b64encode(buffered.getvalue()).decode("utf-8")
            encoded_pages.append(img_str)
        
        return {
            "pages": encoded_pages,
            "document_structure": layout_analysis,
            "layout_features": layout_features,
            "extracted_fields": extracted_data,
            "validation_results": validation_results,
            "reasoning_chains": llm_validator.get_reasoning_chains(),
            "highlight_regions": llm_validator.get_highlight_regions()
        }
        
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))


@app.post("/api/analyze-with-custom-rules")
async def analyze_with_custom_rules(request: AnalysisRequest):
    try:
        file_bytes = base64.b64decode(request.file_content)
        
        document_result = document_processor.process_document(file_bytes, f"document.{request.file_type}")
        
        layout_analysis = layout_analyzer.analyze_layout(document_result["page_data"])
        
        layout_features = feature_extractor.extract_features(document_result["page_data"], layout_analysis)
        
        extracted_data = document_processor.extract_key_fields(document_result["page_data"], layout_analysis)
        
        custom_rules = [rule.rule for rule in request.rules]
        validation_results = llm_validator.validate(extracted_data, custom_rules)
        
        encoded_pages = []
        for page_data in document_result["page_data"]:
            buffered = io.BytesIO()
            page_data["image"].save(buffered, format="PNG")
            img_str = base64.b64encode(buffered.getvalue()).decode("utf-8")
            encoded_pages.append(img_str)
        
        return {
            "pages": encoded_pages,
            "document_structure": layout_analysis,
            "layout_features": layout_features,
            "extracted_fields": extracted_data,
            "validation_results": validation_results,
            "reasoning_chains": llm_validator.get_reasoning_chains(),
            "highlight_regions": llm_validator.get_highlight_regions()
        }
        
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))


@app.get("/api/health")
async def health_check():
    return {"status": "healthy"}
