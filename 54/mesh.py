import numpy as np


def generate_rectangular_mesh(Lx, Ly, nx, ny):
    x_nodes = np.linspace(0, Lx, nx)
    y_nodes = np.linspace(0, Ly, ny)

    X, Y = np.meshgrid(x_nodes, y_nodes)
    node_coords = np.column_stack((X.ravel(), Y.ravel()))

    num_nodes = nx * ny
    nodes = np.arange(num_nodes)

    elements = []
    for j in range(ny - 1):
        for i in range(nx - 1):
            n1 = j * nx + i
            n2 = j * nx + (i + 1)
            n3 = (j + 1) * nx + (i + 1)
            n4 = (j + 1) * nx + i
            elements.append([n1, n2, n3, n4])

    elements = np.array(elements, dtype=int)

    print(f"网格生成完成: {num_nodes} 个节点, {len(elements)} 个单元")
    return nodes, elements, node_coords
