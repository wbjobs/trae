"""
字库加载器 - Dictionary Loader
负责加载和管理本地古籍字库索引文件组
"""

import json
import os
import unicodedata
from typing import Dict, List, Optional, Any


class DictionaryLoader:
    """古籍字库加载器"""

    def __init__(self, dictionary_dir: Optional[str] = None):
        """
        初始化字库加载器

        Args:
            dictionary_dir: 字库目录路径
        """
        if dictionary_dir is None:
            dictionary_dir = os.path.join(
                os.path.dirname(os.path.abspath(__file__)),
                "dictionary"
            )
        self.dictionary_dir = dictionary_dir
        self.variant_mapping: Dict[str, List[str]] = {}
        self.reverse_variant_mapping: Dict[str, str] = {}
        self.char_index: Dict[str, Dict[str, Any]] = {}
        self.char_meanings: Dict[str, List[Dict[str, Any]]] = {}
        self.metadata: Dict[str, Any] = {}
        self._rare_chars_cache: Dict[str, str] = {}
        self._load_errors: List[str] = []

    def load_all(self) -> None:
        """加载所有字库文件"""
        self.load_variant_chars()
        self.load_ancient_chars()
        self.load_char_meanings()

    def load_variant_chars(self) -> None:
        """加载异体字映射表"""
        file_path = os.path.join(self.dictionary_dir, "variant_chars.json")
        if not os.path.exists(file_path):
            error_msg = f"异体字映射表不存在: {file_path}"
            self._load_errors.append(error_msg)
            print(f"警告: {error_msg}，将使用空映射表")
            self.variant_mapping = {}
            self.reverse_variant_mapping = {}
            return

        try:
            with open(file_path, "r", encoding="utf-8") as f:
                data = json.load(f)

            self.variant_mapping = data.get("variant_mapping", {})
            self.metadata["variant_chars"] = data.get("metadata", {})

            for standard_char, variants in self.variant_mapping.items():
                if not isinstance(standard_char, str) or len(standard_char) != 1:
                    continue
                for variant in variants:
                    if variant and isinstance(variant, str) and len(variant) == 1:
                        self.reverse_variant_mapping[variant] = standard_char

            print(f"已加载异体字映射: {len(self.variant_mapping)} 个标准字, "
                  f"{len(self.reverse_variant_mapping)} 个异体字")
        except json.JSONDecodeError as e:
            error_msg = f"异体字映射表JSON解析失败: {e}"
            self._load_errors.append(error_msg)
            print(f"警告: {error_msg}，将使用空映射表")
            self.variant_mapping = {}
            self.reverse_variant_mapping = {}
        except Exception as e:
            error_msg = f"加载异体字映射表失败: {e}"
            self._load_errors.append(error_msg)
            print(f"警告: {error_msg}，将使用空映射表")
            self.variant_mapping = {}
            self.reverse_variant_mapping = {}

    def load_ancient_chars(self) -> None:
        """加载古籍字库索引"""
        file_path = os.path.join(self.dictionary_dir, "ancient_chars.json")
        if not os.path.exists(file_path):
            error_msg = f"古籍字库索引不存在: {file_path}"
            self._load_errors.append(error_msg)
            print(f"警告: {error_msg}，将使用空字库")
            self.char_index = {}
            return

        try:
            with open(file_path, "r", encoding="utf-8") as f:
                data = json.load(f)

            char_list = data.get("char_index", [])
            for char_data in char_list:
                if not isinstance(char_data, dict):
                    continue
                char = char_data.get("char")
                if char and isinstance(char, str) and len(char) == 1:
                    self.char_index[char] = char_data

            self.metadata["ancient_chars"] = data.get("metadata", {})
            print(f"已加载古籍字库索引: {len(self.char_index)} 个汉字")
        except json.JSONDecodeError as e:
            error_msg = f"古籍字库索引JSON解析失败: {e}"
            self._load_errors.append(error_msg)
            print(f"警告: {error_msg}，将使用空字库")
            self.char_index = {}
        except Exception as e:
            error_msg = f"加载古籍字库索引失败: {e}"
            self._load_errors.append(error_msg)
            print(f"警告: {error_msg}，将使用空字库")
            self.char_index = {}

    def load_char_meanings(self) -> None:
        """加载古文字义释义库"""
        file_path = os.path.join(self.dictionary_dir, "char_meanings.json")
        if not os.path.exists(file_path):
            error_msg = f"古文字义释义库不存在: {file_path}"
            self._load_errors.append(error_msg)
            print(f"警告: {error_msg}，将使用空释义库")
            self.char_meanings = {}
            return

        try:
            with open(file_path, "r", encoding="utf-8") as f:
                data = json.load(f)

            raw_meanings = data.get("meanings", {})
            for char, meanings in raw_meanings.items():
                if isinstance(char, str) and len(char) == 1 and isinstance(meanings, list):
                    self.char_meanings[char] = meanings

            self.metadata["char_meanings"] = data.get("metadata", {})
            print(f"已加载古文字义释义: {len(self.char_meanings)} 个汉字")
        except json.JSONDecodeError as e:
            error_msg = f"古文字义释义库JSON解析失败: {e}"
            self._load_errors.append(error_msg)
            print(f"警告: {error_msg}，将使用空释义库")
            self.char_meanings = {}
        except Exception as e:
            error_msg = f"加载古文字义释义库失败: {e}"
            self._load_errors.append(error_msg)
            print(f"警告: {error_msg}，将使用空释义库")
            self.char_meanings = {}

    def get_standard_char(self, variant_char: str) -> Optional[str]:
        """
        获取异体字对应的标准字

        Args:
            variant_char: 异体字

        Returns:
            标准字，如果不存在则返回原字
        """
        try:
            if not variant_char or not isinstance(variant_char, str):
                return variant_char

            if variant_char in self._rare_chars_cache:
                return self._rare_chars_cache[variant_char]

            if variant_char in self.reverse_variant_mapping:
                result = self.reverse_variant_mapping[variant_char]
            else:
                normalized = self._normalize_char(variant_char)
                if normalized != variant_char and normalized in self.reverse_variant_mapping:
                    result = self.reverse_variant_mapping[normalized]
                else:
                    result = variant_char

            self._rare_chars_cache[variant_char] = result
            return result
        except Exception as e:
            print(f"获取标准字时出错: {e}")
            return variant_char

    def _normalize_char(self, char: str) -> str:
        """
        标准化字符，处理生僻字、异体字的Unicode规范化

        Args:
            char: 原始字符

        Returns:
            标准化后的字符
        """
        try:
            normalized = unicodedata.normalize('NFC', char)
            return normalized
        except Exception:
            return char

    def get_variants(self, standard_char: str) -> List[str]:
        """
        获取标准字的所有异体字

        Args:
            standard_char: 标准字

        Returns:
            异体字列表
        """
        try:
            if not standard_char or not isinstance(standard_char, str):
                return []
            return self.variant_mapping.get(standard_char, [])
        except Exception as e:
            print(f"获取异体字列表时出错: {e}")
            return []

    def get_char_info(self, char: str) -> Optional[Dict[str, Any]]:
        """
        获取汉字的详细信息

        Args:
            char: 汉字

        Returns:
            汉字信息字典
        """
        try:
            if not char or not isinstance(char, str):
                return None
            return self.char_index.get(char)
        except Exception as e:
            print(f"获取汉字信息时出错: {e}")
            return None

    def get_char_meanings(self, char: str) -> List[Dict[str, Any]]:
        """
        获取汉字的所有释义

        Args:
            char: 汉字

        Returns:
            释义列表
        """
        try:
            if not char or not isinstance(char, str):
                return []
            return self.char_meanings.get(char, [])
        except Exception as e:
            print(f"获取汉字释义时出错: {e}")
            return []

    def has_char(self, char: str) -> bool:
        """
        检查字库中是否包含该字

        Args:
            char: 汉字

        Returns:
            是否存在
        """
        try:
            if not char or not isinstance(char, str):
                return False
            return (
                char in self.variant_mapping or
                char in self.reverse_variant_mapping or
                char in self.char_index or
                char in self.char_meanings
            )
        except Exception as e:
            print(f"检查字库时出错: {e}")
            return False

    def get_dictionary_stats(self) -> Dict[str, Any]:
        """
        获取字库统计信息

        Returns:
            统计信息字典
        """
        try:
            return {
                "variant_standard_chars": len(self.variant_mapping),
                "variant_total_chars": len(self.reverse_variant_mapping),
                "ancient_chars": len(self.char_index),
                "meaning_chars": len(self.char_meanings),
                "load_errors": self._load_errors,
                "metadata": self.metadata
            }
        except Exception as e:
            print(f"获取统计信息时出错: {e}")
            return {
                "variant_standard_chars": 0,
                "variant_total_chars": 0,
                "ancient_chars": 0,
                "meaning_chars": 0,
                "error": str(e)
            }

    def get_load_errors(self) -> List[str]:
        """获取加载错误列表"""
        return self._load_errors.copy()

    def clear_cache(self) -> None:
        """清空缓存"""
        self._rare_chars_cache.clear()
