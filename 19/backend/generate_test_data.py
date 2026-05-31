import numpy as np
from plyfile import PlyData, PlyElement
import os

def generate_test_point_cloud(output_path, num_points=2000000):
    print(f"Generating test point cloud with {num_points} points...")
    
    points = []
    colors = []
    intensity = []
    
    clusters = [
        {'center': [0, 0, 0], 'std': 5, 'count': int(num_points * 0.3), 'color': [1, 0, 0]},
        {'center': [20, 10, 0], 'std': 4, 'count': int(num_points * 0.25), 'color': [0, 1, 0]},
        {'center': [-15, 15, 10], 'std': 6, 'count': int(num_points * 0.2), 'color': [0, 0, 1]},
        {'center': [10, -20, 5], 'std': 3, 'count': int(num_points * 0.15), 'color': [1, 1, 0]},
        {'center': [-20, -10, -5], 'std': 5, 'count': num_points - int(num_points * 0.9), 'color': [1, 0, 1]},
    ]
    
    for cluster in clusters:
        cluster_points = np.random.normal(
            loc=cluster['center'],
            scale=cluster['std'],
            size=(cluster['count'], 3)
        )
        
        cluster_colors = np.tile(cluster['color'], (cluster['count'], 1))
        cluster_colors += np.random.normal(0, 0.1, cluster_colors.shape)
        cluster_colors = np.clip(cluster_colors, 0, 1)
        
        cluster_intensity = np.random.uniform(0.3, 0.9, cluster['count'])
        
        points.append(cluster_points)
        colors.append(cluster_colors)
        intensity.append(cluster_intensity)
    
    all_points = np.vstack(points)
    all_colors = np.vstack(colors)
    all_intensity = np.concatenate(intensity)
    
    permutation = np.random.permutation(len(all_points))
    all_points = all_points[permutation]
    all_colors = all_colors[permutation]
    all_intensity = all_intensity[permutation]
    
    vertex = np.empty(len(all_points), dtype=[
        ('x', 'f4'),
        ('y', 'f4'),
        ('z', 'f4'),
        ('red', 'u1'),
        ('green', 'u1'),
        ('blue', 'u1'),
        ('intensity', 'f4')
    ])
    
    vertex['x'] = all_points[:, 0]
    vertex['y'] = all_points[:, 1]
    vertex['z'] = all_points[:, 2]
    vertex['red'] = (all_colors[:, 0] * 255).astype(np.uint8)
    vertex['green'] = (all_colors[:, 1] * 255).astype(np.uint8)
    vertex['blue'] = (all_colors[:, 2] * 255).astype(np.uint8)
    vertex['intensity'] = all_intensity
    
    el = PlyElement.describe(vertex, 'vertex')
    
    os.makedirs(os.path.dirname(output_path), exist_ok=True)
    PlyData([el]).write(output_path)
    
    print(f"Test point cloud saved to {output_path}")
    print(f"Total points: {len(all_points)}")
    print(f"File size: {os.path.getsize(output_path) / 1024 / 1024:.2f} MB")
    
    return output_path

if __name__ == '__main__':
    data_dir = os.path.join(os.path.dirname(__file__), 'data')
    output_file = os.path.join(data_dir, 'test_point_cloud.ply')
    generate_test_point_cloud(output_file, num_points=2000000)
