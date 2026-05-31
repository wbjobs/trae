#!/usr/bin/env python3
import math
import sys

def generate_large_pdb(num_atoms_per_chain=1500, num_chains=4, filename='samples/large_performance_test.pdb'):
    chains = ['A', 'B', 'C', 'D', 'E', 'F', 'G', 'H'][:num_chains]
    residues = ['ALA', 'ARG', 'ASN', 'ASP', 'CYS', 'GLN', 'GLU', 'GLY', 
                'HIS', 'ILE', 'LEU', 'LYS', 'MET', 'PHE', 'PRO', 'SER',
                'THR', 'TRP', 'TYR', 'VAL']
    atoms = ['N', 'CA', 'C', 'O', 'CB']
    elements = {'N': 'N', 'CA': 'C', 'C': 'C', 'O': 'O', 'CB': 'C'}
    
    atom_serial = 1
    residue_seq = 1
    
    with open(filename, 'w') as f:
        f.write('HEADER    PROTEIN                                 01-JAN-24   9DEF\n')
        f.write(f'TITLE     LARGE PERFORMANCE TEST - {num_atoms_per_chain * num_chains} ATOMS\n')
        f.write('COMPND    MOL_ID: 1;\n')
        f.write(f'COMPND   2 CHAINS: {", ".join(chains)}\n')
        f.write('EXPDTA    X-RAY DIFFRACTION\n')
        f.write('AUTHOR    PERFORMANCE TEST\n\n')
        
        for chain_idx, chain in enumerate(chains):
            chain_offset_x = chain_idx * 60
            for residue_num in range(num_atoms_per_chain // 5):
                residue = residues[residue_num % len(residues)]
                helix_or_sheet = residue_num % 10
                
                if residue_num % 20 < 8:
                    ss = 'HELIX'
                elif residue_num % 20 < 14:
                    ss = 'SHEET'
                else:
                    ss = 'COIL'
                
                for atom_idx, atom in enumerate(atoms):
                    angle = (residue_num * 0.5 + atom_idx * 0.3) + chain_idx * math.pi * 0.5
                    radius = 15 + atom_idx * 1.5
                    x = chain_offset_x + math.cos(angle) * radius
                    y = math.sin(angle) * radius
                    z = residue_num * 1.5 + atom_idx * 0.5
                    
                    f.write(f'ATOM  {atom_serial:5d}  {atom:4s}{residue:4s} {chain:1s}{residue_seq:4d}    '
                           f'{x:8.3f}{y:8.3f}{z:8.3f}  1.00 20.00           {elements[atom]:2s}\n')
                    atom_serial += 1
                residue_seq += 1
            residue_seq = 1
        
        f.write('END\n')
    
    total_atoms = num_atoms_per_chain * num_chains
    print(f'Generated PDB file: {filename}')
    print(f'Total atoms: {total_atoms:,}')
    print(f'Chains: {num_chains}')
    return filename

if __name__ == '__main__':
    num_atoms = int(sys.argv[1]) if len(sys.argv) > 1 else 2000
    num_chains = int(sys.argv[2]) if len(sys.argv) > 2 else 4
    atoms_per_chain = num_atoms // num_chains
    generate_large_pdb(atoms_per_chain, num_chains)
