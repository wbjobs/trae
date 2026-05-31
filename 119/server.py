import os
import io
import struct
import json
import time
import numpy as np
from flask import Flask, request, jsonify, send_file, Response
from flask_cors import CORS
import laspy
import draco

app = Flask(__name__)
CORS(app)

UPLOAD_DIR = os.path.join(os.path.dirname(__file__), 'uploads')
OUTPUT_DIR = os.path.join(os.path.dirname(__file__), 'outputs')
os.makedirs(UPLOAD_DIR, exist_ok=True)
os.makedirs(OUTPUT_DIR, exist_ok=True)


def read_las_file(filepath):
    las = laspy.read(filepath)
    points = np.column_stack((las.x, las.y, las.z)).astype(np.float32)

    has_rgb = False
    colors = None
    if hasattr(las, 'red') and hasattr(las, 'green') and hasattr(las, 'blue'):
        colors = np.column_stack((
            np.asarray(las.red, dtype=np.uint16),
            np.asarray(las.green, dtype=np.uint16),
            np.asarray(las.blue, dtype=np.uint16)
        ))
        if colors.max() > 255:
            colors = (colors >> 8).astype(np.uint8)
        else:
            colors = colors.astype(np.uint8)
        has_rgb = True

    return points, colors, has_rgb


def compress_draco(points, colors=None):
    encoder = draco.DracoEncoder()
    mesh = draco.DracoPointCloud()

    num_points = len(points)
    mesh.SetNumPoints(num_points)

    pos_buf = draco.DracoFloat32Array()
    for p in points:
        pos_buf.Append(float(p[0]))
        pos_buf.Append(float(p[1]))
        pos_buf.Append(float(p[2]))
    mesh.SetAttribute('POSITION', pos_buf)

    if colors is not None and len(colors) > 0:
        color_buf = draco.DracoUInt8Array()
        for c in colors:
            color_buf.Append(int(c[0]))
            color_buf.Append(int(c[1]))
            color_buf.Append(int(c[2]))
        mesh.SetAttribute('COLOR', color_buf)

    encoder.SetAttributeQuantization('POSITION', 11)
    encoder.SetAttributeQuantization('COLOR', 8)
    encoded = encoder.EncodePointCloudToDracoBuffer(mesh, True)

    return bytes(encoded)


def decompress_draco(encoded_bytes):
    decoder = draco.DracoDecoder()
    buffer = draco.DracoByteBuffer(list(encoded_bytes))

    mesh = draco.DracoPointCloud()
    decoder.DecodeBufferToPointCloud(buffer, mesh)

    positions = mesh.GetAttribute('POSITION')
    colors = mesh.GetAttribute('COLOR')

    points = []
    for i in range(mesh.NumPoints()):
        x = positions.GetValue(i * 3)
        y = positions.GetValue(i * 3 + 1)
        z = positions.GetValue(i * 3 + 2)
        points.append([x, y, z])

    colors_arr = None
    if colors is not None:
        colors_arr = []
        for i in range(mesh.NumPoints()):
            r = colors.GetValue(i * 3)
            g = colors.GetValue(i * 3 + 1)
            b = colors.GetValue(i * 3 + 2)
            colors_arr.append([r, g, b])

    return np.array(points, dtype=np.float32), np.array(colors_arr, dtype=np.uint8) if colors_arr else None


def compute_bounds(points):
    mins = points.min(axis=0)
    maxs = points.max(axis=0)
    return {
        'minX': float(mins[0]),
        'minY': float(mins[1]),
        'minZ': float(mins[2]),
        'maxX': float(maxs[0]),
        'maxY': float(maxs[1]),
        'maxZ': float(maxs[2])
    }


@app.route('/api/compress', methods=['POST'])
def compress():
    if 'file' not in request.files:
        return jsonify({'error': 'No file uploaded'}), 400

    file = request.files['file']
    if not file.filename.endswith(('.las', '.laz')):
        return jsonify({'error': 'Please upload a .las or .laz file'}), 400

    filepath = os.path.join(UPLOAD_DIR, file.filename)
    file.save(filepath)

    original_size = os.path.getsize(filepath)
    start_time = time.time()

    try:
        points, colors, has_rgb = read_las_file(filepath)
    except Exception as e:
        return jsonify({'error': f'Failed to read LAS file: {str(e)}'}), 400

    try:
        encoded = compress_draco(points, colors)
    except Exception as e:
        return jsonify({'error': f'Draco compression failed: {str(e)}'}), 500

    elapsed = time.time() - start_time
    compressed_size = len(encoded)
    ratio = original_size / compressed_size if compressed_size > 0 else 0

    bounds = compute_bounds(points)

    draco_filename = os.path.splitext(file.filename)[0] + '.drc'
    draco_path = os.path.join(OUTPUT_DIR, draco_filename)
    with open(draco_path, 'wb') as f:
        f.write(encoded)

    return jsonify({
        'numPoints': len(points),
        'hasRGB': has_rgb,
        'originalSize': original_size,
        'compressedSize': compressed_size,
        'ratio': round(ratio, 2),
        'compressionTime': round(elapsed, 3),
        'bounds': bounds,
        'filename': draco_filename
    })


@app.route('/api/download/<filename>', methods=['GET'])
def download(filename):
    filepath = os.path.join(OUTPUT_DIR, filename)
    if not os.path.exists(filepath):
        return jsonify({'error': 'File not found'}), 404
    return send_file(filepath, as_attachment=True)


@app.route('/api/decompress', methods=['POST'])
def decompress():
    if 'file' not in request.files:
        return jsonify({'error': 'No file uploaded'}), 400

    file = request.files['file']
    if not file.filename.endswith('.drc'):
        return jsonify({'error': 'Please upload a .drc file'}), 400

    encoded_bytes = file.read()

    try:
        points, colors = decompress_draco(encoded_bytes)
    except Exception as e:
        return jsonify({'error': f'Draco decompression failed: {str(e)}'}), 500

    bounds = compute_bounds(points)

    has_rgb = colors is not None
    return jsonify({
        'numPoints': len(points),
        'hasRGB': has_rgb,
        'bounds': bounds
    })


@app.route('/api/draco-data/<filename>', methods=['GET'])
def get_draco_data(filename):
    filepath = os.path.join(OUTPUT_DIR, filename)
    if not os.path.exists(filepath):
        return jsonify({'error': 'File not found'}), 404

    with open(filepath, 'rb') as f:
        data = f.read()

    return Response(
        data,
        mimetype='application/octet-stream',
        headers={
            'Content-Disposition': f'attachment; filename={filename}'
        }
    )


@app.route('/api/points-data/<filename>', methods=['GET'])
def get_points_data(filename):
    las_path = os.path.join(UPLOAD_DIR, filename)
    if not os.path.exists(las_path):
        return jsonify({'error': 'File not found'}), 404

    try:
        points, colors, has_rgb = read_las_file(las_path)
    except Exception as e:
        return jsonify({'error': f'Failed to read LAS file: {str(e)}'}), 400

    max_points = int(request.args.get('max', 500000))
    if len(points) > max_points:
        step = len(points) // max_points
        indices = np.arange(0, len(points), step)[:max_points]
        points = points[indices]
        if colors is not None:
            colors = colors[indices]

    pos_bytes = points.tobytes()

    color_bytes = b''
    if colors is not None:
        color_bytes = colors.tobytes()

    bounds = compute_bounds(points)

    header = struct.pack(
        '<II',
        len(points),
        len(colors) if colors is not None else 0
    )
    header += struct.pack('<ffffff',
                          bounds['minX'], bounds['minY'], bounds['minZ'],
                          bounds['maxX'], bounds['maxY'], bounds['maxZ'])

    response_data = header + pos_bytes + color_bytes

    return Response(
        response_data,
        mimetype='application/octet-stream'
    )


@app.route('/api/sample', methods=['GET'])
def generate_sample():
    num_points = int(request.args.get('count', 100000))

    t = np.random.uniform(0, 4 * np.pi, num_points)
    r = np.random.uniform(0, 100, num_points)
    x = r * np.cos(t)
    y = r * np.sin(t)
    z = np.random.uniform(-20, 20, num_points) + np.sin(t) * 5
    points = np.column_stack((x, y, z)).astype(np.float32)

    colors = np.column_stack((
        np.random.randint(0, 256, num_points, dtype=np.uint8),
        np.random.randint(0, 256, num_points, dtype=np.uint8),
        np.random.randint(0, 256, num_points, dtype=np.uint8)
    )).astype(np.uint8)

    import laspy
    header = laspy.LasHeader(point_format=3, version='1.2')
    las = laspy.LasData(header)
    las.x = x
    las.y = y
    las.z = z
    las.red = (colors[:, 0].astype(np.uint16) << 8).astype(np.uint16)
    las.green = (colors[:, 1].astype(np.uint16) << 8).astype(np.uint16)
    las.blue = (colors[:, 2].astype(np.uint16) << 8).astype(np.uint16)

    sample_path = os.path.join(OUTPUT_DIR, 'sample.las')
    las.write(sample_path)

    with open(sample_path, 'rb') as f:
        return Response(
            f.read(),
            mimetype='application/octet-stream',
            headers={'Content-Disposition': 'attachment; filename=sample.las'}
        )


if __name__ == '__main__':
    app.run(debug=True, port=5000)
