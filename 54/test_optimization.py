import numpy as np
from mesh import generate_rectangular_mesh
from assembly import assemble_stiffness_matrix
from solver import apply_boundary_conditions, solve_heat_equation


def test_small_grid():
    print("=" * 60)
    print("测试1: 小网格验证 (5x5)")
    print("=" * 60)

    Lx, Ly = 1.0, 1.0
    nx, ny = 5, 5
    k = 1.0

    nodes, elements, node_coords = generate_rectangular_mesh(Lx, Ly, nx, ny)

    K = assemble_stiffness_matrix(nodes, elements, node_coords, k)
    print(f"矩阵稀疏度: {K.nnz / (nx * ny * nx * ny):.6f}")

    F = np.zeros(len(nodes))
    K_bc, F_bc = apply_boundary_conditions(K, F, nodes, node_coords, Lx, Ly, 100.0, 0.0)

    T = solve_heat_equation(K_bc, F_bc)

    x_coords = node_coords[:, 0]
    T_analytical = 100.0 * (1.0 - x_coords)
    error = np.max(np.abs(T - T_analytical))

    print(f"\n温度结果对比:")
    print(f"  FEM 解范围: {T.min():.4f} ~ {T.max():.4f}")
    print(f"  解析解范围: {T_analytical.min():.4f} ~ {T_analytical.max():.4f}")
    print(f"  最大误差: {error:.2e}")

    if error < 1e-10:
        print("  ✓ 结果正确！与解析解一致")
    else:
        print("  ✗ 结果异常！")

    return error < 1e-10


def test_medium_grid():
    print("\n" + "=" * 60)
    print("测试2: 中等网格 (100x100 = 10000节点)")
    print("=" * 60)

    Lx, Ly = 1.0, 1.0
    nx, ny = 100, 100
    k = 1.0

    import time
    start = time.time()

    nodes, elements, node_coords = generate_rectangular_mesh(Lx, Ly, nx, ny)

    mesh_time = time.time()
    K = assemble_stiffness_matrix(nodes, elements, node_coords, k)
    assembly_time = time.time()

    F = np.zeros(len(nodes))
    K_bc, F_bc = apply_boundary_conditions(K, F, nodes, node_coords, Lx, Ly, 100.0, 0.0)
    bc_time = time.time()

    T = solve_heat_equation(K_bc, F_bc)
    solve_time = time.time()

    x_coords = node_coords[:, 0]
    T_analytical = 100.0 * (1.0 - x_coords)
    error = np.max(np.abs(T - T_analytical))

    print(f"\n性能统计:")
    print(f"  网格生成: {mesh_time - start:.3f}s")
    print(f"  矩阵组装: {assembly_time - mesh_time:.3f}s")
    print(f"  边界条件: {bc_time - assembly_time:.3f}s")
    print(f"  方程求解: {solve_time - bc_time:.3f}s")
    print(f"  总耗时: {solve_time - start:.3f}s")

    print(f"\n内存估计:")
    print(f"  K非零元素: {K.nnz}")
    print(f"  K内存: {K.data.nbytes / 1024 / 1024:.2f} MB")

    print(f"\n结果验证:")
    print(f"  最大误差: {error:.2e}")

    if error < 1e-10:
        print("  ✓ 结果正确！")
        return True
    else:
        print("  ✗ 结果异常！")
        return False


if __name__ == "__main__":
    test1_passed = test_small_grid()
    test2_passed = test_medium_grid()

    print("\n" + "=" * 60)
    if test1_passed and test2_passed:
        print("所有测试通过！✓")
    else:
        print("部分测试失败！✗")
    print("=" * 60)
