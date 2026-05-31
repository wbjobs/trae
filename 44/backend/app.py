from flask import Flask, request, jsonify
from flask_cors import CORS
from pdb_parser import parse_pdb_file
from structure_alignment import StructureAlignment
import os

app = Flask(__name__)
CORS(app)

UPLOAD_FOLDER = 'uploads'
os.makedirs(UPLOAD_FOLDER, exist_ok=True)

app.config['UPLOAD_FOLDER'] = UPLOAD_FOLDER
alignment = StructureAlignment()


@app.route('/api/parse-pdb', methods=['POST'])
def parse_pdb():
    if 'file' not in request.files:
        return jsonify({'error': 'No file provided'}), 400

    file = request.files['file']
    if file.filename == '':
        return jsonify({'error': 'No file selected'}), 400

    if file:
        try:
            content = file.read().decode('utf-8')
            result = parse_pdb_file(content)
            return jsonify(result)
        except Exception as e:
            return jsonify({'error': f'Failed to parse PDB file: {str(e)}'}), 500

    return jsonify({'error': 'Invalid request'}), 400


@app.route('/api/parse-pdb-content', methods=['POST'])
def parse_pdb_content():
    data = request.get_json()
    if not data or 'content' not in data:
        return jsonify({'error': 'No content provided'}), 400

    try:
        content = data['content']
        result = parse_pdb_file(content)
        return jsonify(result)
    except Exception as e:
        return jsonify({'error': f'Failed to parse PDB content: {str(e)}'}), 500


@app.route('/api/sample-pdb', methods=['GET'])
def get_sample_pdb():
    sample_path = os.path.join(os.path.dirname(__file__), '..', 'samples', 'example.pdb')
    try:
        with open(sample_path, 'r') as f:
            content = f.read()
        return jsonify({'content': content, 'filename': 'example.pdb'})
    except Exception as e:
        return jsonify({'error': f'Failed to load sample PDB: {str(e)}'}), 500


@app.route('/api/health', methods=['GET'])
def health_check():
    return jsonify({'status': 'ok', 'message': 'Molecule Viewer API is running'})


@app.route('/api/align-structures', methods=['POST'])
def align_structures():
    try:
        data = request.get_json()
        if not data or 'molecule1' not in data or 'molecule2' not in data:
            return jsonify({'error': 'Missing molecule data'}), 400

        molecule1 = data['molecule1']
        molecule2 = data['molecule2']
        match_by = data.get('match_by', 'residue')

        result = alignment.align_structures(molecule1, molecule2, match_by)
        return jsonify(result)
    except Exception as e:
        return jsonify({'error': f'Failed to align structures: {str(e)}'}), 500


@app.route('/api/compare-structures', methods=['POST'])
def compare_structures():
    try:
        data = request.get_json()
        if not data or 'molecule1' not in data or 'molecule2' not in data:
            return jsonify({'error': 'Missing molecule data'}), 400

        molecule1 = data['molecule1']
        molecule2 = data['molecule2']
        match_by = data.get('match_by', 'residue')
        rmsd_threshold = data.get('rmsd_threshold', 2.0)

        result = alignment.compare_structures(
            molecule1,
            molecule2,
            match_by=match_by,
            rmsd_threshold=rmsd_threshold
        )
        return jsonify(result)
    except Exception as e:
        return jsonify({'error': f'Failed to compare structures: {str(e)}'}), 500


@app.route('/api/calculate-rmsd', methods=['POST'])
def calculate_rmsd():
    try:
        data = request.get_json()
        if not data or 'coords1' not in data or 'coords2' not in data:
            return jsonify({'error': 'Missing coordinates'}), 400

        coords1 = data['coords1']
        coords2 = data['coords2']

        rmsd = alignment.calculate_rmsd(coords1, coords2)
        return jsonify({'rmsd': float(rmsd)})
    except Exception as e:
        return jsonify({'error': f'Failed to calculate RMSD: {str(e)}'}), 500


if __name__ == '__main__':
    app.run(debug=True, host='0.0.0.0', port=5000)
