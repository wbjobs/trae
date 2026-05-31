import type { Complex, GateType, QuantumCircuit, QuantumGate, SimulationResult } from '@/types/quantum';
import { GATE_MATRICES, applyMatrixToVector, createIdentityMatrix } from './quantumGates';
import { complexMagnitudeSq, complexAdd, complexMulScalar, ONE, ZERO, complexMul } from './complex';

export class QuantumSimulator {
  private qubitCount: number;
  private stateVector: Complex[];
  private dimension: number;

  constructor(qubitCount: number) {
    if (qubitCount < 1 || qubitCount > 12) {
      throw new Error('量子比特数必须在 1 到 12 之间');
    }
    this.qubitCount = qubitCount;
    this.dimension = 1 << qubitCount;
    this.stateVector = this.createInitialState();
  }

  private createInitialState(): Complex[] {
    const state: Complex[] = Array(this.dimension)
      .fill(null)
      .map(() => ({ real: 0, imag: 0 }));
    state[0] = { real: 1, imag: 0 };
    return state;
  }

  public reset(): void {
    this.stateVector = this.createInitialState();
  }

  public getStateVector(): Complex[] {
    return [...this.stateVector];
  }

  public getQubitCount(): number {
    return this.qubitCount;
  }

  public getProbabilities(): number[] {
    return this.stateVector.map((c) => complexMagnitudeSq(c));
  }

  public applySingleQubitGate(gateType: Exclude<GateType, 'CNOT'>, targetQubit: number): void {
    if (targetQubit < 0 || targetQubit >= this.qubitCount) {
      throw new Error(`无效的目标量子比特: ${targetQubit}`);
    }

    const gateMatrix = GATE_MATRICES[gateType];
    const newState: Complex[] = Array(this.dimension)
      .fill(null)
      .map(() => ({ real: 0, imag: 0 }));

    const targetMask = 1 << (this.qubitCount - 1 - targetQubit);

    for (let i = 0; i < this.dimension; i++) {
      const targetBit = (i & targetMask) !== 0 ? 1 : 0;
      const otherBits = i & ~targetMask;

      for (let row = 0; row < 2; row++) {
        const targetIndex = otherBits | (row << (this.qubitCount - 1 - targetQubit));
        const element = gateMatrix[row][targetBit];
        const amplitude = this.stateVector[i];

        newState[targetIndex] = complexAdd(newState[targetIndex], {
          real: element.real * amplitude.real - element.imag * amplitude.imag,
          imag: element.real * amplitude.imag + element.imag * amplitude.real,
        });
      }
    }

    this.stateVector = newState;
  }

  public applyCNOT(controlQubit: number, targetQubit: number): void {
    if (controlQubit === targetQubit) {
      throw new Error('控制比特和目标比特不能相同');
    }
    if (controlQubit < 0 || controlQubit >= this.qubitCount) {
      throw new Error(`无效的控制量子比特: ${controlQubit}`);
    }
    if (targetQubit < 0 || targetQubit >= this.qubitCount) {
      throw new Error(`无效的目标量子比特: ${targetQubit}`);
    }

    const newState: Complex[] = [...this.stateVector.map((c) => ({ ...c }))];

    const controlMask = 1 << (this.qubitCount - 1 - controlQubit);
    const targetMask = 1 << (this.qubitCount - 1 - targetQubit);

    for (let i = 0; i < this.dimension; i++) {
      if ((i & controlMask) !== 0) {
        const flippedIndex = i ^ targetMask;
        if (i < flippedIndex) {
          const temp = newState[i];
          newState[i] = newState[flippedIndex];
          newState[flippedIndex] = temp;
        }
      }
    }

    this.stateVector = newState;
  }

  public applyGate(gate: QuantumGate): void {
    if (gate.type === 'CNOT') {
      if (gate.controlQubit === undefined) {
        throw new Error('CNOT 门需要控制比特');
      }
      this.applyCNOT(gate.controlQubit, gate.targetQubit);
    } else {
      this.applySingleQubitGate(gate.type, gate.targetQubit);
    }
  }

  public simulateCircuit(circuit: QuantumCircuit): SimulationResult {
    if (circuit.qubitCount !== this.qubitCount) {
      throw new Error('电路量子比特数与模拟器不匹配');
    }

    this.reset();

    const sortedGates = [...circuit.gates].sort((a, b) => a.column - b.column);

    for (const gate of sortedGates) {
      this.applyGate(gate);
    }

    return {
      stateVector: this.getStateVector(),
      probabilities: this.getProbabilities(),
    };
  }

  public measure(qubitIndex: number): number {
    if (qubitIndex < 0 || qubitIndex >= this.qubitCount) {
      throw new Error(`无效的量子比特索引: ${qubitIndex}`);
    }

    const mask = 1 << (this.qubitCount - 1 - qubitIndex);
    let probability0 = 0;

    for (let i = 0; i < this.dimension; i++) {
      if ((i & mask) === 0) {
        probability0 += complexMagnitudeSq(this.stateVector[i]);
      }
    }

    const random = Math.random();
    const result = random < probability0 ? 0 : 1;

    const normalizationFactor = result === 0 ? Math.sqrt(probability0) : Math.sqrt(1 - probability0);

    for (let i = 0; i < this.dimension; i++) {
      const bitValue = (i & mask) !== 0 ? 1 : 0;
      if (bitValue !== result) {
        this.stateVector[i] = { real: 0, imag: 0 };
      } else {
        this.stateVector[i] = complexMulScalar(this.stateVector[i], 1 / normalizationFactor);
      }
    }

    return result;
  }

  public measureAll(): number {
    const probabilities = this.getProbabilities();
    const random = Math.random();
    let cumulative = 0;

    for (let i = 0; i < this.dimension; i++) {
      cumulative += probabilities[i];
      if (random <= cumulative) {
        for (let j = 0; j < this.dimension; j++) {
          this.stateVector[j] = j === i ? { real: 1, imag: 0 } : { real: 0, imag: 0 };
        }
        return i;
      }
    }

    return this.dimension - 1;
  }

  public getSingleQubitState(qubitIndex: number): { alpha: Complex; beta: Complex } {
    if (qubitIndex < 0 || qubitIndex >= this.qubitCount) {
      throw new Error(`无效的量子比特索引: ${qubitIndex}`);
    }

    const mask = 1 << (this.qubitCount - 1 - qubitIndex);
    let alpha = { real: 0, imag: 0 };
    let beta = { real: 0, imag: 0 };

    for (let i = 0; i < this.dimension; i++) {
      if ((i & mask) === 0) {
        alpha = complexAdd(alpha, this.stateVector[i]);
      } else {
        beta = complexAdd(beta, this.stateVector[i]);
      }
    }

    const norm = Math.sqrt(complexMagnitudeSq(alpha) + complexMagnitudeSq(beta));
    if (norm > 0) {
      alpha = complexMulScalar(alpha, 1 / norm);
      beta = complexMulScalar(beta, 1 / norm);
    }

    return { alpha, beta };
  }

  public applyGroverOracle(targetState: number): void {
    if (targetState < 0 || targetState >= this.dimension) {
      throw new Error(`无效的目标态: ${targetState}`);
    }
    this.stateVector[targetState] = complexMulScalar(this.stateVector[targetState], -1);
  }

  public applyGroverDiffusion(): void {
    let meanReal = 0;
    let meanImag = 0;

    for (const c of this.stateVector) {
      meanReal += c.real;
      meanImag += c.imag;
    }

    meanReal /= this.dimension;
    meanImag /= this.dimension;

    for (let i = 0; i < this.dimension; i++) {
      this.stateVector[i] = {
        real: 2 * meanReal - this.stateVector[i].real,
        imag: 2 * meanImag - this.stateVector[i].imag,
      };
    }
  }

  public runGroverSearch(targetState: number): void {
    this.reset();

    for (let i = 0; i < this.qubitCount; i++) {
      this.applySingleQubitGate('H', i);
    }

    const iterations = Math.floor(Math.PI / 4 * Math.sqrt(this.dimension));

    for (let i = 0; i < iterations; i++) {
      this.applyGroverOracle(targetState);
      this.applyGroverDiffusion();
    }
  }
}

export const simulateCircuit = (circuit: QuantumCircuit): SimulationResult => {
  const simulator = new QuantumSimulator(circuit.qubitCount);
  return simulator.simulateCircuit(circuit);
};
