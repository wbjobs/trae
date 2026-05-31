import numpy as np
import matplotlib
matplotlib.use('TkAgg')
import matplotlib.pyplot as plt
from mesh import generate_rectangular_mesh
from assembly import assemble_stiffness_matrix, assemble_mass_matrix
from transient_solver import solve_transient_heat
from postprocess import TransientVisualizer, save_transient_csv


def main():
    Lx, Ly = 1.0, 1.0
    nx, ny = 30, 30
    k = 1.0
    rho_cp = 1.0

    dt = 0.01
    num_steps = 100

    print("=" * 60)
    print("瞬态热传导求解器 - 隐式欧拉法")
    print("=" * 60)
    print(f"几何尺寸: {Lx}m x {Ly}m")
    print(f"网格: {nx} x {ny} = {nx * ny} 节点")
    print(f"时间步长: {dt} s")
    print(f"时间步数: {num_steps}")
    print(f"总模拟时间: {dt * num_steps} s")
    print(f"热传导系数 k: {k}")
    print(f"体积热容 ρc_p: {rho_cp}")
    print("=" * 60)

    nodes, elements, node_coords = generate_rectangular_mesh(Lx, Ly, nx, ny)

    K = assemble_stiffness_matrix(nodes, elements, node_coords, k)
    M = assemble_mass_matrix(nodes, elements, node_coords, rho_cp)

    T0 = np.full(len(nodes), 25.0)

    T_left = 100.0
    T_right = 0.0
    F = np.zeros(len(nodes))

    T_min = 0.0
    T_max = 100.0

    visualizer = TransientVisualizer(node_coords, nx, ny, T_min, T_max, num_steps, dt)

    def callback(step, total_steps, T):
        visualizer.update(step, T)

    print("\n开始瞬态求解...")
    T_history = solve_transient_heat(
        K, M, F, T0, dt, num_steps,
        nodes, node_coords, Lx, Ly, T_left, T_right,
        callback=callback
    )

    visualizer.finish()

    print("\n正在保存结果...")
    save_transient_csv(node_coords, T_history, dt, "transient_temperature.csv")
    print("瞬态温度数据已保存为 transient_temperature.csv")

    print("\n正在导出GIF动画...")
    visualizer.save_animation("transient_heat_conduction.gif", fps=10)

    print("\n" + "=" * 60)
    print(f"求解完成！最终温度范围: {T_history[-1].min():.2f} ~ {T_history[-1].max():.2f} °C")
    print("=" * 60)


if __name__ == "__main__":
    main()
