import json
import gzip
import base64
import numpy as np
from flask import Flask, request, jsonify, Response
from flask_cors import CORS
from mesh import TriangleMesh, create_initial_mesh
from solver import solve_poisson, compute_l2_error
from refine import refine_by_click, refine_by_estimator
from estimator import ErrorEstimator

app = Flask(__name__)
CORS(app)

STATE = {
    'mesh': None,
    'u': None,
    'refinement_step': 0,
    'history': []
}


def compress_data(data):
    json_str = json.dumps(data)
    compressed = gzip.compress(json_str.encode('utf-8'))
    return base64.b64encode(compressed).decode('utf-8')


def decompress_data(encoded):
    compressed = base64.b64decode(encoded.encode('utf-8'))
    json_str = gzip.decompress(compressed).decode('utf-8')
    return json.loads(json_str)


@app.route('/api/health', methods=['GET'])
def health():
    return jsonify({'status': 'ok'})


@app.route('/api/initial', methods=['GET'])
def get_initial_mesh():
    mesh = create_initial_mesh(nx=12, ny=12)
    u = solve_poisson(mesh)
    l2_error = compute_l2_error(mesh, u)
    STATE['mesh'] = mesh
    STATE['u'] = u
    STATE['refinement_step'] = 0
    STATE['history'] = [{
        'step': 0,
        'num_nodes': mesh.get_num_nodes(),
        'num_cells': mesh.get_num_cells(),
        'l2_error': float(l2_error)
    }]
    estimator = ErrorEstimator(mesh, u)
    eta = estimator.compute_combined_indicator()
    response = {
        'mesh': mesh.to_dict(),
        'u': u.tolist(),
        'eta': eta.tolist(),
        'statistics': {
            'num_nodes': mesh.get_num_nodes(),
            'num_cells': mesh.get_num_cells(),
            'l2_error': float(l2_error),
            'refinement_step': 0
        }
    }
    return Response(
        response=json.dumps({'compressed': compress_data(response)}),
        status=200,
        mimetype='application/json'
    )


@app.route('/api/refine/click', methods=['POST'])
def refine_on_click():
    data = request.get_json()
    if not data or 'x' not in data or 'y' not in data:
        return jsonify({'error': 'Missing coordinates'}), 400
    click_point = np.array([data['x'], data['y']])
    if STATE['mesh'] is None or STATE['u'] is None:
        return jsonify({'error': 'No mesh initialized'}), 400
    num_levels = data.get('levels', 1)
    new_mesh, refine_history = refine_by_click(
        STATE['mesh'], click_point, STATE['u'], num_levels=num_levels
    )
    u_new = solve_poisson(new_mesh)
    l2_error = compute_l2_error(new_mesh, u_new)
    STATE['refinement_step'] += 1
    STATE['mesh'] = new_mesh
    STATE['u'] = u_new
    STATE['history'].append({
        'step': STATE['refinement_step'],
        'num_nodes': new_mesh.get_num_nodes(),
        'num_cells': new_mesh.get_num_cells(),
        'l2_error': float(l2_error),
        'refinement': refine_history
    })
    estimator = ErrorEstimator(new_mesh, u_new)
    eta = estimator.compute_combined_indicator()
    response = {
        'mesh': new_mesh.to_dict(),
        'u': u_new.tolist(),
        'eta': eta.tolist(),
        'statistics': {
            'num_nodes': new_mesh.get_num_nodes(),
            'num_cells': new_mesh.get_num_cells(),
            'l2_error': float(l2_error),
            'refinement_step': STATE['refinement_step'],
            'refinement_history': refine_history
        }
    }
    return Response(
        response=json.dumps({'compressed': compress_data(response)}),
        status=200,
        mimetype='application/json'
    )


@app.route('/api/refine/estimator', methods=['POST'])
def refine_by_estimator_endpoint():
    if STATE['mesh'] is None or STATE['u'] is None:
        return jsonify({'error': 'No mesh initialized'}), 400
    new_mesh, refine_history = refine_by_estimator(
        STATE['mesh'], STATE['u'], num_levels=1
    )
    u_new = solve_poisson(new_mesh)
    l2_error = compute_l2_error(new_mesh, u_new)
    STATE['refinement_step'] += 1
    STATE['mesh'] = new_mesh
    STATE['u'] = u_new
    STATE['history'].append({
        'step': STATE['refinement_step'],
        'num_nodes': new_mesh.get_num_nodes(),
        'num_cells': new_mesh.get_num_cells(),
        'l2_error': float(l2_error),
        'refinement': refine_history
    })
    estimator = ErrorEstimator(new_mesh, u_new)
    eta = estimator.compute_combined_indicator()
    response = {
        'mesh': new_mesh.to_dict(),
        'u': u_new.tolist(),
        'eta': eta.tolist(),
        'statistics': {
            'num_nodes': new_mesh.get_num_nodes(),
            'num_cells': new_mesh.get_num_cells(),
            'l2_error': float(l2_error),
            'refinement_step': STATE['refinement_step'],
            'refinement_history': refine_history
        }
    }
    return Response(
        response=json.dumps({'compressed': compress_data(response)}),
        status=200,
        mimetype='application/json'
    )


@app.route('/api/solve', methods=['POST'])
def solve():
    data = request.get_json()
    if not data or 'mesh' not in data:
        return jsonify({'error': 'Missing mesh data'}), 400
    mesh = TriangleMesh.from_dict(data['mesh'])
    u = solve_poisson(mesh)
    l2_error = compute_l2_error(mesh, u)
    estimator = ErrorEstimator(mesh, u)
    eta = estimator.compute_combined_indicator()
    response = {
        'u': u.tolist(),
        'eta': eta.tolist(),
        'statistics': {
            'l2_error': float(l2_error)
        }
    }
    return Response(
        response=json.dumps({'compressed': compress_data(response)}),
        status=200,
        mimetype='application/json'
    )


@app.route('/api/history', methods=['GET'])
def get_history():
    return jsonify(STATE['history'])


@app.route('/api/reset', methods=['POST'])
def reset():
    return get_initial_mesh()


if __name__ == '__main__':
    print("Starting Scientific Computing Server...")
    print("Endpoints:")
    print("  GET  /api/health     - Health check")
    print("  GET  /api/initial    - Get initial mesh and solution")
    print("  POST /api/refine/click   - Refine mesh by clicking")
    print("  POST /api/refine/estimator - Refine mesh by error estimator")
    print("  POST /api/solve      - Solve on custom mesh")
    print("  GET  /api/history    - Get refinement history")
    print("  POST /api/reset      - Reset to initial state")
    app.run(host='0.0.0.0', port=5000, debug=True)
