import { useState } from 'react';
import ControlPanel from '@/components/ControlPanel/ControlPanel';
import CircuitEditor from '@/components/CircuitEditor/CircuitEditor';
import SteaneVisualizer from '@/components/SteaneCode/SteaneVisualizer';
import BlochSphere from '@/components/BlochSphere/BlochSphere';
import ProbabilityChart from '@/components/ProbabilityChart/ProbabilityChart';
import { Atom } from 'lucide-react';

export default function Home() {
  const [activeTab, setActiveTab] = useState<'circuit' | 'qec'>('circuit');

  return (
    <div className="h-screen flex flex-col bg-[#0a192f] text-white overflow-hidden">
      <header className="bg-[#111525] border-b border-[#2a2e3e] px-6 py-4 flex items-center justify-between">
        <div className="flex items-center gap-3">
          <div className="w-10 h-10 rounded-xl bg-gradient-to-br from-[#64ffda] to-[#bd93f9] flex items-center justify-center">
            <Atom className="w-6 h-6 text-[#0a192f]" />
          </div>
          <div>
            <h1 className="text-xl font-bold bg-gradient-to-r from-[#64ffda] to-[#bd93f9] bg-clip-text text-transparent">
              Quantum Circuit Simulator
            </h1>
            <p className="text-xs text-gray-400">
              WebAssembly + MPS Tensor Networks
            </p>
          </div>
        </div>

        <div className="flex gap-2 bg-[#0a0e1a] p-1 rounded-lg border border-[#2a2e3e]">
          <button
            onClick={() => setActiveTab('circuit')}
            className={`px-4 py-2 rounded-lg text-sm font-semibold transition-all
              ${activeTab === 'circuit' ? 'bg-[#64ffda] text-[#0a192f]' : 'text-gray-400 hover:text-gray-200'}`}
          >
            Circuit Editor
          </button>
          <button
            onClick={() => setActiveTab('qec')}
            className={`px-4 py-2 rounded-lg text-sm font-semibold transition-all
              ${activeTab === 'qec' ? 'bg-[#bd93f9] text-[#0a192f]' : 'text-gray-400 hover:text-gray-200'}`}
          >
            Steane QEC
          </button>
        </div>
      </header>

      {activeTab === 'circuit' ? (
        <>
          <ControlPanel />
          <div className="flex-1 flex overflow-hidden">
            <div className="flex-1 flex flex-col overflow-hidden">
              <div className="flex-1 overflow-hidden">
                <CircuitEditor />
              </div>
            </div>

            <div className="w-[400px] border-l border-[#2a2e3e] flex flex-col overflow-hidden">
              <div className="h-[400px] border-b border-[#2a2e3e] p-4">
                <h3 className="text-[#64ffda] font-semibold text-sm mb-2">
                  Bloch Sphere - Q0
                </h3>
                <BlochSphere />
              </div>

              <div className="flex-1 overflow-hidden">
                <ProbabilityChart />
              </div>
            </div>
          </div>
        </>
      ) : (
        <div className="flex-1 overflow-auto">
          <SteaneVisualizer />
        </div>
      )}

      <footer className="bg-[#111525] border-t border-[#2a2e3e] px-6 py-2 text-xs text-gray-500 flex justify-between items-center">
        <span>Hint: Drag quantum gates to the circuit canvas | Double-click to delete gates | Click qubit lines to view on Bloch sphere</span>
        <span>Built with React, TypeScript & Three.js</span>
      </footer>
    </div>
  );
}
