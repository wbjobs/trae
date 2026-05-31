import type { Complex, GateType, QuantumCircuit, QuantumGate, SimulationResult } from '@/types/quantum';
import { QuantumSimulator } from './quantumSimulator';
import { TensorNetworkSimulator } from './tensorNetwork';
import { getRecommendedSimulatorType, MemoryManager } from './memoryManager';
import { GATE_MATRICES } from './quantumGates';
import { complexMagnitudeSq } from './complex';

export type SimulatorType = 'statevector' | 'mps';

export interface SimulatorStats {
  type: SimulatorType;
  memoryUsage: number;
  qubitCount: number;
  gateCount: number;
  executionTime: number;
}

export class OptimizedQuantumSimulator {
  private qubitCount: number;
  private simulatorType: SimulatorType;
  private statevectorSimulator: QuantumSimulator | null;
  private mpsSimulator: TensorNetworkSimulator | null;
  private memoryManager: MemoryManager;
  private stats: SimulatorStats;

  constructor(qubitCount: number, memoryLimitMB: number = 512) {
    if (qubitCount < 1 || qubitCount > 30) {
      throw new Error('量子比特数必须在 1 到 30 之间');
    }
    
    this.qubitCount = qubitCount;
    this.memoryManager = new MemoryManager(memoryLimitMB);
    this.simulatorType = this.selectSimulatorType(qubitCount);
    this.stats = {
      type: this.simulatorType,
      memoryUsage: 0,
      qubitCount,
      gateCount: 0,
      executionTime: 0,
    };

    if (this.simulatorType === 'statevector') {
      this.statevectorSimulator = new QuantumSimulator(qubitCount);
      this.mpsSimulator = null;
    } else {
      this.mpsSimulator = new TensorNetworkSimulator(qubitCount, 64);
      this.statevectorSimulator = null;
    }
  }

  private selectSimulatorType(qubitCount: number): SimulatorType {
    const recommended = getRecommendedSimulatorType(qubitCount);
    
    const availableMemory = navigator?.hardwareConcurrency 
      ? Math.min(navigator.hardwareConcurrency * 256, 4096) 
      : 2048;
    
    const dimension = 1 << qubitCount;
    const memoryNeeded = dimension * 16;
    
    if (memoryNeeded > availableMemory * 0.5 * 1024 * 1024) {
      return 'mps';
    }
    
    return recommended;
  }

  public getSimulatorType(): SimulatorType {
    return this.simulatorType;
  }

  public getStats(): SimulatorStats {
    return { ...this.stats };
  }

  public reset(): void {
    if (this.statevectorSimulator) {
      this.statevectorSimulator.reset();
    } else if (this.mpsSimulator) {
      this.mpsSimulator.reset();
    }
  }

  public getStateVector(): Complex[] {
    if (this.statevectorSimulator) {
      return this.statevectorSimulator.getStateVector();
    } else if (this.mpsSimulator) {
      return this.mpsSimulator.getStateVector();
    }
    return [];
  }

  public getQubitCount(): number {
    return this.qubitCount;
  }

  public getProbabilities(): number[] {
    if (this.statevectorSimulator) {
      return this.statevectorSimulator.getProbabilities();
    } else if (this.mpsSimulator) {
      return this.mpsSimulator.getProbabilities();
    }
    return [];
  }

  public applySingleQubitGate(gateType: Exclude<GateType, 'CNOT'>, targetQubit: number): void {
    if (this.statevectorSimulator) {
      this.statevectorSimulator.applySingleQubitGate(gateType, targetQubit);
    } else if (this.mpsSimulator) {
      const gateMatrix = GATE_MATRICES[gateType];
      this.mpsSimulator.applySingleQubitGate(gateMatrix, targetQubit);
    }
  }

  public applyCNOT(controlQubit: number, targetQubit: number): void {
    if (this.statevectorSimulator) {
      this.statevectorSimulator.applyCNOT(controlQubit, targetQubit);
    } else if (this.mpsSimulator) {
      this.mpsSimulator.applyCNOT(controlQubit, targetQubit);
    }
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

    const startTime = performance.now();
    
    this.reset();
    this.stats.gateCount = circuit.gates.length;

    const sortedGates = [...circuit.gates].sort((a, b) => a.column - b.column);

    for (const gate of sortedGates) {
      this.applyGate(gate);
    }

    const endTime = performance.now();
    this.stats.executionTime = endTime - startTime;

    if (this.mpsSimulator) {
      this.stats.memoryUsage = this.mpsSimulator.getMemoryUsage();
    } else {
      this.stats.memoryUsage = (1 << this.qubitCount) * 16;
    }

    return {
      stateVector: this.getStateVector(),
      probabilities: this.getProbabilities(),
    };
  }

  public measure(qubitIndex: number): number {
    if (this.statevectorSimulator) {
      return this.statevectorSimulator.measure(qubitIndex);
    }
    
    const probabilities = this.getProbabilities();
    const mask = 1 << (this.qubitCount - 1 - qubitIndex);
    let probability0 = 0;

    for (let i = 0; i < probabilities.length; i++) {
      if ((i & mask) === 0) {
        probability0 += probabilities[i];
      }
    }

    const random = Math.random();
    return random < probability0 ? 0 : 1;
  }

  public measureAll(): number {
    if (this.statevectorSimulator) {
      return this.statevectorSimulator.measureAll();
    }
    
    const probabilities = this.getProbabilities();
    const random = Math.random();
    let cumulative = 0;

    for (let i = 0; i < probabilities.length; i++) {
      cumulative += probabilities[i];
      if (random <= cumulative) {
        return i;
      }
    }

    return probabilities.length - 1;
  }

  public getSingleQubitState(qubitIndex: number): { alpha: Complex; beta: Complex } {
    if (this.statevectorSimulator) {
      return this.statevectorSimulator.getSingleQubitState(qubitIndex);
    }
    
    const stateVector = this.getStateVector();
    const mask = 1 << (this.qubitCount - 1 - qubitIndex);
    let alpha = { real: 0, imag: 0 };
    let beta = { real: 0, imag: 0 };

    for (let i = 0; i < stateVector.length; i++) {
      if ((i & mask) === 0) {
        alpha.real += stateVector[i].real;
        alpha.imag += stateVector[i].imag;
      } else {
        beta.real += stateVector[i].real;
        beta.imag += stateVector[i].imag;
      }
    }

    const norm = Math.sqrt(complexMagnitudeSq(alpha) + complexMagnitudeSq(beta));
    if (norm > 0) {
      alpha = { real: alpha.real / norm, imag: alpha.imag / norm };
      beta = { real: beta.real / norm, imag: beta.imag / norm };
    }

    return { alpha, beta };
  }

  public getMemoryUsage(): number {
    if (this.mpsSimulator) {
      return this.mpsSimulator.getMemoryUsage();
    }
    return (1 << this.qubitCount) * 16;
  }

  public switchToMPS(): void {
    if (!this.mpsSimulator) {
      this.mpsSimulator = new TensorNetworkSimulator(this.qubitCount, 64);
    }
    this.statevectorSimulator = null;
    this.simulatorType = 'mps';
    this.stats.type = 'mps';
  }

  public switchToStateVector(): void {
    const maxQubitsForStateVector = 14;
    if (this.qubitCount <= maxQubitsForStateVector) {
      if (!this.statevectorSimulator) {
        this.statevectorSimulator = new QuantumSimulator(this.qubitCount);
      }
      this.mpsSimulator = null;
      this.simulatorType = 'statevector';
      this.stats.type = 'statevector';
    } else {
      throw new Error(`无法切换到态向量模式，量子比特数(${this.qubitCount})超过限制(${maxQubitsForStateVector})`);
    }
  }
}

export const simulateCircuitOptimized = (circuit: QuantumCircuit): SimulationResult => {
  const simulator = new OptimizedQuantumSimulator(circuit.qubitCount);
  return simulator.simulateCircuit(circuit);
};
