import { create } from 'zustand';
import type { QuantumCircuit, QuantumGate, SimulationResult, GateType } from '@/types/quantum';
import { OptimizedQuantumSimulator, SimulatorType } from '@/utils/quantumSimulatorOptimized';
import { getSteaneExampleCircuit } from '@/utils/steaneCode';

interface QuantumState {
  circuit: QuantumCircuit;
  simulationResult: SimulationResult | null;
  selectedQubit: number;
  isSimulating: boolean;
  simulator: OptimizedQuantumSimulator | null;
  simulatorType: SimulatorType;
  simulationStats: {
    executionTime: number;
    memoryUsage: number;
    gateCount: number;
  };
  setQubitCount: (count: number) => void;
  addGate: (gate: QuantumGate) => void;
  removeGate: (gateId: string) => void;
  updateGatePosition: (gateId: string, column: number, targetQubit: number) => void;
  clearCircuit: () => void;
  runSimulation: () => void;
  setSelectedQubit: (qubit: number) => void;
  resetSimulation: () => void;
  loadGroverExample: (targetState: number) => void;
  measureAll: () => number | null;
  loadExample: (example: 'bell' | 'ghz' | 'grover') => void;
  loadSteaneExample: (includeError?: boolean, errorQubit?: number) => void;
  switchSimulatorType: (type: SimulatorType) => void;
}

const generateId = (): string => {
  return Math.random().toString(36).substr(2, 9);
};

export const useQuantumStore = create<QuantumState>((set, get) => ({
  circuit: {
    qubitCount: 3,
    gates: [],
  },
  simulationResult: null,
  selectedQubit: 0,
  isSimulating: false,
  simulator: null,
  simulatorType: 'statevector',
  simulationStats: {
    executionTime: 0,
    memoryUsage: 0,
    gateCount: 0,
  },

  setQubitCount: (count: number) => {
    const clampedCount = Math.max(1, Math.min(30, count));
    const newSimulator = new OptimizedQuantumSimulator(clampedCount);
    set((state) => ({
      circuit: {
        ...state.circuit,
        qubitCount: clampedCount,
        gates: state.circuit.gates.filter(
          (g) => g.targetQubit < clampedCount && (g.controlQubit === undefined || g.controlQubit < clampedCount)
        ),
      },
      simulationResult: null,
      selectedQubit: Math.min(state.selectedQubit, clampedCount - 1),
      simulator: newSimulator,
      simulatorType: newSimulator.getSimulatorType(),
    }));
  },

  addGate: (gate: QuantumGate) => {
    set((state) => ({
      circuit: {
        ...state.circuit,
        gates: [...state.circuit.gates, gate],
      },
      simulationResult: null,
    }));
  },

  removeGate: (gateId: string) => {
    set((state) => ({
      circuit: {
        ...state.circuit,
        gates: state.circuit.gates.filter((g) => g.id !== gateId),
      },
      simulationResult: null,
    }));
  },

  updateGatePosition: (gateId: string, column: number, targetQubit: number) => {
    set((state) => ({
      circuit: {
        ...state.circuit,
        gates: state.circuit.gates.map((g) =>
          g.id === gateId ? { ...g, column, targetQubit } : g
        ),
      },
      simulationResult: null,
    }));
  },

  clearCircuit: () => {
    set((state) => ({
      circuit: {
        ...state.circuit,
        gates: [],
      },
      simulationResult: null,
    }));
  },

  runSimulation: () => {
    const { circuit } = get();
    const simulator = get().simulator || new OptimizedQuantumSimulator(circuit.qubitCount);
    set({ isSimulating: true });

    setTimeout(() => {
      const result = simulator.simulateCircuit(circuit);
      const stats = simulator.getStats();
      set({
        simulationResult: result,
        isSimulating: false,
        simulator,
        simulatorType: simulator.getSimulatorType(),
        simulationStats: {
          executionTime: stats.executionTime,
          memoryUsage: stats.memoryUsage,
          gateCount: stats.gateCount,
        },
      });
    }, 0);
  },

  setSelectedQubit: (qubit: number) => {
    set({ selectedQubit: qubit });
  },

  resetSimulation: () => {
    const { circuit } = get();
    const simulator = new OptimizedQuantumSimulator(circuit.qubitCount);
    set({
      simulationResult: null,
      simulator,
      simulatorType: simulator.getSimulatorType(),
    });
  },

  loadGroverExample: (targetState: number) => {
    const qubitCount = get().circuit.qubitCount;
    const maxState = (1 << qubitCount) - 1;
    const clampedTarget = Math.max(0, Math.min(maxState, targetState));

    const gates: QuantumGate[] = [];
    const iterations = Math.floor(Math.PI / 4 * Math.sqrt(1 << qubitCount));

    let column = 0;
    for (let i = 0; i < qubitCount; i++) {
      gates.push({
        id: generateId(),
        type: 'H',
        targetQubit: i,
        column: 0,
      });
    }
    column++;

    for (let iter = 0; iter < iterations; iter++) {
      gates.push({
        id: generateId(),
        type: 'Z',
        targetQubit: 0,
        column,
      });
      column++;

      for (let i = 0; i < qubitCount; i++) {
        gates.push({
          id: generateId(),
          type: 'H',
          targetQubit: i,
          column,
        });
      }
      column++;
    }

    const simulator = new OptimizedQuantumSimulator(qubitCount);
    set({
      circuit: {
        qubitCount,
        gates,
      },
      simulationResult: null,
      simulator,
      simulatorType: simulator.getSimulatorType(),
    });
  },

  measureAll: () => {
    const { simulator } = get();
    if (!simulator) return null;
    const result = simulator.measureAll();
    const stateVector = simulator.getStateVector();
    const probabilities = simulator.getProbabilities();
    set({
      simulationResult: {
        stateVector,
        probabilities,
        measurementResult: result,
      },
    });
    return result;
  },

  loadExample: (example: 'bell' | 'ghz' | 'grover') => {
    let qubitCount = 2;
    const gates: QuantumGate[] = [];

    if (example === 'bell') {
      qubitCount = 2;
      gates.push(
        { id: generateId(), type: 'H', targetQubit: 0, column: 0 },
        { id: generateId(), type: 'CNOT', targetQubit: 1, controlQubit: 0, column: 1 }
      );
    } else if (example === 'ghz') {
      qubitCount = 3;
      gates.push(
        { id: generateId(), type: 'H', targetQubit: 0, column: 0 },
        { id: generateId(), type: 'CNOT', targetQubit: 1, controlQubit: 0, column: 1 },
        { id: generateId(), type: 'CNOT', targetQubit: 2, controlQubit: 1, column: 2 }
      );
    } else if (example === 'grover') {
      qubitCount = 3;
      const iterations = Math.floor(Math.PI / 4 * Math.sqrt(8));
      let col = 0;
      for (let i = 0; i < qubitCount; i++) {
        gates.push({ id: generateId(), type: 'H', targetQubit: i, column: col });
      }
      col++;
      for (let iter = 0; iter < iterations; iter++) {
        gates.push({ id: generateId(), type: 'X', targetQubit: 2, column: col });
        col++;
        gates.push({ id: generateId(), type: 'H', targetQubit: 2, column: col });
        col++;
        gates.push({ id: generateId(), type: 'CNOT', targetQubit: 2, controlQubit: 0, column: col });
        col++;
        gates.push({ id: generateId(), type: 'CNOT', targetQubit: 2, controlQubit: 1, column: col });
        col++;
        gates.push({ id: generateId(), type: 'H', targetQubit: 2, column: col });
        col++;
        gates.push({ id: generateId(), type: 'X', targetQubit: 2, column: col });
        col++;
        for (let i = 0; i < qubitCount; i++) {
          gates.push({ id: generateId(), type: 'H', targetQubit: i, column: col });
        }
        col++;
        for (let i = 0; i < qubitCount; i++) {
          gates.push({ id: generateId(), type: 'X', targetQubit: i, column: col });
        }
        col++;
        gates.push({ id: generateId(), type: 'H', targetQubit: 2, column: col });
        col++;
        gates.push({ id: generateId(), type: 'CNOT', targetQubit: 2, controlQubit: 0, column: col });
        col++;
        gates.push({ id: generateId(), type: 'CNOT', targetQubit: 2, controlQubit: 1, column: col });
        col++;
        gates.push({ id: generateId(), type: 'H', targetQubit: 2, column: col });
        col++;
        gates.push({ id: generateId(), type: 'X', targetQubit: 2, column: col });
        col++;
        for (let i = 0; i < qubitCount; i++) {
          gates.push({ id: generateId(), type: 'H', targetQubit: i, column: col });
        }
        col++;
        for (let i = 0; i < qubitCount; i++) {
          gates.push({ id: generateId(), type: 'Z', targetQubit: i, column: col });
        }
        col++;
      }
    }

    const simulator = new OptimizedQuantumSimulator(qubitCount);
    set({
      circuit: {
        qubitCount,
        gates,
      },
      simulationResult: null,
      simulator,
      simulatorType: simulator.getSimulatorType(),
      selectedQubit: 0,
    });
  },

  switchSimulatorType: (type: SimulatorType) => {
    const { circuit, simulator } = get();
    if (!simulator) return;
    
    try {
      if (type === 'mps') {
        simulator.switchToMPS();
      } else {
        simulator.switchToStateVector();
      }
      set({
        simulatorType: type,
        simulationResult: null,
      });
    } catch (e) {
      console.error('Failed to switch simulator type:', e);
    }
  },

  loadSteaneExample: (includeError: boolean = false, errorQubit: number = 3) => {
    const qubitCount = 7;
    const gates = getSteaneExampleCircuit(includeError, errorQubit);
    const simulator = new OptimizedQuantumSimulator(qubitCount);

    set({
      circuit: {
        qubitCount,
        gates,
      },
      simulationResult: null,
      simulator,
      simulatorType: simulator.getSimulatorType(),
      selectedQubit: 0,
    });
  },
}));
