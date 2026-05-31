import numpy as np
from mesh import generate_rectangular_mesh
from assembly import assemble_stiffness_matrix, assemble_mass_matrix
from transient_solver import solve_transient_heat


def test_transient_solver():
    print("=" * 60)
    print("瞬态求解器验证测试")
    print("=" * 60)

    Lx, Ly = 1.0, 1.0
    nx, ny = 20, 20
    k = 1.0
    rho_cp = 1.0

    dt = 0.01
    num_steps = 50

    print(f"参数: {nx}x{ny} 网格, dt={dt}, 步数={num_steps}")

    nodes, elements, node_coords = generate_rectangular_mesh(Lx, Ly, nx, ny)
    K = assemble_stiffness_matrix(nodes, elements, node_coords, k)
    M = assemble_mass_matrix(nodes, elements, node_coords, rho_cp)

    T0 = np.full(len(nodes), 25.0)
    T_left = 100.0
    T_right = 0.0
    F = np.zeros(len(nodes))

    print("开始瞬态求解...")
    T_history = solve_transient_heat(
        K, M, F, T0, dt, num_steps,
        nodes, node_coords, Lx, Ly, T_left, T_right
    )

    print(f"\n求解完成，时间步历史形状: {T_history.shape}")
    print(f"初始温度范围: {T_history[0].min():.2f} ~ {T_history[0].max():.2f} °C")
    print(f"最终温度范围: {T_history[-1].min():.2f} ~ {T_history[-1].max():.2f} °C")

    x_coords = node_coords[:, 0]
    T_steady_analytical = 100.0 * (1.0 - x_coords)
    error_final = np.max(np.abs(T_history[-1] - T_steady_analytical))
    print(f"\n与稳态解析解的最终误差: {error_final:.2e}")

    left_nodes = np.where(np.abs(node_coords[:, 0]) < 1e-10)[0]
    right_nodes = np.where(np.abs(node_coords[:, 0] - Lx) < 1e-10)[0]

    bc_error_left = np.max(np.abs(T_history[:, left_nodes] - 100.0))
    bc_error_right = np.max(np.abs(T_history[:, right_nodes] - 0.0))
    print(f"左边界条件最大误差: {bc_error_left:.2e}")
    print(f"右边界条件最大误差: {bc_error_right:.2e}")

    temp_increasing = np.all(T_history[1:, left_nodes] >= T_history[:-1, left_nodes] - 1e-10)
    print(f"左边界附近温度随时间升高: {'✓' if temp_increasing else '✗'}")

    if error_final < 1.0 and bc_error_left < 1e-10 and bc_error_right < 1e-10:
        print("\n✓ 瞬态求解器验证通过！")
        return True
    else:
        print("\n✗ 瞬态求解器验证失败！")
        return False


if __name__ == "__main__":
    success = test_transient_solver()
    exit(0 if success else 1)
