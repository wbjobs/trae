import { Play, RotateCcw, Trash2, Plus, Minus, Zap, Cpu, MemoryStick, Clock } from 'lucide-react';
import { useQuantumStore } from '@/store/quantumStore';
import type { SimulatorType } from '@/utils/quantumSimulatorOptimized';

const ControlPanel = () => {
  const {
    circuit,
    setQubitCount,
    clearCircuit,
    runSimulation,
    resetSimulation,
    isSimulating,
    measureAll,
    simulationResult,
    loadExample,
    loadSteaneExample,
    simulatorType,
    simulationStats,
    switchSimulatorType,
  } = useQuantumStore();

  const handleQubitChange = (delta: number) => {
    setQubitCount(circuit.qubitCount + delta);
  };

  const handleMeasure = () => {
    if (simulationResult) {
      measureAll();
    }
  };

  const formatMemory = (bytes: number): string => {
    if (bytes < 1024) return `${bytes} B`;
    if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
    return `${(bytes / (1024 * 1024)).toFixed(2)} MB`;
  };

  const canUseStateVector = circuit.qubitCount <= 14;

  return (
    <div className="bg-[#111525] border-b border-[#2a2e3e] p-4">
      <div className="flex flex-wrap items-center gap-4">
        <div className="flex items-center gap-3">
          <span className="text-gray-400 text-sm">量子比特数:</span>
          <div className="flex items-center gap-2">
            <button
              onClick={() => handleQubitChange(-1)}
              disabled={circuit.qubitCount <= 1}
              className="w-8 h-8 rounded-lg bg-[#1a1f35] border border-[#2a2e3e] text-gray-400 hover:border-[#64ffda] hover:text-[#64ffda] disabled:opacity-50 disabled:cursor-not-allowed transition-all flex items-center justify-center"
            >
              <Minus size={16} />
            </button>
            <span className="w-12 text-center font-mono text-[#64ffda] text-lg font-bold">
              {circuit.qubitCount}
            </span>
            <button
              onClick={() => handleQubitChange(1)}
              disabled={circuit.qubitCount >= 30}
              className="w-8 h-8 rounded-lg bg-[#1a1f35] border border-[#2a2e3e] text-gray-400 hover:border-[#64ffda] hover:text-[#64ffda] disabled:opacity-50 disabled:cursor-not-allowed transition-all flex items-center justify-center"
            >
              <Plus size={16} />
            </button>
          </div>
        </div>

        <div className="h-8 w-px bg-[#2a2e3e]" />

        <div className="flex items-center gap-2">
          <span className="text-gray-400 text-sm">模拟器:</span>
          <div className="flex gap-1">
            <button
              onClick={() => switchSimulatorType('statevector')}
              disabled={!canUseStateVector}
              className={`px-3 py-1.5 rounded-lg text-sm transition-all ${
                simulatorType === 'statevector'
                  ? 'bg-[#64ffda] text-[#0a192f] font-semibold'
                  : 'bg-[#1a1f35] border border-[#2a2e3e] text-gray-300 hover:border-[#64ffda]'
              } ${!canUseStateVector ? 'opacity-50 cursor-not-allowed' : ''}`}
            >
              态向量
            </button>
            <button
              onClick={() => switchSimulatorType('mps')}
              className={`px-3 py-1.5 rounded-lg text-sm transition-all ${
                simulatorType === 'mps'
                  ? 'bg-[#bd93f9] text-[#0a192f] font-semibold'
                  : 'bg-[#1a1f35] border border-[#2a2e3e] text-gray-300 hover:border-[#bd93f9]'
              }`}
            >
              MPS
            </button>
          </div>
        </div>

        <div className="h-8 w-px bg-[#2a2e3e]" />

        <div className="flex items-center gap-2">
          <button
            onClick={runSimulation}
            disabled={isSimulating}
            className="flex items-center gap-2 px-4 py-2 rounded-lg bg-[#64ffda] text-[#0a192f] font-semibold hover:bg-[#4de0c0] disabled:opacity-50 disabled:cursor-not-allowed transition-all"
          >
            <Play size={16} />
            {isSimulating ? '模拟中...' : '运行模拟'}
          </button>

          <button
            onClick={handleMeasure}
            disabled={!simulationResult}
            className="flex items-center gap-2 px-4 py-2 rounded-lg bg-[#50fa7b] text-[#0a192f] font-semibold hover:bg-[#3dd665] disabled:opacity-50 disabled:cursor-not-allowed transition-all"
          >
            <Zap size={16} />
            测量
          </button>

          <button
            onClick={resetSimulation}
            className="flex items-center gap-2 px-4 py-2 rounded-lg bg-[#1a1f35] border border-[#2a2e3e] text-gray-300 hover:border-[#64ffda] hover:text-[#64ffda] transition-all"
          >
            <RotateCcw size={16} />
            重置
          </button>

          <button
            onClick={clearCircuit}
            className="flex items-center gap-2 px-4 py-2 rounded-lg bg-[#1a1f35] border border-[#2a2e3e] text-gray-300 hover:border-[#ff5555] hover:text-[#ff5555] transition-all"
          >
            <Trash2 size={16} />
            清空电路
          </button>
        </div>

        <div className="h-8 w-px bg-[#2a2e3e]" />

        <div className="flex items-center gap-2">
          <span className="text-gray-400 text-sm">示例:</span>
          <button
            onClick={() => loadExample('bell')}
            className="px-3 py-1.5 rounded-lg text-sm bg-[#1a1f35] border border-[#2a2e3e] text-gray-300 hover:border-[#bd93f9] hover:text-[#bd93f9] transition-all"
          >
            Bell 态
          </button>
          <button
            onClick={() => loadExample('ghz')}
            className="px-3 py-1.5 rounded-lg text-sm bg-[#1a1f35] border border-[#2a2e3e] text-gray-300 hover:border-[#ffb86c] hover:text-[#ffb86c] transition-all"
          >
            GHZ 态
          </button>
          <button
                onClick={() => loadExample('grover')}
                className="px-3 py-1.5 rounded-lg text-sm bg-[#1a1f35] border border-[#2a2e3e] text-gray-300 hover:border-[#8be9fd] hover:text-[#8be9fd] transition-all"
              >
                Grover Search
              </button>
            </div>

          <div className="h-8 w-px bg-[#2a2e3e]" />
          
          <div className="flex items-center gap-2">
            <span className="text-gray-400 text-sm">QEC:</span>
            <button
              onClick={() => loadSteaneExample(false)}
              className="px-3 py-1.5 rounded-lg text-sm bg-[#1a1f35] border border-[#2a2e3e] text-gray-300 hover:border-[#50fa7b] hover:text-[#50fa7b] transition-all"
            >
              Steane [[7,1,3]]
            </button>
            <button
              onClick={() => loadSteaneExample(true, 3)}
              className="px-3 py-1.5 rounded-lg text-sm bg-[#1a1f35] border border-[#2a2e3e] text-gray-300 hover:border-[#ff5555] hover:text-[#ff5555] transition-all"
            >
              Steane + Error
            </button>
          </div>

        <div className="flex-1" />

        <div className="flex items-center gap-4 text-xs">
          <div className="flex items-center gap-1 text-gray-500">
            <Cpu size={14} />
            <span>2^{circuit.qubitCount} = {1 << circuit.qubitCount}</span>
          </div>
          {simulationStats.executionTime > 0 && (
            <div className="flex items-center gap-1 text-[#64ffda]">
              <Clock size={14} />
              <span>{simulationStats.executionTime.toFixed(2)} ms</span>
            </div>
          )}
          {simulationStats.memoryUsage > 0 && (
            <div className="flex items-center gap-1 text-[#bd93f9]">
              <MemoryStick size={14} />
              <span>{formatMemory(simulationStats.memoryUsage)}</span>
            </div>
          )}
        </div>
      </div>
    </div>
  );
};

export default ControlPanel;
