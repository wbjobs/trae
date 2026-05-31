import networkx as nx
import numpy as np
from typing import Dict, List, Tuple, Optional, Set
from collections import defaultdict, deque
from dataclasses import dataclass


@dataclass
class AnomalousSubgraph:
    nodes: List[int]
    edges: List[Tuple[int, int]]
    anomaly_score: float
    size: int
    density: float
    dominant_anomaly_type: str
    anomaly_distribution: Dict[str, int]


class TopKSubgraphMiner:
    def __init__(self, k: int = 5):
        self.k = k

    def build_graph(
        self,
        warehouse_coords: Dict[int, Tuple[float, float]],
        orders: List[Dict],
        anomaly_scores: Dict[int, float],
    ) -> nx.DiGraph:
        G = nx.DiGraph()
        
        for wh_id, (lat, lon) in warehouse_coords.items():
            G.add_node(
                wh_id,
                latitude=lat,
                longitude=lon,
                anomaly_score=0.0,
                order_count=0,
            )
        
        order_counts = defaultdict(int)
        node_anomalies = defaultdict(float)
        
        for order in orders:
            origin_id = order["origin_warehouse_id"]
            dest_id = order["destination_warehouse_id"]
            order_id = order["id"]
            score = anomaly_scores.get(order_id, 0.0)
            
            if origin_id in G.nodes and dest_id in G.nodes:
                if G.has_edge(origin_id, dest_id):
                    G[origin_id][dest_id]["order_count"] += 1
                    G[origin_id][dest_id]["total_anomaly"] += score
                    G[origin_id][dest_id]["orders"].append({
                        "id": order_id,
                        "score": score,
                    })
                else:
                    G.add_edge(
                        origin_id,
                        dest_id,
                        order_count=1,
                        total_anomaly=score,
                        orders=[{"id": order_id, "score": score}],
                    )
                
                order_counts[origin_id] += 1
                order_counts[dest_id] += 1
                node_anomalies[origin_id] += score
                node_anomalies[dest_id] += score
        
        for node_id in G.nodes:
            if order_counts[node_id] > 0:
                G.nodes[node_id]["order_count"] = order_counts[node_id]
                G.nodes[node_id]["anomaly_score"] = node_anomalies[node_id] / order_counts[node_id]
            else:
                G.nodes[node_id]["anomaly_score"] = 0.0
        
        for u, v in G.edges:
            edge_data = G[u][v]
            edge_data["avg_anomaly"] = (
                edge_data["total_anomaly"] / edge_data["order_count"]
            )
            edge_data["anomaly_density"] = (
                edge_data["avg_anomaly"] * np.log1p(edge_data["order_count"])
            )
        
        return G

    def find_hotspot_subgraphs(
        self,
        G: nx.DiGraph,
        min_size: int = 2,
        max_size: int = 20,
    ) -> List[AnomalousSubgraph]:
        subgraphs = []
        
        edges_with_scores = [
            (u, v, G[u][v].get("anomaly_density", 0))
            for u, v in G.edges
        ]
        edges_with_scores.sort(key=lambda x: x[2], reverse=True)
        
        high_score_edges = edges_with_scores[: min(50, len(edges_with_scores))]
        
        for u, v, score in high_score_edges:
            subgraph_nodes = set([u, v])
            subgraph_edges = set([(u, v)])
            
            expanded = True
            while expanded and len(subgraph_nodes) < max_size:
                expanded = False
                candidates = []
                
                for node in list(subgraph_nodes):
                    for neighbor in G.neighbors(node):
                        if neighbor not in subgraph_nodes:
                            candidates.append((node, neighbor))
                    for neighbor in G.predecessors(node):
                        if neighbor not in subgraph_nodes:
                            candidates.append((neighbor, node))
                
                for src, tgt in candidates:
                    if src in subgraph_nodes or tgt in subgraph_nodes:
                        edge_score = G[src][tgt].get("anomaly_density", 0)
                        if edge_score > 0.1:
                            subgraph_nodes.add(src)
                            subgraph_nodes.add(tgt)
                            subgraph_edges.add((src, tgt))
                            expanded = True
            
            if len(subgraph_nodes) >= min_size:
                subgraph = self._analyze_subgraph(
                    G,
                    subgraph_nodes,
                    subgraph_edges,
                )
                if subgraph is not None:
                    subgraphs.append(subgraph)
        
        unique_subgraphs = self._deduplicate_subgraphs(subgraphs)
        unique_subgraphs.sort(key=lambda x: x.anomaly_score, reverse=True)
        
        return unique_subgraphs[: self.k]

    def _analyze_subgraph(
        self,
        G: nx.DiGraph,
        nodes: Set[int],
        edges: Set[Tuple[int, int]],
    ) -> Optional[AnomalousSubgraph]:
        if len(nodes) == 0:
            return None
        
        node_scores = [
            G.nodes[n].get("anomaly_score", 0)
            for n in nodes
        ]
        edge_scores = [
            G[u][v].get("anomaly_density", 0)
            for u, v in edges
        ]
        
        total_anomaly = 0.0
        anomaly_types = defaultdict(int)
        
        for u, v in edges:
            for order in G[u][v].get("orders", []):
                total_anomaly += order.get("score", 0)
                if order.get("score", 0) > 3.0:
                    anomaly_types["critical"] += 1
                elif order.get("score", 0) > 1.5:
                    anomaly_types["warning"] += 1
                else:
                    anomaly_types["normal"] += 1
        
        avg_score = total_anomaly / (len(edges) * len(G[u][v].get("orders", [1])) + 1e-10)
        
        density = len(edges) / (len(nodes) * (len(nodes) - 1)) if len(nodes) > 1 else 0
        
        dominant = max(
            anomaly_types.items(),
            key=lambda x: x[1],
            default=("normal", 0),
        )[0]
        
        return AnomalousSubgraph(
            nodes=list(nodes),
            edges=list(edges),
            anomaly_score=avg_score,
            size=len(nodes),
            density=density,
            dominant_anomaly_type=dominant,
            anomaly_distribution=dict(anomaly_types),
        )

    def _deduplicate_subgraphs(
        self,
        subgraphs: List[AnomalousSubgraph],
    ) -> List[AnomalousSubgraph]:
        if not subgraphs:
            return []
        
        unique = []
        seen = set()
        
        for sg in sorted(subgraphs, key=lambda x: x.anomaly_score, reverse=True):
            nodes_set = frozenset(sg.nodes)
            
            is_duplicate = False
            for seen_nodes in seen:
                intersection = nodes_set & seen_nodes
                union = nodes_set | seen_nodes
                if len(intersection) / max(len(union), 1) > 0.7:
                    is_duplicate = True
                    break
            
            if not is_duplicate:
                unique.append(sg)
                seen.add(nodes_set)
        
        return unique

    def mine_top_k(
        self,
        warehouse_coords: Dict[int, Tuple[float, float]],
        orders: List[Dict],
        anomaly_scores: Dict[int, float],
        k: Optional[int] = None,
    ) -> List[Dict]:
        if k is None:
            k = self.k
        
        G = self.build_graph(warehouse_coords, orders, anomaly_scores)
        subgraphs = self.find_hotspot_subgraphs(G, k=k)
        
        return [
            {
                "nodes": sg.nodes,
                "edges": [{"source": u, "target": v} for u, v in sg.edges],
                "anomaly_score": sg.anomaly_score,
                "size": sg.size,
                "density": sg.density,
                "dominant_anomaly": sg.dominant_anomaly_type,
                "distribution": sg.anomaly_distribution,
            }
            for sg in subgraphs
        ]
