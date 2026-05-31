import numpy as np
from mesh import generate_rectangular_mesh
from assembly import assemble_stiffness_matrix
from solver import apply_boundary_conditions, solve_heat_equation
from postprocess import plot_temperature_distribution, save_temperature_csv


def main():
    Lx, Ly = 1.0, 1.0
    nx, ny = 50, 50
    k = 1.0

    nodes, elements, node_coords = generate_rectangular_mesh(Lx, Ly, nx, ny)

    K_global = assemble_stiffness_matrix(nodes, elements, node_coords, k)

    T_left = 100.0
    T_right = 0.0
    F = np.zeros(len(nodes))

    K, F = apply_boundary_conditions(K_global, F, nodes, node_coords, Lx, Ly, T_left, T_right)

    T = solve_heat_equation(K, F)

    plot_temperature_distribution(node_coords, T, nx, ny)
    save_temperature_csv(node_coords, T, "temperature_distribution.csv")

    print(f"计算完成！温度范围: {T.min():.2f} ~ {T.max():.2f} °C")
    print(f"温度分布图已保存为 temperature_distribution.png")
    print(f"温度数据已保存为 temperature_distribution.csv")


if __name__ == "__main__":
    main()
