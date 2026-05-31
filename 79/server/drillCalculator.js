import { getVoxelValueAtPosition } from './vtkParser.js';

export function computeDrillPath(surfacePosition, modelData) {
  const { bounds, origin, spacing, dimensions } = modelData;
  
  const startPoint = {
    x: surfacePosition.x,
    y: surfacePosition.y,
    z: bounds[5]
  };
  
  const endPoint = {
    x: surfacePosition.x,
    y: surfacePosition.y,
    z: bounds[4]
  };
  
  const totalDepth = bounds[5] - bounds[4];
  const stepSize = Math.min(spacing[0], spacing[1], spacing[2]) / 2;
  const numSteps = Math.ceil(totalDepth / stepSize);
  
  const pathPoints = [];
  const layerTransitions = [];
  
  let currentLayerId = -1;
  
  for (let i = 0; i <= numSteps; i++) {
    const t = i / numSteps;
    const z = startPoint.z - t * totalDepth;
    
    const position = {
      x: startPoint.x,
      y: startPoint.y,
      z: z
    };
    
    const voxelValue = getVoxelValueAtPosition(position, modelData);
    
    if (voxelValue !== -1 && voxelValue !== currentLayerId) {
      if (currentLayerId !== -1) {
        layerTransitions.push({
          depth: t * totalDepth,
          layerId: voxelValue,
          position: { ...position }
        });
      }
      currentLayerId = voxelValue;
    }
    
    pathPoints.push({
      ...position,
      depth: t * totalDepth,
      voxelValue
    });
  }
  
  return {
    startPoint,
    endPoint,
    totalDepth,
    stepSize,
    pathPoints,
    layerTransitions,
    numPoints: pathPoints.length
  };
}

export function generateDrillLog(drillPath, modelData) {
  const { layerTransitions, totalDepth, startPoint } = drillPath;
  const { layers } = modelData;
  
  const logLayers = [];
  let startDepth = 0;
  let currentLayerId = layerTransitions.length > 0 ? 
    getVoxelValueAtPosition(startPoint, modelData) : -1;
  
  if (currentLayerId === -1) {
    currentLayerId = layerTransitions[0]?.layerId ?? 0;
  }
  
  layerTransitions.forEach((transition, index) => {
    if (transition.layerId !== currentLayerId) {
      const layer = layers[currentLayerId];
      if (layer) {
        logLayers.push({
          layerId: currentLayerId,
          rockType: layer.name,
          color: layer.color,
          startDepth: startDepth,
          endDepth: transition.depth,
          thickness: transition.depth - startDepth,
          description: layer.description
        });
      }
      startDepth = transition.depth;
      currentLayerId = transition.layerId;
    }
  });
  
  const lastLayer = layers[currentLayerId];
  if (lastLayer && startDepth < totalDepth) {
    logLayers.push({
      layerId: currentLayerId,
      rockType: lastLayer.name,
      color: lastLayer.color,
      startDepth: startDepth,
      endDepth: totalDepth,
      thickness: totalDepth - startDepth,
      description: lastLayer.description
    });
  }
  
  return {
    position: { x: startPoint.x, y: startPoint.y },
    totalDepth,
    layers: logLayers,
    timestamp: Date.now()
  };
}

export function exportDrillLogToText(drillLog) {
  let log = `========================================\n`;
  log += `钻孔地质日志\n`;
  log += `生成时间: ${new Date(drillLog.timestamp).toLocaleString()}\n`;
  log += `钻孔坐标: X=${drillLog.position.x.toFixed(2)}, Y=${drillLog.position.y.toFixed(2)}\n`;
  log += `钻探总深度: ${drillLog.totalDepth.toFixed(2)} 米\n`;
  log += `========================================\n\n`;
  log += `岩层序列:\n`;
  log += `----------------------------------------\n`;
  
  drillLog.layers.forEach((layer, index) => {
    log += `层序 ${index + 1}:\n`;
    log += `  岩石类型: ${layer.rockType}\n`;
    log += `  深度区间: ${layer.startDepth.toFixed(2)}m - ${layer.endDepth.toFixed(2)}m\n`;
    log += `  地层厚度: ${layer.thickness.toFixed(2)}m\n`;
    log += `  岩性描述: ${layer.description}\n`;
    log += `----------------------------------------\n`;
  });
  
  log += `\n统计信息:\n`;
  log += `  总层数: ${drillLog.layers.length}\n`;
  log += `  平均层厚: ${(drillLog.totalDepth / drillLog.layers.length).toFixed(2)}m\n`;
  
  return log;
}

export function exportDrillLogToCSV(drillLog) {
  let csv = `层号,岩石类型,起始深度(m),终止深度(m),厚度(m),颜色RGB,岩性描述\n`;
  
  drillLog.layers.forEach((layer, index) => {
    const colorStr = layer.color.map(c => Math.round(c * 255)).join(',');
    csv += `${index + 1},"${layer.rockType}",${layer.startDepth.toFixed(2)},${layer.endDepth.toFixed(2)},${layer.thickness.toFixed(2)},"${colorStr}","${layer.description}"\n`;
  });
  
  return csv;
}
