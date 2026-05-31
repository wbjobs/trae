export type GateType = 'H' | 'X' | 'Y' | 'Z' | 'CNOT' | 'T' | 'S' | 'TDG' | 'SDG' | 'I';

export interface Complex {
  real: number;
  imag: number;
}

export interface QuantumGate {
  id: string;
  type: GateType;
  targetQubit: number;
  controlQubit?: number;
  column: number;
}

export interface QuantumCircuit {
  qubitCount: number;
  gates: QuantumGate[];
}

export interface SimulationResult {
  stateVector: Complex[];
  probabilities: number[];
  measurementResult?: number;
}

export interface BlochVector {
  x: number;
  y: number;
  z: number;
}

export interface GateInfo {
  type: GateType;
  name: string;
  description: string;
  isMultiQubit: boolean;
  symbol: string;
  color: string;
}

export const GATE_INFO: Record<GateType, GateInfo> = {
  H: { type: 'H', name: 'Hadamard', description: '创建叠加态', isMultiQubit: false, symbol: 'H', color: '#64ffda' },
  X: { type: 'X', name: 'Pauli-X', description: '量子 NOT 门', isMultiQubit: false, symbol: 'X', color: '#ff5555' },
  Y: { type: 'Y', name: 'Pauli-Y', description: '绕 Y 轴旋转 π', isMultiQubit: false, symbol: 'Y', color: '#50fa7b' },
  Z: { type: 'Z', name: 'Pauli-Z', description: '绕 Z 轴旋转 π', isMultiQubit: false, symbol: 'Z', color: '#bd93f9' },
  CNOT: { type: 'CNOT', name: 'CNOT', description: '受控 NOT 门', isMultiQubit: true, symbol: '⊕', color: '#ffb86c' },
  T: { type: 'T', name: 'T 门', description: 'π/4 相位门', isMultiQubit: false, symbol: 'T', color: '#8be9fd' },
  S: { type: 'S', name: 'S 门', description: 'π/2 相位门', isMultiQubit: false, symbol: 'S', color: '#ff79c6' },
  TDG: { type: 'TDG', name: 'T† 门', description: '-π/4 相位门', isMultiQubit: false, symbol: 'T†', color: '#8be9fd' },
  SDG: { type: 'SDG', name: 'S† 门', description: '-π/2 相位门', isMultiQubit: false, symbol: 'S†', color: '#ff79c6' },
  I: { type: 'I', name: 'Identity', description: '恒等门', isMultiQubit: false, symbol: 'I', color: '#6272a4' },
};

export const SINGLE_QUBIT_GATES: GateType[] = ['H', 'X', 'Y', 'Z', 'T', 'S', 'TDG', 'SDG', 'I'];
export const MULTI_QUBIT_GATES: GateType[] = ['CNOT'];
