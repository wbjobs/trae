from flask import Flask, request, jsonify, send_file, Response
from flask_cors import CORS
import os
import numpy as np
import io
from point_cloud_processor import PointCloudProcessor, OctreeLOD, PointCloudCompressor

app = Flask(__name__)
CORS(app)

DATA_DIR = os.path.join(os.path.dirname(__file__), 'data')
os.makedirs(DATA_DIR, exist_ok=True)

processor = PointCloudProcessor()
loaded_point_clouds = {}
octree_cache = {}

@app.route('/api/files', methods=['GET'])
def list_files():
    files = []
    for f in os.listdir(DATA_DIR):
        if f.lower().endswith(('.las', '.laz', '.ply')):
            filepath = os.path.join(DATA_DIR, f)
            size = os.path.getsize(filepath)
            files.append({
                'name': f,
                'size': size,
                'path': filepath
            })
    return jsonify(files)

@app.route('/api/upload', methods=['POST'])
def upload_file():
    if 'file' not in request.files:
        return jsonify({'error': 'No file uploaded'}), 400
    
    file = request.files['file']
    if file.filename == '':
        return jsonify({'error': 'No file selected'}), 400
    
    ext = os.path.splitext(file.filename)[1].lower()
    if ext not in ['.las', '.laz', '.ply']:
        return jsonify({'error': 'Unsupported file format'}), 400
    
    filepath = os.path.join(DATA_DIR, file.filename)
    file.save(filepath)
    
    return jsonify({
        'success': True,
        'filename': file.filename,
        'filepath': filepath
    })

@app.route('/api/load/<filename>', methods=['GET'])
def load_point_cloud(filename):
    filepath = os.path.join(DATA_DIR, filename)
    
    if not os.path.exists(filepath):
        return jsonify({'error': 'File not found'}), 404
    
    try:
        points, colors, features = processor.load_point_cloud(filepath)
        
        loaded_point_clouds[filename] = {
            'points': points,
            'colors': colors,
            'features': features
        }
        
        center = np.mean(points, axis=0).tolist()
        bounds_min = np.min(points, axis=0).tolist()
        bounds_max = np.max(points, axis=0).tolist()
        
        return jsonify({
            'success': True,
            'count': len(points),
            'center': center,
            'bounds': {
                'min': bounds_min,
                'max': bounds_max
            }
        })
    except Exception as e:
        return jsonify({'error': str(e)}), 500

@app.route('/api/octree/<filename>', methods=['POST'])
def build_octree(filename):
    if filename not in loaded_point_clouds:
        return jsonify({'error': 'Point cloud not loaded'}), 404
    
    data = request.json or {}
    max_depth = data.get('max_depth', 8)
    max_points_per_node = data.get('max_points_per_node', 10000)
    
    pc = loaded_point_clouds[filename]
    
    octree = OctreeLOD(
        pc['points'],
        max_depth=max_depth,
        max_points_per_node=max_points_per_node
    )
    
    octree_cache[filename] = octree
    
    return jsonify({
        'success': True,
        'total_nodes': len(octree.nodes),
        'max_depth': octree.max_depth
    })

@app.route('/api/octree/<filename>/nodes', methods=['GET'])
def get_octree_nodes(filename):
    if filename not in octree_cache:
        return jsonify({'error': 'Octree not built'}), 404
    
    level = request.args.get('level', type=int)
    lod_bias = request.args.get('lod_bias', default=1.0, type=float)
    
    octree = octree_cache[filename]
    pc = loaded_point_clouds[filename]
    
    if level is not None:
        nodes = octree.get_nodes_at_level(level)
    else:
        nodes = octree.get_visible_nodes(np.eye(4), lod_bias=lod_bias)
    
    response_data = []
    
    for node in nodes:
        indices = node.point_indices
        if len(indices) == 0:
            continue
        
        node_points = pc['points'][indices]
        node_colors = pc['colors'][indices] if pc['colors'] is not None else None
        node_features = pc['features'][indices] if pc['features'] is not None else None
        
        downsample_factor = max(1, len(indices) // 50000)
        dp, dc, df = PointCloudCompressor.downsample(
            node_points, node_colors, node_features, downsample_factor
        )
        
        node_data = {
            'node_id': node.node_id,
            'depth': node.depth,
            'center': node.center.tolist(),
            'half_size': node.half_size,
            'count': len(dp),
            'points': dp.astype(np.float32).tolist()
        }
        
        if dc is not None:
            node_data['colors'] = dc.astype(np.float32).tolist()
        
        if df is not None:
            node_data['features'] = df.astype(np.float32).tolist()
        
        response_data.append(node_data)
    
    return jsonify(response_data)

@app.route('/api/octree/<filename>/node/<int:node_id>/binary', methods=['GET'])
def get_node_binary(filename, node_id):
    if filename not in octree_cache:
        return jsonify({'error': 'Octree not built'}), 404
    
    octree = octree_cache[filename]
    pc = loaded_point_clouds[filename]
    
    node = None
    for n in octree.nodes:
        if n.node_id == node_id:
            node = n
            break
    
    if node is None or len(node.point_indices) == 0:
        return jsonify({'error': 'Node not found or empty'}), 404
    
    indices = node.point_indices
    node_points = pc['points'][indices]
    node_colors = pc['colors'][indices] if pc['colors'] is not None else None
    node_features = pc['features'][indices] if pc['features'] is not None else None
    
    downsample_factor = max(1, len(indices) // 50000)
    dp, dc, df = PointCloudCompressor.downsample(
        node_points, node_colors, node_features, downsample_factor
    )
    
    compressed = PointCloudCompressor.compress_binary(dp, dc, df)
    
    return Response(
        compressed,
        mimetype='application/octet-stream',
        headers={
            'Content-Disposition': f'attachment; filename=node_{node_id}.bin',
            'X-Node-Id': str(node_id),
            'X-Point-Count': str(len(dp)),
            'X-Depth': str(node.depth)
        }
    )

@app.route('/api/points/<filename>/sample', methods=['GET'])
def sample_points(filename):
    if filename not in loaded_point_clouds:
        return jsonify({'error': 'Point cloud not loaded'}), 404
    
    count = request.args.get('count', default=100000, type=int)
    
    pc = loaded_point_clouds[filename]
    total = len(pc['points'])
    
    if count >= total:
        indices = np.arange(total)
    else:
        indices = np.random.choice(total, count, replace=False)
    
    sp = pc['points'][indices]
    sc = pc['colors'][indices] if pc['colors'] is not None else None
    sf = pc['features'][indices] if pc['features'] is not None else None
    
    result = {
        'points': sp.astype(np.float32).tolist(),
        'count': len(sp)
    }
    
    if sc is not None:
        result['colors'] = sc.astype(np.float32).tolist()
    
    if sf is not None:
        result['features'] = sf.astype(np.float32).tolist()
    
    return jsonify(result)

@app.route('/api/health', methods=['GET'])
def health_check():
    return jsonify({'status': 'ok'})

if __name__ == '__main__':
    print("Starting Point Cloud Backend Server...")
    print(f"Data directory: {DATA_DIR}")
    app.run(host='0.0.0.0', port=5000, debug=True)
