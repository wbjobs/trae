import React, { useState, useCallback, useMemo } from 'react';
import { SteaneCode, STEANE_PHYSICAL_QUBITS, SteaneErrorType, X_STABILIZERS, Z_STABILIZERS } from '@/utils/steaneCode';
import { useQuantumStore } from '@/store/quantumStore';

const SteaneVisualizer: React.FC = () => {
  const [selectedLogicalState, setSelectedLogicalState] = useState<'0' | '1'>('0');
  const [hasError, setHasError] = useState(false);
  const [errorQubit, setErrorQubit] = useState(3);
  const [errorType, setErrorType] = useState<SteaneErrorType>(SteaneErrorType.X_ERROR);
  const [showSyndrome, setShowSyndrome] = useState(false);
  const [isEncoded, setIsEncoded] = useState(false);
  const [detectedError, setDetectedError] = useState<{ type: SteaneErrorType; qubit: number } | null>(null);

  const { circuit, setQubitCount, addGate, clearCircuit, setSelectedQubit, selectedQubit } = useQuantumStore();

  const [steane] = useState(() => new SteaneCode());

  const handleEncode = useCallback(() => {
    clearCircuit();
    setQubitCount(STEANE_PHYSICAL_QUBITS);
    
    const logicalState = selectedLogicalState === '0' 
      ? { alpha: { real: 1, imag: 0 }, beta: { real: 0, imag: 0 } }
      : { alpha: { real: 0, imag: 0 }, beta: { real: 1, imag: 0 } };

    const encodingGates = steane.encode(logicalState);
    encodingGates.forEach(gate => addGate(gate));
    setIsEncoded(true);
    setDetectedError(null);
    setShowSyndrome(false);
  }, [steane, selectedLogicalState, addGate, clearCircuit, setQubitCount]);

  const handleApplyError = useCallback(() => {
    if (!isEncoded) return;
    
    if (errorType === SteaneErrorType.X_ERROR) {
      const errorGates = steane.applyBitFlipError(errorQubit);
      errorGates.forEach(gate => addGate(gate));
    } else {
      const errorGates = steane.applyPhaseFlipError(errorQubit);
      errorGates.forEach(gate => addGate(gate));
    }
    setHasError(true);
  }, [steane, errorType, errorQubit, isEncoded, addGate]);

  const handleMeasureSyndrome = useCallback(() => {
    const syndrome = steane.measureSyndrome();
    setShowSyndrome(true);
  }, [steane]);

  const handleDetectAndCorrect = useCallback(() => {
    const correctionGates = steane.detectAndCorrectError();
    correctionGates.forEach(gate => addGate(gate));
    setDetectedError(steane.getState().detectedError);
    setHasError(false);
  }, [steane, addGate]);

  const handleReset = useCallback(() => {
    clearCircuit();
    steane.reset();
    setIsEncoded(false);
    setHasError(false);
    setShowSyndrome(false);
    setDetectedError(null);
  }, [steane, clearCircuit]);

  const drawStabilizers = useCallback(() => {
    return (
      <div className="flex flex-col gap-4">
        <div className="text-[#64ffda] font-semibold text-sm mb-2">Stabilizer Generators</div>
        <div className="flex gap-4 flex-wrap">
          <div className="bg-[#1a1f35] p-3 rounded-lg border border-[#2a2e3e]">
            <div className="text-[#ff5555] font-semibold text-xs mb-2">X Stabilizers</div>
            {X_STABILIZERS.map((stabilizer, idx) => (
              <div key={`x-${idx}`} className="text-xs text-gray-300 font-mono">
                X_{stabilizer[0]} • X_{stabilizer[1]} • X_{stabilizer[2]} • X_{stabilizer[3]}
              </div>
            ))}
          </div>
          <div className="bg-[#1a1f35] p-3 rounded-lg border border-[#2a2e3e]">
            <div className="text-[#bd93f9] font-semibold text-xs mb-2">Z Stabilizers</div>
            {Z_STABILIZERS.map((stabilizer, idx) => (
              <div key={`z-${idx}`} className="text-xs text-gray-300 font-mono">
                Z_{stabilizer[0]} • Z_{stabilizer[1]} • Z_{stabilizer[2]} • Z_{stabilizer[3]}
              </div>
            ))}
          </div>
        </div>
      </div>
    );
  }, []);

  const drawPhysicalQubits = useCallback(() => {
    return (
      <div className="flex flex-col gap-2">
        <div className="text-[#64ffda] font-semibold text-sm mb-2">Physical Qubits (7)</div>
        <div className="grid grid-cols-7 gap-1">
          {Array.from({ length: STEANE_PHYSICAL_QUBITS }).map((_, idx) => (
            <div
              key={idx}
              onClick={() => setSelectedQubit(idx)}
              className={`flex flex-col items-center p-3 rounded-lg border cursor-pointer transition-all
                ${selectedQubit === idx ? 'border-[#64ffda] bg-[#1a1f35]' : 'border-[#2a2e3e] bg-[#0a0e1a]'}
                ${hasError && idx === errorQubit ? 'border-[#ff5555] bg-[#ff5555]/10' : ''}
                ${detectedError?.qubit === idx ? 'border-[#50fa7b] bg-[#50fa7b]/10' : ''}
              `}
            >
              <span className="text-xs text-gray-500">Q{idx}</span>
              <span className="text-lg font-mono text-gray-300 mt-1">
                {detectedError?.qubit === idx && detectedError.type === SteaneErrorType.X_ERROR ? '✓' : 
                 detectedError?.qubit === idx && detectedError.type === SteaneErrorType.Z_ERROR ? '✓' : '0'}
              </span>
              {hasError && idx === errorQubit && (
                <span className="text-[10px] text-[#ff5555] mt-1">Error!</span>
              )}
              {detectedError?.qubit === idx && (
                <span className="text-[10px] text-[#50fa7b] mt-1">Corrected</span>
              )}
            </div>
          ))}
        </div>
      </div>
    );
  }, [selectedQubit, hasError, errorQubit, detectedError, setSelectedQubit]);

  const drawSyndrome = useCallback(() => {
    if (!showSyndrome) return null;
    
    const state = steane.getState();
    return (
      <div className="mt-4 bg-[#1a1f35] p-3 rounded-lg border border-[#2a2e3e]">
        <div className="text-[#64ffda] font-semibold text-sm mb-2">Syndrome Measurements</div>
        <div className="grid grid-cols-6 gap-2">
          {state.errorSyndrome.map((bit, idx) => (
            <div key={idx} className="flex flex-col items-center p-2 border border-[#2a2e3e] rounded">
              <span className="text-xs text-gray-500">S{idx}</span>
              <span className={`text-sm font-mono ${bit === 1 ? 'text-[#ff5555]' : 'text-gray-400'}`}>
                {bit}
              </span>
            </div>
          ))}
        </div>
      </div>
    );
  }, [showSyndrome, steane]);

  return (
    <div className="bg-[#0a0e1a] rounded-lg p-4 border border-[#2a2e3e]">
      <div className="text-[#64ffda] font-semibold text-lg mb-4">
        <span className="mr-2">⚡</span>
        Steane [[7,1,3]] Quantum Error Correction Code
      </div>

      <div className="flex flex-wrap gap-4 mb-6">
        <div className="bg-[#1a1f35] p-4 rounded-lg border border-[#2a2e3e]">
          <div className="text-[#64ffda] font-semibold text-sm mb-3">Controls</div>
          
          <div className="flex flex-col gap-3">
            <div className="flex gap-2 items-center">
              <span className="text-xs text-gray-400 w-24">Logical State:</span>
              <div className="flex gap-2">
                <button
                  onClick={() => setSelectedLogicalState('0')}
                  className={`px-3 py-1 rounded text-xs font-semibold transition-all
                    ${selectedLogicalState === '0' ? 'bg-[#64ffda] text-[#0a192f]' : 'bg-[#2a2e3e] text-gray-300'}`}
                >
                  |0⟩
                </button>
                <button
                  onClick={() => setSelectedLogicalState('1')}
                  className={`px-3 py-1 rounded text-xs font-semibold transition-all
                    ${selectedLogicalState === '1' ? 'bg-[#64ffda] text-[#0a192f]' : 'bg-[#2a2e3e] text-gray-300'}`}
                >
                  |1⟩
                </button>
              </div>
            </div>

            <div className="flex gap-2">
              <button
                onClick={handleEncode}
                className="flex-1 flex items-center justify-center gap-1 px-3 py-2 rounded bg-[#64ffda] text-[#0a192f] font-semibold hover:bg-[#4de0c0] transition-all"
              >
                <span>Encode</span>
              </button>
              <button
                onClick={handleApplyError}
                disabled={!isEncoded}
                className="flex-1 flex items-center justify-center gap-1 px-3 py-2 rounded bg-[#ff5555] text-[#0a192f] font-semibold hover:bg-[#ff7979] disabled:opacity-50 transition-all"
              >
                <span>Apply Error</span>
              </button>
              <button
                onClick={handleMeasureSyndrome}
                disabled={!hasError}
                className="flex-1 flex items-center justify-center gap-1 px-3 py-2 rounded bg-[#ffb86c] text-[#0a192f] font-semibold hover:bg-[#ffc97d] disabled:opacity-50 transition-all"
              >
                <span>Syndrome</span>
              </button>
              <button
                onClick={handleDetectAndCorrect}
                disabled={!hasError}
                className="flex-1 flex items-center justify-center gap-1 px-3 py-2 rounded bg-[#50fa7b] text-[#0a192f] font-semibold hover:bg-[#3dd665] disabled:opacity-50 transition-all"
              >
                <span>Correct</span>
              </button>
              <button
                onClick={handleReset}
                className="px-3 py-2 rounded bg-[#1a1f35] border border-[#2a2e3e] text-gray-300 hover:border-[#64ffda] hover:text-[#64ffda] transition-all"
              >
                Reset
              </button>
            </div>

            <div className="flex gap-2 items-center">
              <span className="text-xs text-gray-400 w-24">Error Type:</span>
              <div className="flex gap-2">
                <button
                  onClick={() => setErrorType(SteaneErrorType.X_ERROR)}
                  className={`px-2 py-1 rounded text-xs font-semibold transition-all
                    ${errorType === SteaneErrorType.X_ERROR ? 'bg-[#ff5555] text-[#0a192f]' : 'bg-[#2a2e3e] text-gray-300'}`}
                >
                  Bit Flip (X)
                </button>
                <button
                  onClick={() => setErrorType(SteaneErrorType.Z_ERROR)}
                  className={`px-2 py-1 rounded text-xs font-semibold transition-all
                    ${errorType === SteaneErrorType.Z_ERROR ? 'bg-[#bd93f9] text-[#0a192f]' : 'bg-[#2a2e3e] text-gray-300'}`}
                >
                  Phase Flip (Z)
                </button>
              </div>
            </div>

            <div className="flex gap-2 items-center">
              <span className="text-xs text-gray-400 w-24">Error Qubit:</span>
              <select
                value={errorQubit}
                onChange={(e) => setErrorQubit(parseInt(e.target.value))}
                className="bg-[#2a2e3e] border border-[#2a2e3e] text-gray-300 rounded px-2 py-1 text-xs"
              >
                {Array.from({ length: STEANE_PHYSICAL_QUBITS }).map((_, idx) => (
                  <option key={idx} value={idx}>Q{idx}</option>
                ))}
              </select>
            </div>
          </div>
        </div>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
        {drawStabilizers()}
        {drawPhysicalQubits()}
      </div>

      {drawSyndrome()}

      <div className="mt-4 p-3 bg-[#1a1f35] rounded-lg border border-[#2a2e3e]">
        <div className="text-[#64ffda] font-semibold text-sm mb-2">Code Properties</div>
        <div className="grid grid-cols-3 gap-4 text-xs">
          <div>
            <span className="text-gray-400">Logical Qubits:</span>
            <span className="ml-2 text-[#64ffda] font-mono">1</span>
          </div>
          <div>
            <span className="text-gray-400">Physical Qubits:</span>
            <span className="ml-2 text-[#64ffda] font-mono">7</span>
          </div>
          <div>
            <span className="text-gray-400">Distance:</span>
            <span className="ml-2 text-[#64ffda] font-mono">3</span>
          </div>
        </div>
      </div>
    </div>
  );
};

export default SteaneVisualizer;
