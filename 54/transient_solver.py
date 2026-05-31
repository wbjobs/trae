import numpy as np
from scipy.sparse.linalg import spsolve
from scipy.sparse import csr_matrix


def get_boundary_nodes(node_coords, Lx, Ly):
    left_nodes = np.where(np.abs(node_coords[:, 0]) < 1e-10)[0]
    right_nodes = np.where(np.abs(node_coords[:, 0] - Lx) < 1e-10)[0]
    bc_nodes = np.concatenate([left_nodes, right_nodes])
    return bc_nodes, left_nodes, right_nodes


def apply_transient_boundary_conditions(K, F, bc_nodes, bc_values, num_nodes):
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

    return K_bc, F_new


def solve_transient_heat(K, M, F, T0, dt, num_steps, nodes, node_coords, Lx, Ly, T_left, T_right,
                         callback=None):
    num_nodes = len(nodes)
    T = T0.copy()
    T_history = [T.copy()]

    bc_nodes, left_nodes, right_nodes = get_boundary_nodes(node_coords, Lx, Ly)
    bc_values = np.concatenate([
        np.full(len(left_nodes), T_left),
        np.full(len(right_nodes), T_right)
    ])

    A = M + dt * K
    A_bc, _ = apply_transient_boundary_conditions(A, F.copy(), bc_nodes, bc_values, num_nodes)

    M_diag = M.diagonal()
    K_bc_cols = K[:, bc_nodes]

    for step in range(num_steps):
        F_rhs = M_diag * T + dt * F
        F_rhs -= dt * K_bc_cols @ bc_values
        F_rhs[bc_nodes] = bc_values

        T = spsolve(A_bc, F_rhs)
        T_history.append(T.copy())

        if callback is not None:
            callback(step, num_steps, T)

    return np.array(T_history)
