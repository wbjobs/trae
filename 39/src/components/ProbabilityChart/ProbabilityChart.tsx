import { useMemo } from 'react';
import { BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer, Cell } from 'recharts';
import { useQuantumStore } from '@/store/quantumStore';
import { formatProbability, formatStateLabel } from '@/utils/blochCalculations';

const ProbabilityChart = () => {
  const { simulationResult, circuit } = useQuantumStore();

  const chartData = useMemo(() => {
    if (!simulationResult) {
      const initialState = formatStateLabel(0, circuit.qubitCount);
      return [{ state: initialState, probability: 100, amplitude: '1.000', isMeasured: false }];
    }

    const { probabilities, stateVector, measurementResult } = simulationResult;
    const qubitCount = circuit.qubitCount;

    return probabilities.map((prob, index) => ({
      state: formatStateLabel(index, qubitCount),
      probability: prob * 100,
      amplitude: `${stateVector[index].real.toFixed(3)}${
        stateVector[index].imag >= 0 ? '+' : ''
      }${stateVector[index].imag.toFixed(3)}i`,
      isMeasured: measurementResult === index,
    }));
  }, [simulationResult, circuit.qubitCount]);

  const maxProb = useMemo(() => {
    return Math.max(...chartData.map((d) => d.probability), 100);
  }, [chartData]);

  const CustomTooltip = ({ active, payload }: any) => {
    if (active && payload && payload.length) {
      const data = payload[0].payload;
      return (
        <div className="bg-[#1a1f35] border border-[#64ffda] rounded-lg p-3 text-sm">
          <p className="text-[#64ffda] font-mono font-bold">|{data.state}⟩</p>
          <p className="text-gray-300">概率: {data.probability.toFixed(2)}%</p>
          <p className="text-gray-400 text-xs">振幅: {data.amplitude}</p>
          {data.isMeasured && (
            <p className="text-[#50fa7b] text-xs mt-1">✓ 测量结果</p>
          )}
        </div>
      );
    }
    return null;
  };

  const showAllStates = circuit.qubitCount <= 6;
  const displayData = showAllStates
    ? chartData
    : chartData.filter((d) => d.probability > 0.1);

  return (
    <div className="h-full flex flex-col bg-[#0a0e1a] rounded-lg p-4">
      <div className="flex items-center justify-between mb-3">
        <h3 className="text-[#64ffda] font-semibold text-sm">测量概率分布</h3>
        {!showAllStates && (
          <span className="text-xs text-gray-500">仅显示概率 {'>'} 0.1% 的态</span>
        )}
      </div>

      <div className="flex-1 min-h-0">
        {simulationResult ? (
          <ResponsiveContainer width="100%" height="100%">
            <BarChart
              data={displayData}
              margin={{ top: 10, right: 10, left: 0, bottom: displayData.length > 8 ? 40 : 20 }}
            >
              <CartesianGrid strokeDasharray="3 3" stroke="#2a2e3e" />
              <XAxis
                dataKey="state"
                stroke="#6272a4"
                tick={{ fill: '#8be9fd', fontSize: 10, fontFamily: 'JetBrains Mono, monospace' }}
                angle={displayData.length > 8 ? -45 : 0}
                textAnchor={displayData.length > 8 ? 'end' : 'middle'}
                height={displayData.length > 8 ? 50 : 30}
              />
              <YAxis
                stroke="#6272a4"
                tick={{ fill: '#8be9fd', fontSize: 10 }}
                domain={[0, Math.ceil(maxProb / 10) * 10]}
                tickFormatter={(value) => `${value}%`}
              />
              <Tooltip content={<CustomTooltip />} />
              <Bar dataKey="probability" radius={[4, 4, 0, 0]}>
                {displayData.map((entry, index) => (
                  <Cell
                    key={`cell-${index}`}
                    fill={entry.isMeasured ? '#50fa7b' : entry.probability > 50 ? '#64ffda' : '#bd93f9'}
                    opacity={entry.isMeasured ? 1 : 0.8}
                  />
                ))}
              </Bar>
            </BarChart>
          </ResponsiveContainer>
        ) : (
          <div className="h-full flex items-center justify-center text-gray-500 text-sm">
            <div className="text-center">
              <p className="mb-2">点击"运行模拟"查看概率分布</p>
              <p className="text-xs text-gray-600">
                当前: |{formatStateLabel(0, circuit.qubitCount)}⟩ = 100%
              </p>
            </div>
          </div>
        )}
      </div>

      {simulationResult?.measurementResult !== undefined && (
        <div className="mt-3 p-3 bg-[#50fa7b]10 border border-[#50fa7b]30 rounded-lg">
          <p className="text-[#50fa7b] text-sm font-mono">
            测量结果: |{formatStateLabel(simulationResult.measurementResult, circuit.qubitCount)}⟩
          </p>
        </div>
      )}
    </div>
  );
};

export default ProbabilityChart;
