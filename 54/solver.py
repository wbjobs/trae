import numpy as np
from scipy.sparse.linalg import spsolve
from scipy.sparse import csr_matrix, coo_matrix


def apply_boundary_conditions(K, F, nodes, node_coords, Lx, Ly, T_left, T_right):
    left_nodes = np.where(np.abs(node_coords[:, 0]) < 1e-10)[0]
    right_nodes = np.where(np.abs(node_coords[:, 0] - Lx) < 1e-10)[0]

    bc_nodes = np.concatenate([left_nodes, right_nodes])
    bc_values = np.concatenate([
        np.full(len(left_nodes), T_left),
        np.full(len(right_nodes), T_right)
    ])

    num_nodes = len(nodes)

    F_new = F - K[:, bc_nodes] @ bc_values

    K_coo = K.tocoo()
    mask = ~np.isin(K_coo.row, bc_nodes) & ~np.isin(K_coo.col, bc_nodes)
    rows = K_coo.row[mask]
    cols = K_coo.col[mask]
    data = K_coo.data[mask]

    rows = np.concatenate([rows, bc_nodes])
    cols = np.concatenate([cols, bc_nodes])
    data = np.concatenate([data, np.ones(len(bc_nodes))])

    K_bc = csr_matrix((data, (rows, cols)), shape=(num_nodes, num_nodes))

    F_new[bc_nodes] = bc_values

    print(f"边界条件应用完成，共处理 {len(bc_nodes)} 个边界节点")
    return K_bc, F_new


def solve_heat_equation(K, F):
    print("正在求解线性方程组...")
    T = spsolve(K, F)
    return T
