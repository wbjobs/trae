import numpy as np
import matplotlib.pyplot as plt
import csv
from matplotlib.animation import FuncAnimation, PillowWriter
from tqdm import tqdm


def plot_temperature_distribution(node_coords, T, nx, ny):
    X = node_coords[:, 0].reshape(ny, nx)
    Y = node_coords[:, 1].reshape(ny, nx)
    T_grid = T.reshape(ny, nx)

    plt.figure(figsize=(10, 8))
    contour = plt.contourf(X, Y, T_grid, levels=50, cmap='jet')
    plt.colorbar(contour, label='Temperature (°C)')
    plt.xlabel('X (m)')
    plt.ylabel('Y (m)')
    plt.title('Steady-State Heat Conduction - Temperature Distribution')
    plt.grid(True, alpha=0.3)
    plt.axis('equal')
    plt.tight_layout()
    plt.savefig('temperature_distribution.png', dpi=300)
    plt.close()


def save_temperature_csv(node_coords, T, filename):
    with open(filename, 'w', newline='') as f:
        writer = csv.writer(f)
        writer.writerow(['Node', 'X (m)', 'Y (m)', 'Temperature (°C)'])
        for i, (x, y) in enumerate(node_coords):
            writer.writerow([i, f'{x:.6f}', f'{y:.6f}', f'{T[i]:.6f}'])


class TransientVisualizer:
    def __init__(self, node_coords, nx, ny, T_min, T_max, total_steps, dt):
        self.node_coords = node_coords
        self.nx = nx
        self.ny = ny
        self.X = node_coords[:, 0].reshape(ny, nx)
        self.Y = node_coords[:, 1].reshape(ny, nx)
        self.T_min = T_min
        self.T_max = T_max
        self.total_steps = total_steps
        self.dt = dt

        self.fig, self.ax = plt.subplots(figsize=(10, 8))
        self.contour = None
        self.cbar = None
        self.title = None

        self.pbar = tqdm(total=total_steps, desc="计算进度", unit="步")
        self.frames = []

        self._setup_plot()

    def _setup_plot(self):
        T_dummy = np.zeros(self.ny * self.nx).reshape(self.ny, self.nx)
        self.contour = self.ax.contourf(self.X, self.Y, T_dummy,
                                        levels=np.linspace(self.T_min, self.T_max, 50),
                                        cmap='jet', vmin=self.T_min, vmax=self.T_max)
        self.cbar = plt.colorbar(self.contour, ax=self.ax, label='Temperature (°C)')
        self.ax.set_xlabel('X (m)')
        self.ax.set_ylabel('Y (m)')
        self.title = self.ax.set_title('')
        self.ax.grid(True, alpha=0.3)
        self.ax.axis('equal')
        plt.tight_layout()

    def update(self, step, T):
        T_grid = T.reshape(self.ny, self.nx)
        current_time = (step + 1) * self.dt

        for coll in self.contour.collections:
            coll.remove()
        self.contour = self.ax.contourf(self.X, self.Y, T_grid,
                                        levels=np.linspace(self.T_min, self.T_max, 50),
                                        cmap='jet', vmin=self.T_min, vmax=self.T_max)

        self.title.set_text(f'Transient Heat Conduction - Time: {current_time:.3f} s (Step {step + 1}/{self.total_steps})')

        self.pbar.update(1)
        self.fig.canvas.draw_idle()
        self.fig.canvas.flush_events()

        self.frames.append(T_grid.copy())

    def finish(self):
        self.pbar.close()
        plt.close(self.fig)

    def save_animation(self, filename, fps=10):
        print(f"正在导出动画到 {filename}...")

        fig, ax = plt.subplots(figsize=(10, 8))
        contour = ax.contourf(self.X, self.Y, self.frames[0],
                              levels=np.linspace(self.T_min, self.T_max, 50),
                              cmap='jet', vmin=self.T_min, vmax=self.T_max)
        cbar = plt.colorbar(contour, ax=ax, label='Temperature (°C)')
        ax.set_xlabel('X (m)')
        ax.set_ylabel('Y (m)')
        title = ax.set_title('')
        ax.grid(True, alpha=0.3)
        ax.axis('equal')
        plt.tight_layout()

        def update_frame(i):
            for coll in contour.collections:
                coll.remove()
            contour = ax.contourf(self.X, self.Y, self.frames[i],
                                  levels=np.linspace(self.T_min, self.T_max, 50),
                                  cmap='jet', vmin=self.T_min, vmax=self.T_max)
            current_time = (i + 1) * self.dt
            title.set_text(f'Transient Heat Conduction - Time: {current_time:.3f} s (Frame {i + 1}/{len(self.frames)})')
            return contour.collections

        anim = FuncAnimation(fig, update_frame, frames=len(self.frames), blit=False, interval=1000 / fps)

        writer = PillowWriter(fps=fps)
        anim.save(filename, writer=writer, dpi=150)
        plt.close(fig)
        print(f"动画已保存到 {filename}")


def save_transient_csv(node_coords, T_history, dt, filename):
    with open(filename, 'w', newline='') as f:
        writer = csv.writer(f)
        header = ['Node', 'X (m)', 'Y (m)'] + [f'T_{i * dt:.3f}s' for i in range(len(T_history))]
        writer.writerow(header)
        for i, (x, y) in enumerate(node_coords):
            row = [i, f'{x:.6f}', f'{y:.6f}'] + [f'{T_history[j, i]:.6f}' for j in range(len(T_history))]
            writer.writerow(row)
