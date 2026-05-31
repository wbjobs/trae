from typing import List, Dict, Any
import hashlib
import json


class FeatureExtractor:
    def extract_features(self, pages_data: List[Dict], layout_analysis: Dict) -> Dict[str, Any]:
        features = {
            "document_hash": self._compute_document_hash(layout_analysis),
            "layout_vectors": [],
            "structure_features": self._extract_structure_features(layout_analysis),
            "semantic_features": self._extract_semantic_features(layout_analysis)
        }
        
        for page_idx, page in enumerate(pages_data):
            page_vector = self._extract_page_layout_features(page, layout_analysis, page_idx)
            features["layout_vectors"].append(page_vector)
        
        return features

    def _compute_document_hash(self, layout_analysis: Dict) -> str:
        text = layout_analysis.get("full_text", "")
        return hashlib.md5(text.encode('utf-8')).hexdigest()

    def _extract_page_layout_features(self, page_data: Dict, layout_analysis: Dict, page_idx: int) -> Dict[str, Any]:
        headings = [h for h in layout_analysis.get("headings", []) if h.get("page") == page_idx + 1]
        paragraphs = layout_analysis.get("paragraphs", [])
        tables = [t for t in layout_analysis.get("tables", []) if t.get("page") == page_idx + 1]
        lists = layout_analysis.get("lists", [])
        
        return {
            "page_number": page_idx + 1,
            "element_counts": {
                "headings": len(headings),
                "paragraphs": len(paragraphs),
                "tables": len(tables),
                "lists": len(lists)
            },
            "heading_levels": [h.get("level", 0) for h in headings],
            "has_tables": len(tables) > 0,
            "has_lists": len(lists) > 0,
            "bbox_density": self._calculate_bbox_density(layout_analysis, page_idx + 1),
            "vector_embedding": self._generate_vector_embedding(page_idx, layout_analysis)
        }

    def _extract_structure_features(self, layout_analysis: Dict) -> Dict[str, Any]:
        headings = layout_analysis.get("headings", [])
        lists = layout_analysis.get("lists", [])
        tables = layout_analysis.get("tables", [])
        
        return {
            "heading_hierarchy": self._analyze_heading_hierarchy(headings),
            "list_structures": self._analyze_list_structures(lists),
            "table_count": len(tables),
            "reading_order": self._determine_reading_order(layout_analysis)
        }

    def _extract_semantic_features(self, layout_analysis: Dict) -> Dict[str, Any]:
        full_text = layout_analysis.get("full_text", "")
        
        contract_keywords = ["合同", "协议", "甲方", "乙方", "金额", "日期", "违约", "期限"]
        found_keywords = [kw for kw in contract_keywords if kw in full_text]
        
        return {
            "contract_keywords": found_keywords,
            "keyword_count": len(found_keywords),
            "document_type": "contract" if "合同" in found_keywords or "协议" in found_keywords else "unknown",
            "key_sections": self._identify_key_sections(layout_analysis)
        }

    def _analyze_heading_hierarchy(self, headings: List[Dict]) -> Dict[str, Any]:
        if not headings:
            return {"has_hierarchy": False, "levels": []}
        
        levels = sorted(list(set([h.get("level", 1) for h in headings])))
        
        return {
            "has_hierarchy": True,
            "levels": levels,
            "max_level": max(levels) if levels else 1,
            "total_headings": len(headings)
        }

    def _analyze_list_structures(self, lists: List[Dict]) -> List[Dict[str, Any]]:
        structures = []
        for lst in lists:
            structures.append({
                "type": lst.get("type", "unknown"),
                "item_count": len(lst.get("items", [])),
                "has_nesting": any(item.get("level", 1) > 1 for item in lst.get("items", []))
            })
        return structures

    def _determine_reading_order(self, layout_analysis: Dict) -> List[Dict]:
        elements = []
        
        for heading in layout_analysis.get("headings", []):
            elements.append({
                "type": "heading",
                "text": heading.get("text", ""),
                "bbox": heading.get("bbox", []),
                "level": heading.get("level", 1)
            })
        
        for para in layout_analysis.get("paragraphs", []):
            elements.append({
                "type": "paragraph",
                "text": para.get("text", ""),
                "bbox": para.get("bbox", [])
            })
        
        elements.sort(key=lambda x: (x.get("bbox", [0, 9999, 0, 0])[1], x.get("bbox", [0, 0, 0, 0])[0]))
        
        return elements

    def _identify_key_sections(self, layout_analysis: Dict) -> List[Dict]:
        sections = []
        headings = layout_analysis.get("headings", [])
        
        keywords_mapping = {
            "金额": "amount",
            "金额条款": "amount",
            "期限": "duration",
            "合同期限": "duration",
            "违约": "liability",
            "违约责任": "liability",
            "付款": "payment",
            "付款方式": "payment"
        }
        
        for heading in headings:
            text = heading.get("text", "")
            for keyword, section_type in keywords_mapping.items():
                if keyword in text:
                    sections.append({
                        "type": section_type,
                        "heading": text,
                        "bbox": heading.get("bbox", [])
                    })
                    break
        
        return sections

    def _calculate_bbox_density(self, layout_analysis: Dict, page: int) -> float:
        all_bboxes = []
        
        for heading in layout_analysis.get("headings", []):
            if heading.get("page") == page:
                all_bboxes.append(heading.get("bbox", []))
        
        for para in layout_analysis.get("paragraphs", []):
            all_bboxes.append(para.get("bbox", []))
        
        if not all_bboxes:
            return 0.0
        
        total_area = 0
        for bbox in all_bboxes:
            if len(bbox) >= 4:
                width = bbox[2] - bbox[0]
                height = bbox[3] - bbox[1]
                total_area += width * height
        
        return round(total_area / 1000000, 4)

    def _generate_vector_embedding(self, page_idx: int, layout_analysis: Dict) -> List[float]:
        headings = layout_analysis.get("headings", [])
        paragraphs = layout_analysis.get("paragraphs", [])
        lists = layout_analysis.get("lists", [])
        tables = layout_analysis.get("tables", [])
        
        import hashlib
        
        text_signature = layout_analysis.get("full_text", "")[:100]
        seed = int(hashlib.md5((text_signature + str(page_idx)).encode()).hexdigest(), 16) % 10000
        
        vector = [
            len(headings) * 0.1 + (seed % 10) * 0.01,
            len(paragraphs) * 0.05 + (seed % 5) * 0.02,
            len(lists) * 0.15,
            len(tables) * 0.2,
            (seed % 100) / 100,
            ((seed * 3) % 100) / 100,
            ((seed * 7) % 100) / 100,
            ((seed * 11) % 100) / 100,
            ((seed * 13) % 100) / 100,
            ((seed * 17) % 100) / 100
        ]
        
        return vector
