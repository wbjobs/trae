from typing import Any


class CTEGenerator:
    def __init__(self, parsed: dict):
        self.parsed = parsed
        self.cte_parts = []
        self.final_select = ""

    def generate(self) -> str:
        if not self.parsed.get("match_patterns"):
            raise ValueError("No match patterns found")

        pattern = self.parsed["match_patterns"][0]
        nodes = pattern["nodes"]
        rels = pattern["relationships"]

        if len(nodes) < 2:
            return self._generate_single_node_query(nodes)

        is_variable_length = pattern.get("variable_length") is not None

        if is_variable_length:
            return self._generate_optimized_variable_length_query(pattern)
        else:
            return self._generate_fixed_length_query(pattern)

    def _generate_single_node_query(self, nodes: list) -> str:
        node = nodes[0]
        table_alias = node.get("variable") or "n"
        conditions = []

        for label in node.get("labels", []):
            conditions.append(f"{table_alias}.label = '{label}'")

        for prop, val in node.get("properties", {}).items():
            conditions.append(f"{table_alias}.properties->>'{prop}' = {self._format_value(val)}")

        where_clause = f"WHERE {' AND '.join(conditions)}" if conditions else ""

        return_items = self._format_return_items(table_alias, node)

        sql = f"SELECT {return_items}\nFROM nodes {table_alias}\n{where_clause};"
        return sql

    def _generate_fixed_length_query(self, pattern: dict) -> str:
        nodes = pattern["nodes"]
        rels = pattern["relationships"]

        joins = []
        where_conditions = []

        for i, node in enumerate(nodes):
            alias = node.get("variable") or f"n{i}"
            node_conditions = []

            for label in node.get("labels", []):
                node_conditions.append(f"{alias}.label = '{label}'")

            for prop, val in node.get("properties", {}).items():
                node_conditions.append(f"{alias}.properties->>'{prop}' = {self._format_value(val)}")

            if node_conditions:
                where_conditions.extend(node_conditions)

        for i, rel in enumerate(rels):
            from_alias = nodes[i].get("variable") or f"n{i}"
            to_alias = nodes[i + 1].get("variable") or f"n{i + 1}"
            rel_alias = rel.get("variable") or f"r{i}"

            joins.append(
                f"JOIN edges {rel_alias} ON {from_alias}.id = {rel_alias}.from_node "
                f"AND {rel_alias}.to_node = {to_alias}.id"
            )

            if rel.get("types"):
                type_conditions = " OR ".join([f"{rel_alias}.type = '{t}'" for t in rel["types"]])
                where_conditions.append(f"({type_conditions})")

            for prop, val in rel.get("properties", {}).items():
                where_conditions.append(
                    f"{rel_alias}.properties->>'{prop}' = {self._format_value(val)}"
                )

        for cond in self.parsed.get("where_conditions", []):
            where_conditions.append(self._format_condition(cond))

        from_clause = f"FROM nodes {nodes[0].get('variable') or 'n0'}"
        join_clause = "\n".join(joins)

        for i in range(1, len(nodes)):
            alias = nodes[i].get("variable") or f"n{i}"
            join_clause = f"JOIN nodes {alias} ON TRUE\n{join_clause}"

        where_clause = f"WHERE {' AND '.join(where_conditions)}" if where_conditions else ""

        return_items = self._format_return_items_multi(nodes, rels)

        sql = f"SELECT {return_items}\n{from_clause}\n{join_clause}\n{where_clause};"
        return sql

    def _generate_optimized_variable_length_query(self, pattern: dict) -> str:
        nodes = pattern["nodes"]
        rels = pattern["relationships"]
        var_length = pattern["variable_length"]

        start_node = nodes[0]
        end_node = nodes[-1]
        start_alias = start_node.get("variable") or "start_node"
        end_alias = end_node.get("variable") or "end_node"
        path_alias = "path_cte"

        rel = rels[0]
        rel_type_filter = ""
        if rel.get("types"):
            type_conditions = " OR ".join([f"e.type = '{t}'" for t in rel["types"]])
            rel_type_filter = f"AND ({type_conditions})"

        min_depth = var_length.get("min", 1) or 1
        max_depth = var_length.get("max")

        start_conds = self._format_node_conditions_simple(start_node, "sn")
        end_conds = self._format_node_conditions_simple(end_node, "en")

        depth_cap = max_depth if max_depth else 100

        recursive_cte = f"""WITH RECURSIVE {path_alias}(node_id, depth, path, visited) AS (
    SELECT e.to_node AS node_id,
           1 AS depth,
           ARRAY[e.from_node, e.to_node] AS path,
           ARRAY[e.from_node, e.to_node] AS visited
    FROM edges e
    JOIN nodes sn ON e.from_node = sn.id
    WHERE 1=1 {start_conds}
    {rel_type_filter}
    UNION ALL
    SELECT e.to_node AS node_id,
           pc.depth + 1 AS depth,
           pc.path || e.to_node AS path,
           pc.visited || e.to_node AS visited
    FROM {path_alias} pc
    JOIN edges e ON pc.node_id = e.from_node
    {rel_type_filter}
    WHERE pc.depth < {depth_cap}
    AND e.to_node <> ALL(pc.visited)
)
SEARCH DEPTH FIRST BY node_id SET order_col
CYCLE node_id SET is_cycle USING cycle_path"""

        where_conditions = []
        where_conditions.append(f"pc.depth >= {min_depth}")
        if max_depth:
            where_conditions.append(f"pc.depth <= {max_depth}")

        if end_conds:
            where_conditions.append(end_conds[4:])

        for cond in self.parsed.get("where_conditions", []):
            where_conditions.append(self._format_condition(cond))

        where_clause = f"WHERE {' AND '.join(where_conditions)}" if where_conditions else ""

        return_items = self._format_return_items_recursive(start_alias, end_alias, path_alias)

        sql = f"""{recursive_cte}
SELECT {return_items}
FROM {path_alias} pc
JOIN nodes {start_alias} ON pc.path[1] = {start_alias}.id
JOIN nodes {end_alias} ON pc.node_id = {end_alias}.id
{where_clause}
ORDER BY pc.depth, pc.path;"""

        return sql

    def _generate_bidirectional_variable_length_query(self, pattern: dict) -> str:
        nodes = pattern["nodes"]
        rels = pattern["relationships"]
        var_length = pattern["variable_length"]

        start_node = nodes[0]
        end_node = nodes[-1]
        start_alias = start_node.get("variable") or "start_node"
        end_alias = end_node.get("variable") or "end_node"

        rel = rels[0]
        rel_type_filter = ""
        if rel.get("types"):
            type_conditions = " OR ".join([f"e.type = '{t}'" for t in rel["types"]])
            rel_type_filter = f"AND ({type_conditions})"

        min_depth = var_length.get("min", 1) or 1
        max_depth = var_length.get("max")
        mid_depth = (max_depth // 2) if max_depth else 50
        depth_cap = max_depth if max_depth else 100

        start_conds = self._format_node_conditions_simple(start_node, "sn")
        end_conds = self._format_node_conditions_simple(end_node, "en")

        bidirectional_cte = f"""WITH RECURSIVE
forward(node_id, depth, path, visited) AS (
    SELECT e.to_node, 1, ARRAY[e.from_node, e.to_node], ARRAY[e.from_node, e.to_node]
    FROM edges e
    JOIN nodes sn ON e.from_node = sn.id
    WHERE 1=1 {start_conds}
    {rel_type_filter}
    UNION ALL
    SELECT e.to_node, f.depth + 1, f.path || e.to_node, f.visited || e.to_node
    FROM forward f
    JOIN edges e ON f.node_id = e.from_node
    {rel_type_filter}
    WHERE f.depth < {mid_depth}
    AND e.to_node <> ALL(f.visited)
),
backward(node_id, depth, path, visited) AS (
    SELECT e.from_node, 1, ARRAY[e.to_node, e.from_node], ARRAY[e.to_node, e.from_node]
    FROM edges e
    JOIN nodes en ON e.to_node = en.id
    WHERE 1=1 {end_conds}
    {rel_type_filter}
    UNION ALL
    SELECT e.from_node, b.depth + 1, b.path || e.from_node, b.visited || e.from_node
    FROM backward b
    JOIN edges e ON b.node_id = e.to_node
    {rel_type_filter}
    WHERE b.depth < {depth_cap - min_depth + 1}
    AND e.from_node <> ALL(b.visited)
)"""

        where_conditions = []
        where_conditions.append(f"f.depth + b.depth >= {min_depth}")
        if max_depth:
            where_conditions.append(f"f.depth + b.depth <= {max_depth}")

        for cond in self.parsed.get("where_conditions", []):
            where_conditions.append(self._format_condition(cond))

        where_clause = f"WHERE {' AND '.join(where_conditions)}" if where_conditions else ""

        return_items = self._format_return_items_recursive(start_alias, end_alias, "f")

        sql = f"""{bidirectional_cte}
SELECT DISTINCT {return_items}
FROM forward f
JOIN backward b ON f.node_id = b.node_id
JOIN nodes {start_alias} ON f.path[1] = {start_alias}.id
JOIN nodes {end_alias} ON b.path[1] = {end_alias}.id
{where_clause}
ORDER BY f.depth + b.depth;"""

        return sql

    def _format_node_conditions_simple(self, node: dict, alias: str) -> str:
        conditions = []
        for label in node.get("labels", []):
            conditions.append(f"{alias}.label = '{label}'")
        for prop, val in node.get("properties", {}).items():
            conditions.append(f"{alias}.properties->>'{prop}' = {self._format_value(val)}")
        return " AND " + " AND ".join(conditions) if conditions else ""

    def _format_node_conditions(self, node: dict, alias: str) -> str:
        conditions = []
        for label in node.get("labels", []):
            conditions.append(f"{alias}.label = '{label}'")
        for prop, val in node.get("properties", {}).items():
            conditions.append(f"{alias}.properties->>'{prop}' = {self._format_value(val)}")
        return f"AND {' AND '.join(conditions)}" if conditions else ""

    def _format_value(self, val: Any) -> str:
        if isinstance(val, str):
            return f"'{val}'"
        if val is None:
            return "NULL"
        if isinstance(val, bool):
            return "TRUE" if val else "FALSE"
        return str(val)

    def _format_condition(self, cond: dict) -> str:
        if cond["type"] == "property":
            var = cond["variable"]
            prop = cond["property"]
            op = cond["op"]
            val = self._format_value(cond["value"])
            return f"{var}.properties->>'{prop}' {op} {val}"
        elif cond["type"] == "label":
            return f"{cond['variable']}.label = '{cond['label']}'"
        else:
            return cond.get("expression", "")

    def _format_return_items(self, table_alias: str, node: dict) -> str:
        items = []
        for item in self.parsed.get("return_items", []):
            if item["type"] == "property":
                var = item["variable"]
                prop = item["property"]
                alias = item.get("alias") or f"{var}_{prop}"
                if var == node.get("variable"):
                    items.append(f"{table_alias}.properties->>'{prop}' AS {alias}")
            elif item["type"] == "variable":
                items.append(f"{table_alias}.*")
            elif item["type"] == "star":
                items.append("*")
        return ", ".join(items) if items else "*"

    def _format_return_items_multi(self, nodes: list, rels: list) -> str:
        items = []
        node_map = {node.get("variable"): node for node in nodes}

        for item in self.parsed.get("return_items", []):
            if item["type"] == "property":
                var = item["variable"]
                prop = item["property"]
                alias = item.get("alias") or f"{var}_{prop}"
                items.append(f"{var}.properties->>'{prop}' AS {alias}")
            elif item["type"] == "variable":
                items.append(f"{item['name']}.*")
            elif item["type"] == "star":
                items.append("*")
        return ", ".join(items) if items else "*"

    def _format_return_items_recursive(self, start_alias: str, end_alias: str, path_alias: str) -> str:
        items = []
        start_node = self.parsed["match_patterns"][0]["nodes"][0]
        end_node = self.parsed["match_patterns"][0]["nodes"][-1]

        for item in self.parsed.get("return_items", []):
            if item["type"] == "property":
                var = item["variable"]
                prop = item["property"]
                alias = item.get("alias") or f"{var}_{prop}"

                if var == start_node.get("variable"):
                    items.append(f"{start_alias}.properties->>'{prop}' AS {alias}")
                elif var == end_node.get("variable"):
                    items.append(f"{end_alias}.properties->>'{prop}' AS {alias}")
            elif item["type"] == "variable":
                if item["name"] == start_node.get("variable"):
                    items.append(f"{start_alias}.*")
                elif item["name"] == end_node.get("variable"):
                    items.append(f"{end_alias}.*")
            elif item["type"] == "star":
                items.append("*")

        if not items:
            items = [
                f"{path_alias}.path",
                f"{path_alias}.depth",
                f"{start_alias}.properties AS start_node",
                f"{end_alias}.properties AS end_node"
            ]

        return ", ".join(items)
