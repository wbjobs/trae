import type { Complex, QuantumGate } from '@/types/quantum';
import { complexMagnitudeSq, complexMul, complexAdd, complexMulScalar } from './complex';
import { ONE, ZERO } from './complex';

const generateId = (): string => {
  return Math.random().toString(36).substr(2, 9);
};

export enum SteaneErrorType {
  NONE = 'none',
  X_ERROR = 'x_error',
  Z_ERROR = 'z_error',
}

export interface SteaneState {
  physicalQubits: number; // 7 physical qubits
  logicalState: { alpha: Complex; beta: Complex };
  errorSyndrome: number[]; // Syndrome measurements
  detectedError: {
    type: SteaneErrorType;
    qubit: number;
  } | null;
  encodedState: Complex[];
}

export const STEANE_PHYSICAL_QUBITS = 7;

// Steane code stabilizer generators (X stabilizers)
export const X_STABILIZERS = [
  [0, 1, 2, 3],
  [1, 2, 4, 5],
  [2, 3, 5, 6],
];

// Steane code stabilizer generators (Z stabilizers)
export const Z_STABILIZERS = [
  [0, 1, 2, 3],
  [1, 2, 4, 5],
  [2, 3, 5, 6],
];

export const LOGICAL_TO_PHYSICAL = {
  '0': '0000000',
  '1': '1111111',
};

export class SteaneCode {
  private state: SteaneState;

  constructor() {
    this.state = {
      physicalQubits: STEANE_PHYSICAL_QUBITS,
      logicalState: { alpha: ONE, beta: ZERO },
      errorSyndrome: [],
      detectedError: null,
      encodedState: this.initializeZeroState(),
    };
  }

  private initializeZeroState(): Complex[] {
    const dim = 1 << STEANE_PHYSICAL_QUBITS;
    const state: Complex[] = Array(dim).fill(null).map(() => ({ real: 0, imag: 0 }));
    state[0] = { real: 1, imag: 0 }; // |0000000>
    return state;
  }

  getState(): SteaneState {
    return { ...this.state };
  }

  encode(logicalState: { alpha: Complex; beta: Complex }): QuantumGate[] {
    this.state.logicalState = { ...logicalState };
    const gates: QuantumGate[] = [];

    // Steane code encoding circuit:
    // - Apply Hadamard to all qubits
    for (let i = 0; i < STEANE_PHYSICAL_QUBITS; i++) {
      gates.push({
        id: generateId(),
        type: 'H',
        targetQubit: i,
        column: 0,
      });
    }

    // - Apply stabilizer generators (CNOT gates)
    gates.push(...this.generateStabilizerGates());

    return gates;
  }

  private generateStabilizerGates(): QuantumGate[] {
    const gates: QuantumGate[] = [];
    let col = 1;

    // X stabilizer CNOTs
    for (let i = 0; i < X_STABILIZERS.length; i++) {
      const stabilizer = X_STABILIZERS[i];
      const target = stabilizer[stabilizer.length - 1];
      for (let j = 0; j < stabilizer.length - 1; j++) {
        gates.push({
          id: generateId(),
          type: 'CNOT',
          targetQubit: target,
          controlQubit: stabilizer[j],
          column: col,
        });
        col++;
      }
    }

    // Z stabilizer CNOTs
    for (let i = 0; i < Z_STABILIZERS.length; i++) {
      const stabilizer = Z_STABILIZERS[i];
      const target = stabilizer[stabilizer.length - 1];
      for (let j = 0; j < stabilizer.length - 1; j++) {
        gates.push({
          id: generateId(),
          type: 'CNOT',
          targetQubit: target,
          controlQubit: stabilizer[j],
          column: col,
        });
        col++;
      }
    }

    return gates;
  }

  applyBitFlipError(qubit: number): QuantumGate[] {
    if (qubit < 0 || qubit >= STEANE_PHYSICAL_QUBITS) {
      throw new Error('Invalid qubit for error');
    }
    return [
      {
        id: generateId(),
        type: 'X',
        targetQubit: qubit,
        column: 20,
      },
    ];
  }

  applyPhaseFlipError(qubit: number): QuantumGate[] {
    if (qubit < 0 || qubit >= STEANE_PHYSICAL_QUBITS) {
      throw new Error('Invalid qubit for error');
    }
    return [
      {
        id: generateId(),
        type: 'Z',
        targetQubit: qubit,
        column: 20,
      },
    ];
  }

  measureSyndrome(): number[] {
    // Simplified syndrome measurement simulation
    this.state.errorSyndrome = [0, 0, 0, 0, 0, 0]; // 3 for X, 3 for Z
    return this.state.errorSyndrome;
  }

  detectAndCorrectError(): QuantumGate[] {
    const gates: QuantumGate[] = [];

    if (!this.state.errorSyndrome) {
      return gates;
    }

    // X error detection (first 3 syndrome bits)
    const xSyndrome = this.state.errorSyndrome.slice(0, 3);
    const zSyndrome = this.state.errorSyndrome.slice(3, 6);

    let xErrorQubit = -1;
    let zErrorQubit = -1;

    for (let i = 0; i < X_STABILIZERS.length; i++) {
      if (xSyndrome[i] === 1) {
        xErrorQubit = i;
        break;
      }
    }

    for (let i = 0; i < Z_STABILIZERS.length; i++) {
      if (zSyndrome[i] === 1) {
        zErrorQubit = i + 3;
        break;
      }
    }

    if (xErrorQubit !== -1) {
      this.state.detectedError = { type: SteaneErrorType.X_ERROR, qubit: xErrorQubit };
      gates.push({
        id: generateId(),
        type: 'X',
        targetQubit: xErrorQubit,
        column: 30,
      });
    } else if (zErrorQubit !== -1) {
      this.state.detectedError = { type: SteaneErrorType.Z_ERROR, qubit: zErrorQubit };
      gates.push({
        id: generateId(),
        type: 'Z',
        targetQubit: zErrorQubit,
        column: 30,
      });
    } else {
      this.state.detectedError = null;
    }

    return gates;
  }

  decode(): { alpha: Complex; beta: Complex } {
    return { ...this.state.logicalState };
  }

  getEncodingCircuit(): QuantumGate[] {
    return this.encode(this.state.logicalState);
  }

  reset(): void {
    this.state = {
      physicalQubits: STEANE_PHYSICAL_QUBITS,
      logicalState: { alpha: ONE, beta: ZERO },
      errorSyndrome: [],
      detectedError: null,
      encodedState: this.initializeZeroState(),
    };
  }
}

export function getSteaneExampleCircuit(includeError: boolean = false, errorQubit: number = 3): QuantumGate[] {
  const steane = new SteaneCode();
  let gates = [...steane.getEncodingCircuit()];

  if (includeError) {
    gates.push(...steane.applyBitFlipError(errorQubit));
    gates.push(...steane.detectAndCorrectError());
  }

  return gates;
}

export function getSteaneLogicalQubitInfo() {
  return {
    name: 'Steane [[7,1,3]] Code',
    description: '7-physical qubit quantum error correction code that protects against single qubit errors',
    k: 1, // logical qubits
    n: 7, // physical qubits
    d: 3, // distance
    stabilizers: {
      x: X_STABILIZERS,
      z: Z_STABILIZERS,
    },
  };
}
