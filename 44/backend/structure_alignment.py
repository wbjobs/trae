import numpy as np
from collections import defaultdict


class StructureAlignment:
    def __init__(self):
        pass

    @staticmethod
    def kabsch_alignment(coords1, coords2):
        """
        使用 Kabsch 算法将 coords2 对齐到 coords1
        返回对齐后的 coords2 和旋转矩阵
        """
        coords1 = np.array(coords1)
        coords2 = np.array(coords2)

        assert coords1.shape == coords2.shape, "坐标数组形状不匹配"
        assert coords1.shape[1] == 3, "坐标必须是 3D 的"

        n = coords1.shape[0]
        if n < 3:
            return coords2, np.eye(3)

        centroid1 = np.mean(coords1, axis=0)
        centroid2 = np.mean(coords2, axis=0)

        coords1_centered = coords1 - centroid1
        coords2_centered = coords2 - centroid2

        H = coords2_centered.T @ coords1_centered

        U, S, Vt = np.linalg.svd(H)
        V = Vt.T
        Ut = U.T

        d = np.linalg.det(V @ Ut)
        if d < 0:
            V[:, -1] *= -1

        R = V @ Ut
        t = centroid1 - (R @ centroid2)

        coords2_aligned = (R @ coords2.T).T + t

        return coords2_aligned, R, t

    @staticmethod
    def calculate_rmsd(coords1, coords2):
        """计算两个坐标集之间的 RMSD（均方根偏差）"""
        coords1 = np.array(coords1)
        coords2 = np.array(coords2)
        diff = coords1 - coords2
        return np.sqrt(np.mean(np.sum(diff ** 2, axis=1)))

    @staticmethod
    def calculate_per_atom_rmsd(coords1, coords2):
        """计算每个原子的 RMSD"""
        coords1 = np.array(coords1)
        coords2 = np.array(coords2)
        diff = coords1 - coords2
        return np.sqrt(np.sum(diff ** 2, axis=1))

    @staticmethod
    def find_common_atoms(atoms1, atoms2, match_by='residue'):
        """
        找出两个分子中的共同原子
        match_by: 'residue' (按残基+原子名) 或 'element' (按元素)
        """
        common_pairs = []
        atoms1_used = set()
        atoms2_used = set()

        if match_by == 'residue':
            def get_key(atom):
                return (atom.get('chain', ''),
                        atom.get('residue_seq', 0),
                        atom.get('residue_name', ''),
                        atom.get('name', ''))
        else:
            def get_key(atom):
                return atom.get('element', 'C')

        atom_map1 = defaultdict(list)
        for i, atom in enumerate(atoms1):
            atom_map1[get_key(atom)].append(i)

        atom_map2 = defaultdict(list)
        for i, atom in enumerate(atoms2):
            atom_map2[get_key(atom)].append(i)

        for key in atom_map1:
            if key in atom_map2:
                indices1 = atom_map1[key]
                indices2 = atom_map2[key]
                min_len = min(len(indices1), len(indices2))
                for i in range(min_len):
                    common_pairs.append((indices1[i], indices2[i]))

        return common_pairs

    def align_structures(self, molecule1, molecule2, match_by='residue'):
        """
        对齐两个分子结构
        返回对齐后的 molecule2 和对齐信息
        """
        atoms1 = molecule1['atoms']
        atoms2 = molecule2['atoms']

        common_pairs = self.find_common_atoms(atoms1, atoms2, match_by)

        if len(common_pairs) < 3:
            return {
                'aligned': False,
                'message': '共同原子太少，无法对齐（至少需要 3 个）',
                'common_atoms': len(common_pairs)
            }

        coords1 = []
        coords2 = []
        for idx1, idx2 in common_pairs:
            coords1.append([atoms1[idx1]['x'], atoms1[idx1]['y'], atoms1[idx1]['z']])
            coords2.append([atoms2[idx2]['x'], atoms2[idx2]['y'], atoms2[idx2]['z']])

        coords2_aligned, R, t = self.kabsch_alignment(coords1, coords2)
        rmsd = self.calculate_rmsd(coords1, coords2_aligned)
        per_atom_rmsd = self.calculate_per_atom_rmsd(coords1, coords2_aligned)

        aligned_atoms2 = []
        for i, atom in enumerate(atoms2):
            original_pos = np.array([atom['x'], atom['y'], atom['z']])
            aligned_pos = (R @ original_pos.T).T + t
            aligned_atom = {
                **atom,
                'x': float(aligned_pos[0]),
                'y': float(aligned_pos[1]),
                'z': float(aligned_pos[2]),
                'position': [float(aligned_pos[0]), float(aligned_pos[1]), float(aligned_pos[2])]
            }
            aligned_atoms2.append(aligned_atom)

        atom_diffs = []
        for i, (idx1, idx2) in enumerate(common_pairs):
            atom_diffs.append({
                'atom1_index': idx1,
                'atom2_index': idx2,
                'atom1': atoms1[idx1],
                'atom2': aligned_atoms2[idx2],
                'rmsd': float(per_atom_rmsd[i])
            })

        aligned_molecule2 = {
            **molecule2,
            'atoms': aligned_atoms2
        }

        return {
            'aligned': True,
            'rmsd': float(rmsd),
            'common_atoms': len(common_pairs),
            'total_atoms_1': len(atoms1),
            'total_atoms_2': len(atoms2),
            'rotation_matrix': R.tolist(),
            'translation_vector': t.tolist(),
            'per_atom_rmsd': per_atom_rmsd.tolist(),
            'atom_diffs': atom_diffs,
            'aligned_molecule': aligned_molecule2,
            'common_pairs': common_pairs
        }

    def calculate_similarity(self, alignment_result, rmsd_threshold=2.0):
        """
        基于对齐结果计算分子相似度
        返回 0-1 之间的相似度分数
        """
        if not alignment_result.get('aligned', False):
            return 0.0

        rmsd = alignment_result['rmsd']
        common_atoms = alignment_result['common_atoms']
        total_atoms_1 = alignment_result['total_atoms_1']
        total_atoms_2 = alignment_result['total_atoms_2']

        coverage = common_atoms / max(total_atoms_1, total_atoms_2)
        rmsd_score = max(0, 1 - (rmsd / rmsd_threshold)) if rmsd < rmsd_threshold else 0
        similarity = coverage * (0.5 + 0.5 * rmsd_score)

        per_atom_rmsd = alignment_result['per_atom_rmsd']
        if per_atom_rmsd:
            well_aligned = sum(1 for r in per_atom_rmsd if r < rmsd_threshold)
            alignment_quality = well_aligned / len(per_atom_rmsd)
            similarity = similarity * 0.7 + alignment_quality * 0.3

        return float(similarity)

    def compare_structures(self, molecule1, molecule2, match_by='residue', rmsd_threshold=2.0):
        """
        完整的结构比较流程
        """
        alignment_result = self.align_structures(molecule1, molecule2, match_by)

        if not alignment_result['aligned']:
            return {
                'comparison': False,
                'message': alignment_result['message']
            }

        similarity = self.calculate_similarity(alignment_result, rmsd_threshold)

        diff_regions = []
        atom_diffs = alignment_result['atom_diffs']
        atom_diffs_sorted = sorted(atom_diffs, key=lambda x: x['rmsd'], reverse=True)

        high_diff_atoms = [d for d in atom_diffs if d['rmsd'] > rmsd_threshold]
        medium_diff_atoms = [d for d in atom_diffs if 1.0 < d['rmsd'] <= rmsd_threshold]
        low_diff_atoms = [d for d in atom_diffs if d['rmsd'] <= 1.0]

        return {
            'comparison': True,
            'alignment': alignment_result,
            'similarity': similarity,
            'rmsd': alignment_result['rmsd'],
            'summary': {
                'total_atoms_1': alignment_result['total_atoms_1'],
                'total_atoms_2': alignment_result['total_atoms_2'],
                'common_atoms': alignment_result['common_atoms'],
                'high_diff_atoms': len(high_diff_atoms),
                'medium_diff_atoms': len(medium_diff_atoms),
                'low_diff_atoms': len(low_diff_atoms),
                'max_rmsd': float(max(alignment_result['per_atom_rmsd'])) if alignment_result['per_atom_rmsd'] else 0,
                'mean_rmsd': float(np.mean(alignment_result['per_atom_rmsd'])) if alignment_result['per_atom_rmsd'] else 0,
                'median_rmsd': float(np.median(alignment_result['per_atom_rmsd'])) if alignment_result['per_atom_rmsd'] else 0,
            },
            'high_diff_atoms': high_diff_atoms[:100],
            'atom_diffs': atom_diffs_sorted[:100],
            'aligned_molecule_2': alignment_result['aligned_molecule']
        }
