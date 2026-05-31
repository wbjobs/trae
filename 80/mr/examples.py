from typing import List, Tuple


def word_count_mapper(line_num: int, line: str) -> List[Tuple[str, int]]:
    result = []
    words = line.strip().split()
    for word in words:
        word = word.lower().strip(".,!?;:()[]{}'\"")
        if word:
            result.append((word, 1))
    return result


def word_count_reducer(key: str, values: List[str]) -> List[Tuple[str, int]]:
    total = sum(int(v) for v in values)
    return [(key, total)]


def invert_index_mapper(line_num: int, line: str) -> List[Tuple[str, int]]:
    result = []
    words = line.strip().split()
    for word in words:
        word = word.lower().strip(".,!?;:()[]{}'\"")
        if word:
            result.append((word, line_num))
    return result


def invert_index_reducer(key: str, values: List[str]) -> List[Tuple[str, str]]:
    line_numbers = sorted(set(int(v) for v in values))
    return [(key, ",".join(str(n) for n in line_numbers))]
