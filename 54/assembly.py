import numpy as np
from scipy.sparse import csr_matrix


def assemble_stiffness_matrix(nodes, elements, node_coords, k):
    num_nodes = len(nodes)
    num_elems = len(elements)

    gp = np.array([-1.0 / np.sqrt(3), 1.0 / np.sqrt(3)])
    gw = np.array([1.0, 1.0])

    dN_dxi_gp = np.zeros((4, 4))
    dN_deta_gp = np.zeros((4, 4))

    gp_idx = 0
    for i, xi in enumerate(gp):
        for j, eta in enumerate(gp):
            dN_dxi_gp[gp_idx] = np.array([
                -(1 - eta) / 4,
                (1 - eta) / 4,
                (1 + eta) / 4,
                -(1 + eta) / 4
            ])
            dN_deta_gp[gp_idx] = np.array([
                -(1 - xi) / 4,
                -(1 + xi) / 4,
                (1 + xi) / 4,
                (1 - xi) / 4
            ])
            gp_idx += 1

    xe = node_coords[elements, 0]
    ye = node_coords[elements, 1]

    Ke_all = np.zeros((num_elems, 4, 4))

    for gp_idx in range(4):
        dN_dxi = dN_dxi_gp[gp_idx]
        dN_deta = dN_deta_gp[gp_idx]

        dx_dxi = xe @ dN_dxi
        dx_deta = xe @ dN_deta
        dy_dxi = ye @ dN_dxi
        dy_deta = ye @ dN_deta

        J = dx_dxi * dy_deta - dx_deta * dy_dxi

        dN_dx = (dN_dxi[None, :] * dy_deta[:, None] - dN_deta[None, :] * dy_dxi[:, None]) / J[:, None]
        dN_dy = (dN_deta[None, :] * dx_dxi[:, None] - dN_dxi[None, :] * dx_deta[:, None]) / J[:, None]

        w = np.abs(J) * gw[gp_idx // 2] * gw[gp_idx % 2]

        Ke_all += k * (dN_dx[:, :, None] * dN_dx[:, None, :] +
                       dN_dy[:, :, None] * dN_dy[:, None, :]) * w[:, None, None]

    rows = np.repeat(elements, 4, axis=1).reshape(-1)
    cols = np.tile(elements, (1, 4)).reshape(-1)
    data = Ke_all.reshape(-1)

    K_global = csr_matrix((data, (rows, cols)), shape=(num_nodes, num_nodes))

    print(f"刚度矩阵组装完成，大小: {num_nodes} x {num_nodes}")
    return K_global


def assemble_mass_matrix(nodes, elements, node_coords, rho_cp):
    num_nodes = len(nodes)
    num_elems = len(elements)

    gp = np.array([-1.0 / np.sqrt(3), 1.0 / np.sqrt(3)])
    gw = np.array([1.0, 1.0])

    N_gp = np.zeros((4, 4))

    gp_idx = 0
    for i, xi in enumerate(gp):
        for j, eta in enumerate(gp):
            N_gp[gp_idx] = np.array([
                (1 - xi) * (1 - eta) / 4,
                (1 + xi) * (1 - eta) / 4,
                (1 + xi) * (1 + eta) / 4,
                (1 - xi) * (1 + eta) / 4
            ])
            gp_idx += 1

    xe = node_coords[elements, 0]
    ye = node_coords[elements, 1]

    Me_all = np.zeros((num_elems, 4, 4))

    for gp_idx in range(4):
        N = N_gp[gp_idx]
        dN_dxi = np.array([
            -(1 - gp[gp_idx % 2]) / 4,
            (1 - gp[gp_idx % 2]) / 4,
            (1 + gp[gp_idx % 2]) / 4,
            -(1 + gp[gp_idx % 2]) / 4
        ])
        dN_deta = np.array([
            -(1 - gp[gp_idx // 2]) / 4,
            -(1 + gp[gp_idx // 2]) / 4,
            (1 + gp[gp_idx // 2]) / 4,
            (1 - gp[gp_idx // 2]) / 4
        ])

        dx_dxi = xe @ dN_dxi
        dx_deta = xe @ dN_deta
        dy_dxi = ye @ dN_dxi
        dy_deta = ye @ dN_deta

        J = dx_dxi * dy_deta - dx_deta * dy_dxi

        w = np.abs(J) * gw[gp_idx // 2] * gw[gp_idx % 2]

        Me_all += rho_cp * (N[:, None] * N[None, :]) * w[:, None, None]

    Me_lumped = np.sum(Me_all, axis=2)

    rows = elements.reshape(-1)
    cols = rows.copy()
    data = Me_lumped.reshape(-1)

    M_global = csr_matrix((data, (rows, cols)), shape=(num_nodes, num_nodes))

    print(f"质量矩阵组装完成，大小: {num_nodes} x {num_nodes}")
    return M_global
