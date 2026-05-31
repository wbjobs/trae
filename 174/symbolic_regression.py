"""
符号回归引擎 (Symbolic Regression Engine)
基于遗传编程 + SymPy + NumPy + NSGA-II Pareto 前沿多目标优化

功能：
- 输入 (x, y) 数据点，自动搜索拟合的数学表达式
- 支持运算符: + - * / sin cos exp log
- 支持自定义运算符和常量
- Pareto 前沿多目标优化：同时优化拟合精度 (R²) 和表达式复杂度 (节点数)
- 输出最优 5 个候选表达式及表达式树可视化
- 防膨胀机制：简约压力 + Hoist 变异 + SymPy 定期简化 + 节点数上限
"""

import numpy as np
import sympy as sp
import random
import copy
import math
import warnings
from typing import List, Tuple, Dict, Optional, Callable, Union
from dataclasses import dataclass, field
from functools import cmp_to_key

warnings.filterwarnings("ignore", category=RuntimeWarning)

# ============================================================
# 第一部分：节点定义与表达式树
# ============================================================

NODE_VARIABLE = "variable"
NODE_CONSTANT = "constant"
NODE_OPERATOR = "operator"


class Node:
    """表达式树节点"""

    def __init__(self, node_type: str, value: str, children: Optional[List["Node"]] = None):
        self.node_type = node_type
        self.value = value
        self.children: List[Node] = children if children is not None else []

    def arity(self) -> int:
        return len(self.children)

    def is_leaf(self) -> bool:
        return len(self.children) == 0

    def copy(self) -> "Node":
        return copy.deepcopy(self)

    def __repr__(self) -> str:
        return f"Node({self.node_type}, '{self.value}', children={len(self.children)})"


# ============================================================
# 第二部分：运算符集合
# ============================================================

@dataclass
class Operator:
    name: str
    arity: int
    function: Callable
    sympy_func: Callable
    format_str: str

    def apply(self, *args):
        return self.function(*args)


DEFAULT_OPERATORS: Dict[str, Operator] = {
    "+": Operator("+", 2, lambda a, b: a + b, lambda a, b: a + b, "({}+{})"),
    "-": Operator("-", 2, lambda a, b: a - b, lambda a, b: a - b, "({}-{})"),
    "*": Operator("*", 2, lambda a, b: a * b, lambda a, b: a * b, "({}*{})"),
    "/": Operator("/", 2, lambda a, b: a / b if abs(b) > 1e-10 else 1.0,
                 lambda a, b: a / b, "({}/{})"),
    "sin": Operator("sin", 1, lambda a: np.sin(a), lambda a: sp.sin(a), "sin({})"),
    "cos": Operator("cos", 1, lambda a: np.cos(a), lambda a: sp.cos(a), "cos({})"),
    "exp": Operator("exp", 1, lambda a: np.exp(np.clip(a, -50, 50)),
                   lambda a: sp.exp(a), "exp({})"),
    "log": Operator("log", 1, lambda a: np.log(np.abs(a) + 1e-10),
                   lambda a: sp.log(sp.Abs(a) + 1e-10), "log({})"),
}


# ============================================================
# 第三部分：表达式树工具函数
# ============================================================

def get_all_subtrees(node: Node) -> List[Node]:
    result = [node]
    for child in node.children:
        result.extend(get_all_subtrees(child))
    return result


def get_internal_subtrees(node: Node) -> List[Node]:
    result = []
    if not node.is_leaf():
        result.append(node)
        for child in node.children:
            result.extend(get_internal_subtrees(child))
    return result


def replace_subtree(root: Node, old_subtree: Node, new_subtree: Node) -> Node:
    if root is old_subtree:
        return new_subtree.copy()
    new_node = Node(root.node_type, root.value)
    new_node.children = [replace_subtree(child, old_subtree, new_subtree) for child in root.children]
    return new_node


def count_nodes(node: Node) -> int:
    count = 1
    for child in node.children:
        count += count_nodes(child)
    return count


def count_operators(node: Node) -> int:
    count = 1 if node.node_type == NODE_OPERATOR else 0
    for child in node.children:
        count += count_operators(child)
    return count


def get_depth(node: Node) -> int:
    if node.is_leaf():
        return 1
    return 1 + max(get_depth(child) for child in node.children)


def tree_to_sympy(node: Node, variables: List[str], operators: Dict[str, Operator]) -> sp.Expr:
    if node.node_type == NODE_VARIABLE:
        return sp.Symbol(node.value)
    elif node.node_type == NODE_CONSTANT:
        return sp.Float(node.value)
    elif node.node_type == NODE_OPERATOR:
        op = operators[node.value]
        try:
            child_exprs = [tree_to_sympy(child, variables, operators) for child in node.children]
            return op.sympy_func(*child_exprs)
        except ZeroDivisionError:
            return sp.Float(1.0)
    else:
        raise ValueError(f"未知节点类型: {node.node_type}")


def tree_to_string(node: Node, operators: Dict[str, Operator]) -> str:
    if node.node_type == NODE_VARIABLE:
        return node.value
    elif node.node_type == NODE_CONSTANT:
        return node.value
    elif node.node_type == NODE_OPERATOR:
        op = operators[node.value]
        child_strs = [tree_to_string(child, operators) for child in node.children]
        return op.format_str.format(*child_strs)
    else:
        raise ValueError(f"未知节点类型: {node.node_type}")


def tree_to_numpy_func(
    node: Node,
    variables: List[str],
    operators: Dict[str, Operator]
) -> Callable:
    sympy_expr = tree_to_sympy(node, variables, operators)
    sympy_vars = [sp.Symbol(v) for v in variables]
    try:
        simplified = sp.simplify(sympy_expr)
        return sp.lambdify(sympy_vars, simplified, modules="numpy")
    except Exception:
        return sp.lambdify(sympy_vars, sympy_expr, modules="numpy")


def sympy_to_tree(
    expr: sp.Expr,
    variables: List[str],
    operators: Dict[str, Operator]
) -> Optional[Node]:
    """将 SymPy 表达式反向转换为表达式树（用于 SymPy 简化后的恢复）"""
    var_syms = {sp.Symbol(v) for v in variables}

    if expr in var_syms:
        return Node(NODE_VARIABLE, str(expr))
    elif isinstance(expr, sp.Float) or isinstance(expr, sp.Integer):
        return Node(NODE_CONSTANT, str(float(expr)))

    if isinstance(expr, sp.Add):
        args = list(expr.args)
        if len(args) == 2:
            c1 = sympy_to_tree(args[0], variables, operators)
            c2 = sympy_to_tree(args[1], variables, operators)
            if c1 is None or c2 is None:
                return None
            node = Node(NODE_OPERATOR, "+")
            node.children = [c1, c2]
            return node
        elif len(args) > 2:
            c1 = sympy_to_tree(args[0], variables, operators)
            c2 = sympy_to_tree(sp.Add(*args[1:]), variables, operators)
            if c1 is None or c2 is None:
                return None
            node = Node(NODE_OPERATOR, "+")
            node.children = [c1, c2]
            return node

    if isinstance(expr, sp.Mul):
        args = list(expr.args)
        if len(args) == 2:
            c1 = sympy_to_tree(args[0], variables, operators)
            c2 = sympy_to_tree(args[1], variables, operators)
            if c1 is None or c2 is None:
                return None
            node = Node(NODE_OPERATOR, "*")
            node.children = [c1, c2]
            return node
        elif len(args) > 2:
            c1 = sympy_to_tree(args[0], variables, operators)
            c2 = sympy_to_tree(sp.Mul(*args[1:]), variables, operators)
            if c1 is None or c2 is None:
                return None
            node = Node(NODE_OPERATOR, "*")
            node.children = [c1, c2]
            return node

    if isinstance(expr, sp.Pow):
        base, exp = expr.args
        if exp == -1:
            c = sympy_to_tree(base, variables, operators)
            if c is None:
                return None
            node = Node(NODE_OPERATOR, "/")
            node.children = [Node(NODE_CONSTANT, "1.0"), c]
            return node
        elif exp == 2:
            node = Node(NODE_OPERATOR, "*")
            child = sympy_to_tree(base, variables, operators)
            if child is None:
                return None
            node.children = [child, child.copy()]
            return node

    func_map = {
        sp.sin: "sin", sp.cos: "cos", sp.exp: "exp", sp.log: "log",
        sp.Abs: "log", sp.asin: "sin", sp.acos: "cos",
    }

    for func_cls, op_name in func_map.items():
        if isinstance(expr, func_cls) and op_name in operators:
            c = sympy_to_tree(expr.args[0], variables, operators)
            if c is None:
                return None
            node = Node(NODE_OPERATOR, op_name)
            node.children = [c]
            return node

    return None


# ============================================================
# 第四部分：随机表达式生成
# ============================================================

def random_leaf(variables: List[str], constants: List[float]) -> Node:
    if random.random() < 0.5 and variables:
        return Node(NODE_VARIABLE, random.choice(variables))
    else:
        const_val = random.choice(constants) if constants else round(random.uniform(-5, 5), 2)
        return Node(NODE_CONSTANT, str(const_val))


def random_operator(operators: Dict[str, Operator]) -> Operator:
    return random.choice(list(operators.values()))


def grow(
    max_depth: int,
    variables: List[str],
    constants: List[float],
    operators: Dict[str, Operator],
    current_depth: int = 0
) -> Node:
    if current_depth >= max_depth or (current_depth > 0 and random.random() < 0.4):
        return random_leaf(variables, constants)
    op = random_operator(operators)
    node = Node(NODE_OPERATOR, op.name)
    node.children = [grow(max_depth, variables, constants, operators, current_depth + 1)
                    for _ in range(op.arity)]
    return node


def full(
    max_depth: int,
    variables: List[str],
    constants: List[float],
    operators: Dict[str, Operator],
    current_depth: int = 0
) -> Node:
    if current_depth >= max_depth:
        return random_leaf(variables, constants)
    op = random_operator(operators)
    node = Node(NODE_OPERATOR, op.name)
    node.children = [full(max_depth, variables, constants, operators, current_depth + 1)
                    for _ in range(op.arity)]
    return node


def ramped_half_and_half(
    population_size: int,
    max_depth: int,
    variables: List[str],
    constants: List[float],
    operators: Dict[str, Operator]
) -> List[Node]:
    population = []
    depth_range = range(2, max_depth + 1)
    for i in range(population_size):
        depth = random.choice(list(depth_range))
        if random.random() < 0.5:
            tree = grow(depth, variables, constants, operators)
        else:
            tree = full(depth, variables, constants, operators)
        population.append(tree)
    return population


# ============================================================
# 第五部分：遗传操作（含防膨胀）
# ============================================================

def tournament_selection(
    population: List[Node],
    fitnesses: List[float],
    tournament_size: int = 3
) -> Node:
    indices = random.sample(range(len(population)), tournament_size)
    best_idx = max(indices, key=lambda i: fitnesses[i])
    return population[best_idx].copy()


def crossover(
    parent1: Node,
    parent2: Node,
    max_depth: int = 10,
    max_nodes: int = 60
) -> Tuple[Node, Node]:
    child1 = parent1.copy()
    child2 = parent2.copy()

    subtrees1 = get_all_subtrees(child1)
    subtrees2 = get_all_subtrees(child2)

    internal1 = [s for s in subtrees1 if not s.is_leaf()]
    internal2 = [s for s in subtrees2 if not s.is_leaf()]

    pool1 = internal1 if internal1 and random.random() < 0.9 else subtrees1
    pool2 = internal2 if internal2 and random.random() < 0.9 else subtrees2

    subtree1 = random.choice(pool1)
    subtree2 = random.choice(pool2)

    result1 = replace_subtree(child1, subtree1, subtree2)
    result2 = replace_subtree(child2, subtree2, subtree1)

    if get_depth(result1) > max_depth or count_nodes(result1) > max_nodes:
        result1 = parent1.copy()
    if get_depth(result2) > max_depth or count_nodes(result2) > max_nodes:
        result2 = parent2.copy()

    return result1, result2


def hoist_mutate(individual: Node) -> Node:
    """Hoist 变异：随机选择一个子树提升为整个表达式，防止膨胀"""
    subtrees = get_all_subtrees(individual)
    if len(subtrees) <= 1:
        return individual
    candidates = [s for s in subtrees if s is not individual and count_nodes(s) < count_nodes(individual)]
    if not candidates:
        return individual
    return random.choice(candidates).copy()


def mutate(
    individual: Node,
    variables: List[str],
    constants: List[float],
    operators: Dict[str, Operator],
    max_depth: int = 10,
    max_nodes: int = 60,
    mutation_rate: float = 0.3,
    hoist_rate: float = 0.15
) -> Node:
    if random.random() > mutation_rate:
        return individual

    if random.random() < hoist_rate:
        hoisted = hoist_mutate(individual)
        if count_nodes(hoisted) < count_nodes(individual):
            return hoisted

    mutant = individual.copy()
    subtrees = get_all_subtrees(mutant)
    target = random.choice(subtrees)

    mutation_type = random.random()

    if mutation_type < 0.35:
        remaining = max_nodes - (count_nodes(mutant) - count_nodes(target))
        new_subtree = grow(
            min(3, max_depth - get_depth(mutant) + get_depth(target)),
            variables, constants, operators
        )
        if count_nodes(new_subtree) <= max(3, remaining):
            mutant = replace_subtree(mutant, target, new_subtree)

    elif mutation_type < 0.6 and target.node_type == NODE_OPERATOR:
        current_op = operators[target.value]
        compatible_ops = [op for op in operators.values() if op.arity == current_op.arity]
        if compatible_ops:
            new_op = random.choice(compatible_ops)
            target.value = new_op.name

    elif mutation_type < 0.8 and target.node_type == NODE_CONSTANT:
        current_val = float(target.value)
        delta = random.uniform(-1.0, 1.0)
        target.value = str(round(current_val + delta, 4))

    elif mutation_type < 0.92 and target.is_leaf():
        new_leaf = random_leaf(variables, constants)
        mutant = replace_subtree(mutant, target, new_leaf)

    else:
        mutant = hoist_mutate(mutant)

    if get_depth(mutant) > max_depth or count_nodes(mutant) > max_nodes:
        return individual

    return mutant


# ============================================================
# 第六部分：Pareto 前沿多目标优化
# ============================================================

@dataclass
class ParetoCandidate:
    """Pareto 前沿候选个体"""
    tree: Node
    r2: float
    complexity: int          # 节点总数
    complexity_ops: int       # 运算符数量
    depth: int
    expression: str
    sympy_expr: sp.Expr
    rank: int = 0             # NSGA-II 非支配排序等级
    crowding_distance: float = 0.0

    def dominates(self, other: "ParetoCandidate") -> bool:
        """判断 self 是否支配 other（R²更高且复杂度更低）"""
        better_r2 = self.r2 > other.r2
        better_complexity = self.complexity <= other.complexity
        strictly_better = self.r2 > other.r2 or self.complexity < other.complexity
        return better_r2 and better_complexity and strictly_better


def non_dominated_sort(candidates: List[ParetoCandidate]) -> List[List[ParetoCandidate]]:
    """NSGA-II 非支配排序：返回各层前沿"""
    fronts: List[List[ParetoCandidate]] = []
    S: Dict[int, List[int]] = {}
    n_dom: Dict[int, int] = {}

    for p in range(len(candidates)):
        S[p] = []
        n_dom[p] = 0
        for q in range(len(candidates)):
            if p != q:
                if candidates[p].dominates(candidates[q]):
                    S[p].append(q)
                elif candidates[q].dominates(candidates[p]):
                    n_dom[p] += 1

        if n_dom[p] == 0:
            candidates[p].rank = 0
            if not fronts:
                fronts.append([])
            fronts[0].append(candidates[p])

    i = 0
    while i < len(fronts) and fronts[i]:
        next_front: List[ParetoCandidate] = []
        for p_ind in [candidates.index(c) for c in fronts[i]]:
            for q_ind in S[p_ind]:
                n_dom[q_ind] -= 1
                if n_dom[q_ind] == 0:
                    candidates[q_ind].rank = i + 1
                    next_front.append(candidates[q_ind])
        if next_front:
            fronts.append(next_front)
        i += 1

    return fronts


def calculate_crowding_distance(front: List[ParetoCandidate]) -> None:
    """计算拥挤距离（基于 R² 和复杂度两个目标）"""
    if len(front) <= 2:
        for c in front:
            c.crowding_distance = float('inf')
        return

    for c in front:
        c.crowding_distance = 0.0

    for obj_idx in range(2):
        if obj_idx == 0:
            sorted_front = sorted(front, key=lambda c: c.r2)
        else:
            sorted_front = sorted(front, key=lambda c: c.complexity)

        f_min = sorted_front[0].r2 if obj_idx == 0 else sorted_front[0].complexity
        f_max = sorted_front[-1].r2 if obj_idx == 0 else sorted_front[-1].complexity
        f_range = f_max - f_min

        if f_range == 0:
            continue

        sorted_front[0].crowding_distance = float('inf')
        sorted_front[-1].crowding_distance = float('inf')

        for i in range(1, len(sorted_front) - 1):
            if obj_idx == 0:
                distance = (sorted_front[i + 1].r2 - sorted_front[i - 1].r2) / f_range
            else:
                distance = (sorted_front[i + 1].complexity - sorted_front[i - 1].complexity) / f_range
            sorted_front[i].crowding_distance += distance


def nsga2_sort(candidates: List[ParetoCandidate], max_size: int) -> List[ParetoCandidate]:
    """NSGA-II 排序和截断：保留 max_size 个最优个体"""
    fronts = non_dominated_sort(candidates)
    result: List[ParetoCandidate] = []

    for front in fronts:
        if len(result) + len(front) <= max_size:
            result.extend(front)
        else:
            calculate_crowding_distance(front)
            front_sorted = sorted(front, key=lambda c: c.crowding_distance, reverse=True)
            remaining = max_size - len(result)
            result.extend(front_sorted[:remaining])
            break

    return result


# ============================================================
# 第七部分：适应度评估
# ============================================================

def evaluate_individual(
    individual: Node,
    x_data: np.ndarray,
    y_data: np.ndarray,
    variables: List[str],
    operators: Dict[str, Operator]
) -> Tuple[float, int, int, int]:
    """评估单个个体：返回 (R², 节点数, 运算符数, 深度)"""
    complexity = count_nodes(individual)
    complexity_ops = count_operators(individual)
    depth = get_depth(individual)

    try:
        func = tree_to_numpy_func(individual, variables, operators)
        if x_data.ndim == 1:
            x_dict = {variables[0]: x_data}
        else:
            x_dict = {variables[i]: x_data[:, i] for i in range(len(variables))}

        y_pred = func(**x_dict)

        if np.any(np.isnan(y_pred)) or np.any(np.isinf(y_pred)):
            return -1e10, complexity, complexity_ops, depth

        ss_res = np.sum((y_data - y_pred) ** 2)
        ss_tot = np.sum((y_data - np.mean(y_data)) ** 2)

        if ss_tot < 1e-10:
            return 0.0, complexity, complexity_ops, depth

        r2 = 1.0 - ss_res / ss_tot
        return float(r2), complexity, complexity_ops, depth

    except Exception:
        return -1e10, complexity, complexity_ops, depth


def evaluate_population(
    population: List[Node],
    x_data: np.ndarray,
    y_data: np.ndarray,
    variables: List[str],
    operators: Dict[str, Operator]
) -> List[ParetoCandidate]:
    """评估整个种群，返回 ParetoCandidate 列表"""
    candidates = []
    for ind in population:
        r2, comp, comp_ops, depth = evaluate_individual(ind, x_data, y_data, variables, operators)
        candidates.append(ParetoCandidate(
            tree=ind,
            r2=r2,
            complexity=comp,
            complexity_ops=comp_ops,
            depth=depth,
            expression=tree_to_string(ind, operators),
            sympy_expr=tree_to_sympy(ind, variables, operators)
        ))
    return candidates


def compute_parsimony_fitness(
    candidates: List[ParetoCandidate],
    parsimony_coeff: float = 0.01
) -> List[float]:
    """计算带简约压力的适应度：fitness = R² - coeff * complexity"""
    max_comp = max(c.complexity for c in candidates) if candidates else 1
    return [c.r2 - parsimony_coeff * c.complexity / max_comp for c in candidates]


# ============================================================
# 第八部分：表达式树可视化
# ============================================================

def visualize_tree(
    node: Node,
    operators: Dict[str, Operator],
    title: str = "表达式树",
    save_path: Optional[str] = None
):
    try:
        import matplotlib.pyplot as plt
        import matplotlib
        matplotlib.rcParams['font.sans-serif'] = ['SimHei', 'Microsoft YaHei']
        matplotlib.rcParams['axes.unicode_minus'] = False
    except ImportError:
        print("matplotlib 未安装，跳过可视化。请运行: pip install matplotlib")
        return None

    fig, ax = plt.subplots(1, 1, figsize=(12, 8))

    def _get_node_label(node: Node) -> str:
        return node.value

    def _draw_tree(ax, node, x, y, x_offset, y_offset, depth=0):
        label = _get_node_label(node)
        if node.node_type == NODE_VARIABLE:
            color = '#4CAF50'
        elif node.node_type == NODE_CONSTANT:
            color = '#2196F3'
        else:
            color = '#FF9800'

        ax.text(x, y, label, ha='center', va='center', fontsize=12, fontweight='bold',
                bbox=dict(boxstyle='round,pad=0.4', facecolor=color, edgecolor='black',
                         linewidth=1.5, alpha=0.9))

        if not node.is_leaf():
            n_children = len(node.children)
            child_x_offsets = np.linspace(-x_offset, x_offset, n_children) if n_children > 1 else [0]
            for i, child in enumerate(node.children):
                child_x = x + child_x_offsets[i]
                child_y = y - y_offset
                ax.annotate('', xy=(child_x, child_y + 0.15), xytext=(x, y - 0.15),
                          arrowprops=dict(arrowstyle='->', color='gray', lw=1.5))
                _draw_tree(ax, child, child_x, child_y, x_offset / (n_children + 0.5), y_offset, depth + 1)

    _draw_tree(ax, node, 0, 0, 3, 1.2)

    ax.set_xlim(-5, 5)
    ax.set_ylim(-get_depth(node) * 1.5 - 1, 2)
    ax.axis('off')
    ax.set_title(title, fontsize=14, fontweight='bold')

    from matplotlib.patches import Patch
    legend_elements = [
        Patch(facecolor='#4CAF50', edgecolor='black', label='变量'),
        Patch(facecolor='#2196F3', edgecolor='black', label='常量'),
        Patch(facecolor='#FF9800', edgecolor='black', label='运算符'),
    ]
    ax.legend(handles=legend_elements, loc='lower right', fontsize=10)

    plt.tight_layout()
    if save_path:
        plt.savefig(save_path, dpi=150, bbox_inches='tight')
        print(f"表达式树已保存到: {save_path}")

    return fig


def visualize_pareto_front(
    candidates: List[ParetoCandidate],
    save_path: Optional[str] = None
):
    """可视化 Pareto 前沿散点图"""
    try:
        import matplotlib.pyplot as plt
        import matplotlib
        matplotlib.rcParams['font.sans-serif'] = ['SimHei', 'Microsoft YaHei']
        matplotlib.rcParams['axes.unicode_minus'] = False
    except ImportError:
        return None

    fig, ax = plt.subplots(1, 1, figsize=(10, 7))

    complexities = [c.complexity for c in candidates]
    r2s = [c.r2 for c in candidates]

    ax.scatter(complexities, r2s, c='#2196F3', s=60, alpha=0.7, edgecolors='black', linewidth=0.8)

    pareto_points = []
    for i, c1 in enumerate(candidates):
        dominated = False
        for j, c2 in enumerate(candidates):
            if i != j and c2.dominates(c1):
                dominated = True
                break
        if not dominated:
            pareto_points.append(c1)

    if pareto_points:
        pareto_points.sort(key=lambda c: c.complexity)
        px = [c.complexity for c in pareto_points]
        py = [c.r2 for c in pareto_points]
        ax.plot(px, py, 'r-', linewidth=2, label='Pareto 前沿')
        ax.scatter(px, py, c='red', s=100, marker='*', edgecolors='black', linewidth=0.8, label='前沿点')

    ax.set_xlabel('表达式复杂度 (节点数)', fontsize=12)
    ax.set_ylabel('R² 拟合分数', fontsize=12)
    ax.set_title('Pareto 前沿：精度 vs 复杂度', fontsize=14, fontweight='bold')
    ax.legend(fontsize=11)
    ax.grid(True, alpha=0.3)

    plt.tight_layout()
    if save_path:
        plt.savefig(save_path, dpi=150, bbox_inches='tight')
        print(f"Pareto 前沿图已保存到: {save_path}")

    return fig


# ============================================================
# 第九部分：符号回归引擎主类（Pareto 优化版）
# ============================================================

class SymbolicRegression:
    """符号回归引擎 - Pareto 前沿多目标优化版"""

    def __init__(
        self,
        population_size: int = 200,
        max_generations: int = 100,
        max_depth: int = 8,
        max_nodes: int = 60,
        tournament_size: int = 3,
        crossover_rate: float = 0.8,
        mutation_rate: float = 0.3,
        hoist_rate: float = 0.15,
        elitism_size: int = 5,
        pareto_size: int = 20,
        parsimony_coeff: float = 0.005,
        simplify_interval: int = 10,
        variables: Optional[List[str]] = None,
        constants: Optional[List[float]] = None,
        operators: Optional[Dict[str, Operator]] = None,
        random_state: Optional[int] = None,
        verbose: bool = True,
    ):
        self.population_size = population_size
        self.max_generations = max_generations
        self.max_depth = max_depth
        self.max_nodes = max_nodes
        self.tournament_size = tournament_size
        self.crossover_rate = crossover_rate
        self.mutation_rate = mutation_rate
        self.hoist_rate = hoist_rate
        self.elitism_size = elitism_size
        self.pareto_size = pareto_size
        self.parsimony_coeff = parsimony_coeff
        self.simplify_interval = simplify_interval
        self.variables = variables or ["x"]
        self.constants = constants if constants is not None else [-2.0, -1.0, -0.5, 0.0, 0.5, 1.0, 2.0, 3.14159]
        self.operators = operators or DEFAULT_OPERATORS
        self.verbose = verbose

        if random_state is not None:
            random.seed(random_state)
            np.random.seed(random_state)

        self.population: List[Node] = []
        self.candidates: List[ParetoCandidate] = []
        self.pareto_front: List[ParetoCandidate] = []
        self.best_individual: Optional[Node] = None
        self.best_fitness: float = -float("inf")
        self.history: List[Dict] = []

    def _initialize_population(self):
        self.population = ramped_half_and_half(
            self.population_size, self.max_depth,
            self.variables, self.constants, self.operators
        )

    def _simplify_population(self):
        """定期用 SymPy 简化表达式，防止冗余膨胀"""
        new_pop = []
        for ind in self.population:
            try:
                sympy_expr = sp.simplify(
                    tree_to_sympy(ind, self.variables, self.operators)
                )
                tree = sympy_to_tree(sympy_expr, self.variables, self.operators)
                if tree is not None and count_nodes(tree) <= self.max_nodes:
                    new_pop.append(tree)
                else:
                    new_pop.append(ind)
            except Exception:
                new_pop.append(ind)
        self.population = new_pop

    def _evolve(self, x_data: np.ndarray, y_data: np.ndarray):
        """执行一代进化（NSGA-II 风格）"""
        # 评估当前种群
        self.candidates = evaluate_population(
            self.population, x_data, y_data, self.variables, self.operators
        )

        # 原始 R² 用于锦标赛选择（优先找准确解）
        raw_fitnesses = [c.r2 for c in self.candidates]

        # 带简约压力的适应度用于全局最佳跟踪（平衡精度与复杂度）
        parsimony_fitnesses = compute_parsimony_fitness(self.candidates, self.parsimony_coeff)

        # 更新全局最佳（使用简约适应度）
        best_idx = int(np.argmax(parsimony_fitnesses))
        if parsimony_fitnesses[best_idx] > self.best_fitness:
            self.best_fitness = parsimony_fitnesses[best_idx]
            self.best_individual = self.population[best_idx].copy()

        # NSGA-II 排序得到新一代
        sorted_candidates = nsga2_sort(self.candidates, self.population_size)

        new_population = []

        # 精英保留
        elite = sorted_candidates[:self.elitism_size]
        for c in elite:
            new_population.append(c.tree.copy())

        # 生成新个体
        while len(new_population) < self.population_size:
            if random.random() < self.crossover_rate:
                p1 = tournament_selection(self.population, raw_fitnesses, self.tournament_size)
                p2 = tournament_selection(self.population, raw_fitnesses, self.tournament_size)
                c1, c2 = crossover(p1, p2, self.max_depth, self.max_nodes)
                c1 = mutate(c1, self.variables, self.constants, self.operators,
                           self.max_depth, self.max_nodes, self.mutation_rate, self.hoist_rate)
                c2 = mutate(c2, self.variables, self.constants, self.operators,
                           self.max_depth, self.max_nodes, self.mutation_rate, self.hoist_rate)
                new_population.extend([c1, c2])
            else:
                p = tournament_selection(self.population, raw_fitnesses, self.tournament_size)
                c = mutate(p, self.variables, self.constants, self.operators,
                          self.max_depth, self.max_nodes, self.mutation_rate, self.hoist_rate)
                new_population.append(c)

        self.population = new_population[:self.population_size]

    def _update_pareto_front(self, x_data: np.ndarray, y_data: np.ndarray):
        """更新 Pareto 前沿"""
        all_candidates = evaluate_population(
            self.population, x_data, y_data, self.variables, self.operators
        )
        # 合并历史前沿
        all_candidates.extend(self.pareto_front)

        # 去重（按表达式字符串）
        seen = set()
        unique = []
        for c in all_candidates:
            key = c.expression
            if key not in seen and c.r2 > -1e5:
                seen.add(key)
                unique.append(c)

        # 非支配排序取前沿
        fronts = non_dominated_sort(unique)
        if fronts:
            self.pareto_front = nsga2_sort(unique, self.pareto_size)
        else:
            self.pareto_front = unique[:self.pareto_size]

    def fit(
        self,
        x_data: Union[np.ndarray, List],
        y_data: Union[np.ndarray, List]
    ) -> "SymbolicRegression":
        x_data = np.asarray(x_data, dtype=float)
        y_data = np.asarray(y_data, dtype=float)

        if x_data.ndim == 1:
            n_features = 1
        else:
            n_features = x_data.shape[1]

        if len(self.variables) != n_features:
            if n_features == 1:
                self.variables = ["x"]
            else:
                self.variables = [f"x{i+1}" for i in range(n_features)]

        if self.verbose:
            print("=" * 60)
            print("符号回归引擎启动 (Pareto 前沿多目标优化)")
            print("=" * 60)
            print(f"  种群大小: {self.population_size}")
            print(f"  最大代数: {self.max_generations}")
            print(f"  最大深度: {self.max_depth}")
            print(f"  最大节点数: {self.max_nodes}")
            print(f"  Pareto 前沿容量: {self.pareto_size}")
            print(f"  简约压力系数: {self.parsimony_coeff}")
            print(f"  变量: {self.variables}")
            print(f"  运算符: {list(self.operators.keys())}")
            print(f"  数据点数: {len(y_data)}")
            print("=" * 60)

        self._initialize_population()

        for gen in range(self.max_generations):
            # 定期 SymPy 简化
            if gen > 0 and gen % self.simplify_interval == 0:
                self._simplify_population()

            self._evolve(x_data, y_data)
            self._update_pareto_front(x_data, y_data)

            gen_best = max(self.candidates, key=lambda c: c.r2) if self.candidates else None

            self.history.append({
                "generation": gen,
                "best_r2": gen_best.r2 if gen_best else 0.0,
                "best_complexity": gen_best.complexity if gen_best else 0,
                "pareto_size": len(self.pareto_front),
            })

            if self.verbose and (gen % 10 == 0 or gen == self.max_generations - 1):
                r2_str = f"{gen_best.r2:.6f}" if gen_best else "N/A"
                comp_str = f"{gen_best.complexity}" if gen_best else "N/A"
                pf_size = len(self.pareto_front)
                print(f"  第 {gen:4d} 代 | 最佳R² = {r2_str} | "
                      f"复杂度 = {comp_str} | Pareto前沿 = {pf_size}")

            if self.best_fitness >= 0.9999:
                if self.verbose:
                    print(f"\n  提前停止！达到接近完美拟合")
                break

        if self.verbose:
            print("=" * 60)
            print("训练完成！")
            self._print_pareto_front()
            print("=" * 60)

        return self

    def _print_pareto_front(self):
        """打印 Pareto 前沿"""
        top = self.get_pareto_front(5)
        print(f"\n  Pareto 前沿候选 (Top {len(top)}):")
        print(f"  {'-' * 56}")
        print(f"  {'#':<3} {'R²':<10} {'节点数':<6} {'深度':<4} 表达式")
        print(f"  {'-' * 56}")
        for i, c in enumerate(top):
            expr_display = c.expression[:45] + "..." if len(c.expression) > 45 else c.expression
            print(f"  {i+1:<3} {c.r2:<10.6f} {c.complexity:<6} {c.depth:<4} {expr_display}")
        print(f"  {'-' * 56}")

    def get_pareto_front(self, top_k: int = 5) -> List[ParetoCandidate]:
        """
        获取 Pareto 前沿候选表达式

        参数:
            top_k: 返回前 K 个候选（按 R² 降序 + 复杂度升序排序）

        返回:
            ParetoCandidate 列表，每个包含 tree, r2, complexity, expression 等
        """
        if not self.pareto_front:
            return []

        sorted_front = sorted(
            self.pareto_front,
            key=lambda c: (-c.r2, c.complexity)
        )
        return sorted_front[:top_k]

    def get_expression_string(self) -> str:
        if self.best_individual is None:
            return "N/A"
        return tree_to_string(self.best_individual, self.operators)

    def get_sympy_expression(self) -> sp.Expr:
        if self.best_individual is None:
            raise ValueError("模型未训练，请先调用 fit() 方法")
        return sp.simplify(
            tree_to_sympy(self.best_individual, self.variables, self.operators)
        )

    def predict(self, x_data: Union[np.ndarray, List]) -> np.ndarray:
        if self.best_individual is None:
            raise ValueError("模型未训练，请先调用 fit() 方法")

        x_data = np.asarray(x_data, dtype=float)
        func = tree_to_numpy_func(self.best_individual, self.variables, self.operators)

        if x_data.ndim == 1:
            x_dict = {self.variables[0]: x_data}
        else:
            x_dict = {self.variables[i]: x_data[:, i] for i in range(len(self.variables))}

        return func(**x_dict)

    def score(
        self,
        x_data: Union[np.ndarray, List],
        y_data: Union[np.ndarray, List]
    ) -> float:
        y_pred = self.predict(x_data)
        y_data = np.asarray(y_data, dtype=float)
        ss_res = np.sum((y_data - y_pred) ** 2)
        ss_tot = np.sum((y_data - np.mean(y_data)) ** 2)
        if ss_tot < 1e-10:
            return 0.0
        return 1.0 - ss_res / ss_tot

    def visualize(
        self,
        save_path: Optional[str] = None,
        title: Optional[str] = None,
        candidate_index: int = 0
    ):
        """
        可视化表达式树

        参数:
            save_path: 保存路径
            title: 标题
            candidate_index: Pareto 候选索引 (0=最佳R²)
        """
        pareto = self.get_pareto_front(5)
        if candidate_index < len(pareto):
            tree = pareto[candidate_index].tree
            r2 = pareto[candidate_index].r2
            if title is None:
                title = f"表达式树 #{candidate_index+1} (R² = {r2:.4f}, 节点={pareto[candidate_index].complexity})"
        elif self.best_individual is not None:
            tree = self.best_individual
            if title is None:
                title = f"表达式树 (R² = {self.best_fitness:.4f})"
        else:
            print("模型未训练，请先调用 fit() 方法")
            return None

        return visualize_tree(tree, self.operators, title, save_path)

    def visualize_pareto(
        self,
        save_path: Optional[str] = None
    ):
        """可视化 Pareto 前沿散点图"""
        if not self.pareto_front:
            print("无 Pareto 前沿数据，请先调用 fit() 方法")
            return None
        return visualize_pareto_front(self.pareto_front, save_path)


# ============================================================
# 第十部分：便捷函数
# ============================================================

def symbolic_regression(
    x_data: Union[np.ndarray, List],
    y_data: Union[np.ndarray, List],
    population_size: int = 200,
    max_generations: int = 100,
    max_depth: int = 8,
    max_nodes: int = 60,
    pareto_size: int = 20,
    parsimony_coeff: float = 0.005,
    variables: Optional[List[str]] = None,
    operators: Optional[Dict[str, Operator]] = None,
    constants: Optional[List[float]] = None,
    random_state: Optional[int] = None,
    verbose: bool = True,
    **kwargs
) -> SymbolicRegression:
    model = SymbolicRegression(
        population_size=population_size,
        max_generations=max_generations,
        max_depth=max_depth,
        max_nodes=max_nodes,
        pareto_size=pareto_size,
        parsimony_coeff=parsimony_coeff,
        variables=variables,
        operators=operators,
        constants=constants,
        random_state=random_state,
        verbose=verbose,
        **kwargs
    )
    model.fit(x_data, y_data)
    return model


def add_custom_operator(
    name: str,
    arity: int,
    function: Callable,
    sympy_func: Callable,
    format_str: str
) -> Operator:
    return Operator(
        name=name, arity=arity,
        function=function, sympy_func=sympy_func,
        format_str=format_str
    )


# ============================================================
# 第十一部分：测试与演示
# ============================================================

if __name__ == "__main__":
    print("=" * 70)
    print("符号回归引擎 - Pareto 前沿多目标优化 测试演示")
    print("=" * 70)

    # ----------------------------------------------------------
    # 测试1: 简单多项式 y = x^2 + 2*x + 1
    # ----------------------------------------------------------
    print("\n[测试1] 拟合多项式 y = x² + 2x + 1")
    print("-" * 60)

    np.random.seed(42)
    x1 = np.linspace(-5, 5, 100)
    y1 = x1 ** 2 + 2 * x1 + 1

    model1 = symbolic_regression(
        x1, y1,
        population_size=150,
        max_generations=80,
        max_depth=6,
        max_nodes=40,
        pareto_size=15,
        parsimony_coeff=0.01,
        random_state=42,
        verbose=True
    )

    print(f"\n  最终最佳R²: {model1.score(x1, y1):.6f}")
    print(f"  最终表达式: {model1.get_expression_string()}")
    print(f"  SymPy 简化: {model1.get_sympy_expression()}")

    # ----------------------------------------------------------
    # 测试2: 三角函数 y = sin(x) + cos(2*x)
    # ----------------------------------------------------------
    print("\n[测试2] 拟合三角函数 y = sin(x) + cos(2x)")
    print("-" * 60)

    x2 = np.linspace(-2 * np.pi, 2 * np.pi, 150)
    y2 = np.sin(x2) + np.cos(2 * x2)

    model2 = symbolic_regression(
        x2, y2,
        population_size=200,
        max_generations=100,
        max_depth=7,
        max_nodes=50,
        pareto_size=20,
        parsimony_coeff=0.008,
        random_state=123,
        verbose=True
    )

    print(f"\n  最终最佳R²: {model2.score(x2, y2):.6f}")
    print(f"  最终表达式: {model2.get_expression_string()}")
    print(f"  SymPy 简化: {model2.get_sympy_expression()}")

    # ----------------------------------------------------------
    # 测试3: 指数对数函数 y = exp(x) * log(x + 1)
    # ----------------------------------------------------------
    print("\n[测试3] 拟合函数 y = exp(x) * log(x + 1)")
    print("-" * 60)

    x3 = np.linspace(0.1, 3, 100)
    y3 = np.exp(x3) * np.log(x3 + 1)

    model3 = symbolic_regression(
        x3, y3,
        population_size=200,
        max_generations=100,
        max_depth=8,
        max_nodes=60,
        pareto_size=20,
        parsimony_coeff=0.005,
        random_state=456,
        verbose=True
    )

    print(f"\n  最终最佳R²: {model3.score(x3, y3):.6f}")
    print(f"  最终表达式: {model3.get_expression_string()}")
    print(f"  SymPy 简化: {model3.get_sympy_expression()}")

    # ----------------------------------------------------------
    # 测试4: 带噪声数据
    # ----------------------------------------------------------
    print("\n[测试4] 带噪声数据 y = 3*x² - 2*x + 5 + noise")
    print("-" * 60)

    np.random.seed(789)
    x4 = np.linspace(-3, 3, 120)
    y4 = 3 * x4 ** 2 - 2 * x4 + 5 + np.random.normal(0, 0.5, 120)

    model4 = symbolic_regression(
        x4, y4,
        population_size=250,
        max_generations=120,
        max_depth=6,
        max_nodes=40,
        pareto_size=15,
        parsimony_coeff=0.02,
        random_state=789,
        verbose=True
    )

    print(f"\n  最终最佳R²: {model4.score(x4, y4):.6f}")
    print(f"  最终表达式: {model4.get_expression_string()}")
    print(f"  SymPy 简化: {model4.get_sympy_expression()}")

    # ----------------------------------------------------------
    # 测试5: 展示 Pareto 前沿前 5 个候选
    # ----------------------------------------------------------
    print("\n[测试5] Pareto 前沿候选表达式 (基于测试2)")
    print("-" * 60)

    pareto = model2.get_pareto_front(5)
    print(f"\n  Pareto 前沿 Top 5 候选:")
    print(f"  {'=' * 60}")
    for i, c in enumerate(pareto):
        print(f"\n  候选 #{i+1}:")
        print(f"    R² = {c.r2:.6f}")
        print(f"    节点数 = {c.complexity}")
        print(f"    深度 = {c.depth}")
        print(f"    表达式: {c.expression}")
        try:
            simplified = sp.simplify(c.sympy_expr)
            print(f"    SymPy简化: {simplified}")
        except Exception:
            pass

    # ----------------------------------------------------------
    # 测试6: 可视化 Pareto 前沿散点图 + 表达式树
    # ----------------------------------------------------------
    print("\n[测试6] 可视化")
    print("-" * 60)

    try:
        import matplotlib
        matplotlib.use("Agg")

        model2.visualize_pareto(save_path="pareto_front_demo.png")
        print("  Pareto 前沿散点图已保存为: pareto_front_demo.png")

        model2.visualize(save_path="expression_tree_top1.png", candidate_index=0)
        print("  候选#1 表达式树已保存为: expression_tree_top1.png")

        if len(pareto) >= 3:
            model2.visualize(save_path="expression_tree_top3.png", candidate_index=2)
            print("  候选#3 表达式树已保存为: expression_tree_top3.png")

    except Exception as e:
        print(f"  可视化失败: {e}")

    # ----------------------------------------------------------
    # 汇总
    # ----------------------------------------------------------
    print("\n" + "=" * 70)
    print("所有测试完成！汇总:")
    print("=" * 70)
    print(f"  测试1 R²: {model1.score(x1, y1):.6f} - {model1.get_expression_string()}")
    print(f"  测试2 R²: {model2.score(x2, y2):.6f} - {model2.get_expression_string()}")
    print(f"  测试3 R²: {model3.score(x3, y3):.6f} - {model3.get_expression_string()}")
    print(f"  测试4 R²: {model4.score(x4, y4):.6f} - {model4.get_expression_string()}")
    print("=" * 70)
    print("\n使用说明:")
    print("  model.get_pareto_front(5)  # 获取前5个候选表达式")
    print("  model.visualize_pareto()    # 绘制Pareto前沿散点图")
    print("  model.visualize(candidate_index=0)  # 可视化第i个候选的表达式树")
    print("=" * 70)