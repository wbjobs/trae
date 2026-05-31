import uuid
from typing import List, Dict, Optional, Set, Tuple
from collections import deque
from ..database import get_collection
from ..schemas.document import (
    Entity,
    Relation,
    KnowledgeGraph,
    GraphSearchRequest,
    GraphSearchResponse
)


class GraphService:
    def __init__(self):
        self.entities_collection = get_collection("entities")
        self.relations_collection = get_collection("relations")

    def save_graph(self, document_id: str, graph: KnowledgeGraph):
        for entity in graph.entities:
            entity_doc = {
                "entity_id": entity.entity_id,
                "document_id": document_id,
                "name": entity.name,
                "type": entity.type,
                "description": entity.description,
                "attributes": entity.attributes
            }
            self.entities_collection.update_one(
                {"entity_id": entity.entity_id},
                {"$set": entity_doc},
                upsert=True
            )

        for relation in graph.relations:
            relation_doc = {
                "relation_id": relation.relation_id,
                "document_id": document_id,
                "source_id": relation.source_id,
                "target_id": relation.target_id,
                "type": relation.type,
                "description": relation.description
            }
            self.relations_collection.update_one(
                {"relation_id": relation.relation_id},
                {"$set": relation_doc},
                upsert=True
            )

    def get_document_graph(self, document_id: str) -> KnowledgeGraph:
        entities_cursor = self.entities_collection.find({"document_id": document_id})
        entities = []
        entity_map: Dict[str, Entity] = {}

        for doc in entities_cursor:
            entity = Entity(
                entity_id=doc["entity_id"],
                name=doc["name"],
                type=doc["type"],
                description=doc.get("description"),
                attributes=doc.get("attributes", {})
            )
            entities.append(entity)
            entity_map[entity.entity_id] = entity

        relations = []
        relations_cursor = self.relations_collection.find({"document_id": document_id})
        for doc in relations_cursor:
            relation = Relation(
                relation_id=doc["relation_id"],
                source_id=doc["source_id"],
                target_id=doc["target_id"],
                type=doc["type"],
                description=doc.get("description")
            )
            relations.append(relation)

        return KnowledgeGraph(entities=entities, relations=relations)

    def search_graph(self, request: GraphSearchRequest) -> GraphSearchResponse:
        query_entities: List[Entity] = []
        entity_query = {}

        if request.query:
            entity_query["$or"] = [
                {"name": {"$regex": request.query, "$options": "i"}},
                {"description": {"$regex": request.query, "$options": "i"}}
            ]

        if request.entity_types:
            entity_query["type"] = {"$in": request.entity_types}

        entities_cursor = self.entities_collection.find(entity_query).limit(request.limit)
        for doc in entities_cursor:
            entity = Entity(
                entity_id=doc["entity_id"],
                name=doc["name"],
                type=doc["type"],
                description=doc.get("description"),
                attributes=doc.get("attributes", {})
            )
            query_entities.append(entity)

        all_entities: Dict[str, Entity] = {e.entity_id: e for e in query_entities}
        all_relations: Dict[str, Relation] = {}
        paths: List[List[str]] = []

        if request.max_depth > 0 and query_entities:
            for start_entity in query_entities:
                visited, found_entities, found_relations, found_paths = self._bfs(
                    start_entity.entity_id,
                    request.max_depth,
                    request.relation_types
                )
                for e in found_entities:
                    if e.entity_id not in all_entities:
                        all_entities[e.entity_id] = e
                for r in found_relations:
                    if r.relation_id not in all_relations:
                        all_relations[r.relation_id] = r
                paths.extend(found_paths)

        return GraphSearchResponse(
            entities=list(all_entities.values()),
            relations=list(all_relations.values()),
            paths=paths
        )

    def _bfs(
        self,
        start_id: str,
        max_depth: int,
        relation_types: Optional[List[str]]
    ) -> Tuple[Set[str], List[Entity], List[Relation], List[List[str]]]:
        visited = {start_id}
        queue = deque([(start_id, 0, [start_id])])
        found_entities: List[Entity] = []
        found_relations: List[Relation] = []
        paths: List[List[str]] = []

        while queue:
            current_id, depth, path = queue.popleft()

            if depth >= max_depth:
                continue

            rel_query = {
                "$or": [
                    {"source_id": current_id},
                    {"target_id": current_id}
                ]
            }
            if relation_types:
                rel_query["type"] = {"$in": relation_types}

            relations_cursor = self.relations_collection.find(rel_query)

            for rel_doc in relations_cursor:
                relation = Relation(
                    relation_id=rel_doc["relation_id"],
                    source_id=rel_doc["source_id"],
                    target_id=rel_doc["target_id"],
                    type=rel_doc["type"],
                    description=rel_doc.get("description")
                )
                found_relations.append(relation)

                next_id = relation.target_id if relation.source_id == current_id else relation.source_id

                if next_id not in visited:
                    visited.add(next_id)
                    new_path = path + [next_id]
                    paths.append(new_path)

                    entity_doc = self.entities_collection.find_one({"entity_id": next_id})
                    if entity_doc:
                        entity = Entity(
                            entity_id=entity_doc["entity_id"],
                            name=entity_doc["name"],
                            type=entity_doc["type"],
                            description=entity_doc.get("description"),
                            attributes=entity_doc.get("attributes", {})
                        )
                        found_entities.append(entity)
                        queue.append((next_id, depth + 1, new_path))

        return visited, found_entities, found_relations, paths

    def delete_document_graph(self, document_id: str) -> bool:
        entities_result = self.entities_collection.delete_many({"document_id": document_id})
        relations_result = self.relations_collection.delete_many({"document_id": document_id})
        return entities_result.deleted_count > 0 or relations_result.deleted_count > 0

    def get_all_entity_types(self) -> List[str]:
        types = self.entities_collection.distinct("type")
        return [t for t in types if t]

    def get_all_relation_types(self) -> List[str]:
        types = self.relations_collection.distinct("type")
        return [t for t in types if t]
