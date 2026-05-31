import re
import numpy as np
from collections import defaultdict


ATOM_COLORS = {
    'H': '#FFFFFF',
    'C': '#909090',
    'N': '#3050F8',
    'O': '#FF0D0D',
    'F': '#90E050',
    'Cl': '#1FF01F',
    'Br': '#A62929',
    'I': '#940094',
    'S': '#FFFF30',
    'P': '#FF8000',
    'B': '#FFB5B5',
    'Li': '#CC80FF',
    'Na': '#AB5CF2',
    'K': '#8F40D4',
    'Ca': '#3DFF00',
    'Fe': '#E06633',
    'Zn': '#7D80B0',
    'Cu': '#C88033',
    'Mn': '#9C7AC7',
    'Mg': '#8AFF00',
    'Ni': '#50D050',
    'Co': '#FF8000',
    'Ag': '#C0C0C0',
    'Au': '#FFD123',
    'Hg': '#B8B8D0',
    'Pt': '#D0D0E0',
}

ATOM_RADII = {
    'H': 0.31,
    'C': 0.77,
    'N': 0.71,
    'O': 0.66,
    'F': 0.57,
    'Cl': 0.99,
    'Br': 1.14,
    'I': 1.33,
    'S': 1.04,
    'P': 1.07,
    'B': 0.82,
    'Li': 1.34,
    'Na': 1.54,
    'K': 1.96,
    'Ca': 1.74,
    'Fe': 1.17,
    'Zn': 1.10,
    'Cu': 1.17,
    'Mn': 1.17,
    'Mg': 1.45,
    'Ni': 1.15,
    'Co': 1.16,
    'Ag': 1.34,
    'Au': 1.34,
    'Hg': 1.49,
    'Pt': 1.38,
}

SECONDARY_STRUCTURE_COLORS = {
    'helix': '#FF6B6B',
    'sheet': '#4ECDC4',
    'coil': '#95A5A6',
    'turn': '#F39C12',
}


def get_element_color(element):
    return ATOM_COLORS.get(element, '#FFFFFF')


def get_element_radius(element):
    return ATOM_RADII.get(element, 1.0)


class PDBParser:
    def __init__(self):
        self.atoms = []
        self.bonds = []
        self.secondary_structures = []
        self.chains = defaultdict(list)
        self.residues = defaultdict(list)

    def parse(self, pdb_content):
        self.atoms = []
        self.bonds = []
        self.secondary_structures = []
        self.chains = defaultdict(list)
        self.residues = defaultdict(list)

        lines = pdb_content.split('\n')

        atom_index = 0
        atom_map = {}
        current_ss = None

        for line_num, line in enumerate(lines):
            record_type = line[:6].strip()

            if record_type == 'ATOM' or record_type == 'HETATM':
                atom = self._parse_atom_line(line, atom_index)
                if atom:
                    self.atoms.append(atom)
                    atom_map[atom['serial']] = atom_index
                    self.chains[atom['chain']].append(atom_index)
                    residue_key = f"{atom['chain']}_{atom['residue_seq']}_{atom['residue_name']}"
                    self.residues[residue_key].append(atom_index)
                    atom_index += 1

            elif record_type == 'CONECT':
                self._parse_conect_line(line, atom_map)

            elif record_type == 'HELIX':
                ss = self._parse_helix_line(line)
                if ss:
                    self.secondary_structures.append(ss)

            elif record_type == 'SHEET':
                ss = self._parse_sheet_line(line)
                if ss:
                    self.secondary_structures.append(ss)

            elif record_type == 'TURN':
                ss = self._parse_turn_line(line)
                if ss:
                    self.secondary_structures.append(ss)

        if not self.bonds:
            self._compute_bonds()

        self._assign_secondary_structure_to_atoms()

        return {
            'atoms': self.atoms,
            'bonds': self.bonds,
            'secondary_structures': self.secondary_structures,
            'chains': {k: v for k, v in self.chains.items()},
            'residues': {k: v for k, v in self.residues.items()},
            'stats': self._compute_stats()
        }

    def _parse_atom_line(self, line, index):
        try:
            serial = int(line[6:11].strip())
            name = line[12:16].strip()
            alt_loc = line[16:17].strip()
            residue_name = line[17:20].strip()
            chain = line[21:22].strip()
            residue_seq = int(line[22:26].strip())
            icode = line[26:27].strip()
            x = float(line[30:38].strip())
            y = float(line[38:46].strip())
            z = float(line[46:54].strip())
            occupancy = float(line[54:60].strip()) if line[54:60].strip() else 1.0
            temp_factor = float(line[60:66].strip()) if line[60:66].strip() else 0.0
            element = line[76:78].strip() if len(line) >= 78 else ''
            charge = line[78:80].strip() if len(line) >= 80 else ''

            if not element:
                element = self._infer_element_from_name(name)

            element = element.upper()
            if len(element) > 1 and element[1].islower():
                element = element[0].upper() + element[1].lower()

            return {
                'index': index,
                'serial': serial,
                'name': name,
                'alt_loc': alt_loc,
                'residue_name': residue_name,
                'chain': chain,
                'residue_seq': residue_seq,
                'icode': icode,
                'x': x,
                'y': y,
                'z': z,
                'position': [x, y, z],
                'occupancy': occupancy,
                'temp_factor': temp_factor,
                'element': element,
                'charge': charge,
                'color': get_element_color(element),
                'radius': get_element_radius(element),
                'secondary_structure': 'coil',
                'is_hetatm': line[:6].strip() == 'HETATM'
            }
        except (ValueError, IndexError) as e:
            return None

    def _infer_element_from_name(self, name):
        name = name.strip()
        if not name:
            return 'C'

        if len(name) >= 2 and name[1].isalpha() and not name[1].isdigit():
            element = name[:2].upper()
        else:
            element = name[0].upper()

        if element in ATOM_COLORS:
            return element
        if len(element) > 1 and element[0] in ATOM_COLORS:
            return element[0]
        return 'C'

    def _parse_conect_line(self, line, atom_map):
        try:
            parts = re.findall(r'\d+', line[6:])
            if len(parts) < 2:
                return

            atom1_serial = int(parts[0])
            if atom1_serial not in atom_map:
                return

            atom1_idx = atom_map[atom1_serial]

            for i in range(1, len(parts)):
                atom2_serial = int(parts[i])
                if atom2_serial in atom_map:
                    atom2_idx = atom_map[atom2_serial]
                    if atom1_idx < atom2_idx:
                        self.bonds.append({
                            'atom1': atom1_idx,
                            'atom2': atom2_idx,
                            'order': 1,
                            'type': 'covalent'
                        })
        except (ValueError, IndexError):
            pass

    def _parse_helix_line(self, line):
        try:
            serial = int(line[7:10].strip())
            helix_id = line[11:14].strip()
            chain_id = line[19:20].strip()
            start_res = int(line[21:25].strip())
            end_res = int(line[33:37].strip())
            helix_type = line[38:40].strip()

            return {
                'type': 'helix',
                'serial': serial,
                'id': helix_id,
                'chain': chain_id,
                'start_residue': start_res,
                'end_residue': end_res,
                'helix_type': helix_type,
                'color': SECONDARY_STRUCTURE_COLORS['helix']
            }
        except (ValueError, IndexError):
            return None

    def _parse_sheet_line(self, line):
        try:
            strand = int(line[7:10].strip())
            sheet_id = line[11:14].strip()
            chain_id = line[21:22].strip()
            start_res = int(line[22:26].strip())
            end_res = int(line[33:37].strip())
            sense = int(line[38:40].strip()) if line[38:40].strip() else 0

            return {
                'type': 'sheet',
                'strand': strand,
                'id': sheet_id,
                'chain': chain_id,
                'start_residue': start_res,
                'end_residue': end_res,
                'sense': sense,
                'color': SECONDARY_STRUCTURE_COLORS['sheet']
            }
        except (ValueError, IndexError):
            return None

    def _parse_turn_line(self, line):
        try:
            serial = int(line[7:10].strip())
            turn_id = line[11:14].strip()
            chain_id = line[19:20].strip()
            start_res = int(line[20:24].strip())
            end_res = int(line[31:35].strip())

            return {
                'type': 'turn',
                'serial': serial,
                'id': turn_id,
                'chain': chain_id,
                'start_residue': start_res,
                'end_residue': end_res,
                'color': SECONDARY_STRUCTURE_COLORS['turn']
            }
        except (ValueError, IndexError):
            return None

    def _compute_bonds(self, max_bond_length=1.9):
        positions = np.array([[a['x'], a['y'], a['z']] for a in self.atoms])
        n = len(positions)

        if n == 0:
            return

        for i in range(n):
            dists = np.linalg.norm(positions[i+1:] - positions[i], axis=1)
            close_atoms = np.where(dists < max_bond_length)[0]
            for j in close_atoms:
                atom2_idx = i + 1 + j
                self.bonds.append({
                    'atom1': i,
                    'atom2': atom2_idx,
                    'order': 1,
                    'type': 'covalent'
                })

    def _assign_secondary_structure_to_atoms(self):
        for ss in self.secondary_structures:
            chain = ss['chain']
            start_res = ss['start_residue']
            end_res = ss['end_residue']
            ss_type = ss['type']

            for atom_idx in self.chains.get(chain, []):
                atom = self.atoms[atom_idx]
                if start_res <= atom['residue_seq'] <= end_res:
                    atom['secondary_structure'] = ss_type

    def _compute_stats(self):
        element_counts = defaultdict(int)
        chain_counts = defaultdict(int)
        ss_counts = defaultdict(int)

        for atom in self.atoms:
            element_counts[atom['element']] += 1
            chain_counts[atom['chain']] += 1
            ss_counts[atom['secondary_structure']] += 1

        return {
            'num_atoms': len(self.atoms),
            'num_bonds': len(self.bonds),
            'num_chains': len(self.chains),
            'num_residues': len(self.residues),
            'element_counts': dict(element_counts),
            'chain_counts': dict(chain_counts),
            'secondary_structure_counts': dict(ss_counts)
        }


def parse_pdb_file(file_content):
    parser = PDBParser()
    return parser.parse(file_content)
