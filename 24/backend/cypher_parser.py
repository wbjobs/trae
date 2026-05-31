import re
from typing import Any


class CypherParser:
    def __init__(self, cypher: str):
        self.cypher = cypher.strip()
        self.parsed = {
            "match_patterns": [],
            "where_conditions": [],
            "return_items": [],
            "path_conditions": []
        }

    def parse(self) -> dict:
        self._parse_match()
        self._parse_where()
        self._parse_return()
        return self.parsed

    def _parse_match(self):
        match_match = re.match(r'MATCH\s+(.*?)(?:\s+WHERE|\s+RETURN|$)', self.cypher, re.IGNORECASE | re.DOTALL)
        if not match_match:
            raise ValueError("Invalid Cypher: Missing MATCH clause")

        pattern_str = match_match.group(1).strip()
        self._parse_pattern(pattern_str)

    def _parse_pattern(self, pattern_str: str):
        patterns = re.split(r'\s*,\s*', pattern_str)

        for pattern in patterns:
            pattern = pattern.strip()
            if not pattern:
                continue

            path_info = {
                "nodes": [],
                "relationships": [],
                "variable_length": None
            }

            node_pattern = r'\(([^)]+)\)'
            rel_pattern = r'-\[([^\]]+)\]->'

            nodes = re.findall(node_pattern, pattern)
            rels = re.findall(rel_pattern, pattern)

            for i, node_str in enumerate(nodes):
                node = self._parse_node(node_str)
                path_info["nodes"].append(node)

            for i, rel_str in enumerate(rels):
                rel = self._parse_relationship(rel_str)
                path_info["relationships"].append(rel)
                if rel.get("variable_length"):
                    path_info["variable_length"] = rel["variable_length"]

            self.parsed["match_patterns"].append(path_info)

    def _parse_node(self, node_str: str) -> dict:
        node = {
            "variable": None,
            "labels": [],
            "properties": {}
        }

        node_str = node_str.strip()

        var_match = re.match(r'^(\w+)', node_str)
        if var_match:
            node["variable"] = var_match.group(1)
            node_str = node_str[len(var_match.group(1)):].strip()

        label_match = re.match(r':([\w:]+)', node_str)
        if label_match:
            labels_str = label_match.group(1)
            node["labels"] = [l.strip() for l in labels_str.split(':') if l.strip()]
            node_str = node_str[len(label_match.group(0)):].strip()

        if node_str.startswith('{') and node_str.endswith('}'):
            props_str = node_str[1:-1].strip()
            if props_str:
                props = re.split(r'\s*,\s*', props_str)
                for prop in props:
                    if ':' in prop:
                        key, val = prop.split(':', 1)
                        key = key.strip()
                        val = val.strip()
                        node["properties"][key] = self._parse_value(val)

        return node

    def _parse_relationship(self, rel_str: str) -> dict:
        rel = {
            "variable": None,
            "types": [],
            "properties": {},
            "variable_length": None
        }

        rel_str = rel_str.strip()

        var_match = re.match(r'^(\w+)', rel_str)
        if var_match:
            rel["variable"] = var_match.group(1)
            rel_str = rel_str[len(var_match.group(1)):].strip()

        if rel_str.startswith(':'):
            rel_str = rel_str[1:].strip()

        var_len_match = re.match(r'([\w|]*)\s*\*(\d*\.\.\d*|\d*|\*)', rel_str)
        if var_len_match:
            types_str = var_len_match.group(1)
            length_str = var_len_match.group(2)
            if types_str:
                rel["types"] = [t.strip() for t in types_str.split('|') if t.strip()]
            rel["variable_length"] = self._parse_variable_length(length_str)
            rel_str = rel_str[len(var_len_match.group(0)):].strip()
        else:
            type_match = re.match(r'([\w|]+)', rel_str)
            if type_match:
                rel["types"] = [t.strip() for t in type_match.group(1).split('|') if t.strip()]
                rel_str = rel_str[len(type_match.group(0)):].strip()

        if rel_str.startswith('{') and rel_str.endswith('}'):
            props_str = rel_str[1:-1].strip()
            if props_str:
                props = re.split(r'\s*,\s*', props_str)
                for prop in props:
                    if ':' in prop:
                        key, val = prop.split(':', 1)
                        key = key.strip()
                        val = val.strip()
                        rel["properties"][key] = self._parse_value(val)

        return rel

    def _parse_variable_length(self, length_str: str) -> dict:
        result = {"min": None, "max": None}

        if length_str == '*':
            result["min"] = 1
            return result

        if '..' in length_str:
            parts = length_str.split('..')
            if parts[0]:
                result["min"] = int(parts[0])
            if parts[1]:
                result["max"] = int(parts[1])
        else:
            if length_str:
                result["min"] = int(length_str)
                result["max"] = int(length_str)

        return result

    def _parse_where(self):
        where_match = re.search(r'WHERE\s+(.*?)(?:\s+RETURN|$)', self.cypher, re.IGNORECASE | re.DOTALL)
        if where_match:
            where_str = where_match.group(1).strip()
            self.parsed["where_conditions"] = self._parse_conditions(where_str)

    def _parse_conditions(self, where_str: str) -> list:
        conditions = []
        tokens = re.split(r'\s+(AND|OR)\s+', where_str, flags=re.IGNORECASE)

        current_op = None
        for token in tokens:
            token = token.strip()
            if not token:
                continue
            if token.upper() in ('AND', 'OR'):
                current_op = token.upper()
            else:
                condition = self._parse_single_condition(token)
                if current_op:
                    condition["operator"] = current_op
                conditions.append(condition)
                current_op = None

        return conditions

    def _parse_single_condition(self, cond_str: str) -> dict:
        match = re.match(r'(\w+)\.(\w+)\s*([=<>!]+)\s*(.+)', cond_str)
        if match:
            return {
                "type": "property",
                "variable": match.group(1),
                "property": match.group(2),
                "op": match.group(3),
                "value": self._parse_value(match.group(4).strip())
            }

        match = re.match(r'(\w+):(\w+)', cond_str)
        if match:
            return {
                "type": "label",
                "variable": match.group(1),
                "label": match.group(2)
            }

        return {"type": "raw", "expression": cond_str}

    def _parse_return(self):
        return_match = re.search(r'RETURN\s+(.*?)$', self.cypher, re.IGNORECASE | re.DOTALL)
        if not return_match:
            raise ValueError("Invalid Cypher: Missing RETURN clause")

        return_str = return_match.group(1).strip()
        items = re.split(r'\s*,\s*', return_str)

        for item in items:
            item = item.strip()
            alias = None

            as_match = re.match(r'(.+?)\s+AS\s+(\w+)$', item, re.IGNORECASE)
            if as_match:
                item = as_match.group(1).strip()
                alias = as_match.group(2)

            prop_match = re.match(r'(\w+)\.(\w+)', item)
            if prop_match:
                self.parsed["return_items"].append({
                    "type": "property",
                    "variable": prop_match.group(1),
                    "property": prop_match.group(2),
                    "alias": alias
                })
            elif item == '*':
                self.parsed["return_items"].append({
                    "type": "star",
                    "alias": alias
                })
            else:
                self.parsed["return_items"].append({
                    "type": "variable",
                    "name": item,
                    "alias": alias
                })

    def _parse_value(self, val_str: str) -> Any:
        val_str = val_str.strip()

        if val_str.startswith("'") and val_str.endswith("'"):
            return val_str[1:-1]
        if val_str.startswith('"') and val_str.endswith('"'):
            return val_str[1:-1]

        try:
            return int(val_str)
        except ValueError:
            pass

        try:
            return float(val_str)
        except ValueError:
            pass

        if val_str.upper() == 'TRUE':
            return True
        if val_str.upper() == 'FALSE':
            return False
        if val_str.upper() == 'NULL':
            return None

        return val_str
