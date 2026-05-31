const ROCK_TYPES = [
  { name: '表土层', color: [0.76, 0.60, 0.42], description: '第四系松散堆积物，主要为黏土、砂质黏土' },
  { name: '砂岩', color: [0.82, 0.70, 0.55], description: '中粗粒砂岩，分选较好，孔隙度中等' },
  { name: '页岩', color: [0.55, 0.55, 0.45], description: '泥质页岩，层理发育，渗透性差' },
  { name: '石灰岩', color: [0.85, 0.85, 0.75], description: '生物碎屑灰岩，岩溶发育，富水性强' },
  { name: '花岗岩', color: [0.65, 0.60, 0.55], description: '侵入型花岗岩，致密坚硬，孔隙度低' },
  { name: '玄武岩', color: [0.35, 0.35, 0.40], description: '喷出型玄武岩，气孔发育，渗透性不均' },
  { name: '大理岩', color: [0.90, 0.85, 0.80], description: '变质大理岩，块状构造，质地坚硬' },
  { name: '煤层', color: [0.15, 0.10, 0.05], description: '优质烟煤，光亮型，厚度稳定' },
  { name: '砾岩', color: [0.50, 0.45, 0.40], description: '复成分砾岩，分选差，磨圆度中等' },
  { name: '黏土岩', color: [0.60, 0.55, 0.45], description: '泥质黏土岩，遇水膨胀，工程性质差' }
];

export function generateSampleVTK() {
  const dimensions = [50, 50, 50];
  const spacing = [2, 2, 2];
  const origin = [0, 0, 0];
  
  const voxelData = [];
  const layerData = [];
  
  for (let z = 0; z < dimensions[2]; z++) {
    for (let y = 0; y < dimensions[1]; y++) {
      for (let x = 0; x < dimensions[0]; x++) {
        const worldZ = z * spacing[2];
        const worldX = x * spacing[0];
        const worldY = y * spacing[1];
        
        const noise1 = Math.sin(worldX * 0.1) * Math.cos(worldY * 0.1) * 5;
        const noise2 = Math.sin(worldX * 0.05 + worldY * 0.05) * 8;
        
        let layerIndex = 0;
        const adjustedZ = worldZ + noise1 + noise2;
        
        if (adjustedZ < 10) layerIndex = 0;
        else if (adjustedZ < 25) layerIndex = 1;
        else if (adjustedZ < 40) layerIndex = 2;
        else if (adjustedZ < 55) layerIndex = 3;
        else if (adjustedZ < 70) layerIndex = 7;
        else if (adjustedZ < 85) layerIndex = 4;
        else layerIndex = 5;
        
        voxelData.push(layerIndex);
      }
    }
  }
  
  for (let i = 0; i < ROCK_TYPES.length; i++) {
    layerData.push({
      id: i,
      name: ROCK_TYPES[i].name,
      color: ROCK_TYPES[i].color,
      description: ROCK_TYPES[i].description
    });
  }
  
  return {
    format: 'VOLUME',
    dimensions,
    spacing,
    origin,
    voxelData,
    layers: layerData
  };
}

export function parseVTKData(vtkData) {
  if (vtkData.format === 'VOLUME') {
    return parseVolumeData(vtkData);
  } else if (vtkData.format === 'POLYDATA') {
    return parsePolyData(vtkData);
  } else {
    return parseLegacyVTK(vtkData);
  }
}

function parseVolumeData(data) {
  const { dimensions, spacing, origin, voxelData, layers } = data;
  
  const bounds = [
    origin[0], origin[0] + dimensions[0] * spacing[0],
    origin[1], origin[1] + dimensions[1] * spacing[1],
    origin[2], origin[2] + dimensions[2] * spacing[2]
  ];
  
  return {
    type: 'volume',
    dimensions,
    spacing,
    origin,
    bounds,
    voxelData,
    layers,
    center: [
      (bounds[0] + bounds[1]) / 2,
      (bounds[2] + bounds[3]) / 2,
      (bounds[4] + bounds[5]) / 2
    ],
    size: [
      bounds[1] - bounds[0],
      bounds[3] - bounds[2],
      bounds[5] - bounds[4]
    ]
  };
}

function parsePolyData(data) {
  const { points, polys, pointData } = data;
  
  const bounds = calculateBounds(points);
  
  return {
    type: 'surface',
    points,
    polys,
    pointData,
    bounds,
    center: [
      (bounds[0] + bounds[1]) / 2,
      (bounds[2] + bounds[3]) / 2,
      (bounds[4] + bounds[5]) / 2
    ],
    size: [
      bounds[1] - bounds[0],
      bounds[3] - bounds[2],
      bounds[5] - bounds[4]
    ]
  };
}

function parseLegacyVTK(content) {
  const lines = content.split('\n').filter(l => l.trim());
  let i = 0;
  
  const metadata = {};
  
  while (i < lines.length) {
    const line = lines[i].trim();
    
    if (line.startsWith('DIMENSIONS')) {
      metadata.dimensions = line.split(/\s+/).slice(1).map(Number);
    } else if (line.startsWith('SPACING')) {
      metadata.spacing = line.split(/\s+/).slice(1).map(Number);
    } else if (line.startsWith('ORIGIN')) {
      metadata.origin = line.split(/\s+/).slice(1).map(Number);
    } else if (line.startsWith('SCALARS') || line.startsWith('LOOKUP_TABLE')) {
      break;
    }
    i++;
  }
  
  if (!metadata.dimensions) {
    throw new Error('无法解析VTK文件: 缺少DIMENSIONS信息');
  }
  
  return {
    type: 'volume',
    ...metadata,
    layers: ROCK_TYPES.map((rock, i) => ({
      id: i,
      name: rock.name,
      color: rock.color,
      description: rock.description
    }))
  };
}

function calculateBounds(points) {
  let minX = Infinity, maxX = -Infinity;
  let minY = Infinity, maxY = -Infinity;
  let minZ = Infinity, maxZ = -Infinity;
  
  for (let i = 0; i < points.length; i += 3) {
    minX = Math.min(minX, points[i]);
    maxX = Math.max(maxX, points[i]);
    minY = Math.min(minY, points[i + 1]);
    maxY = Math.max(maxY, points[i + 1]);
    minZ = Math.min(minZ, points[i + 2]);
    maxZ = Math.max(maxZ, points[i + 2]);
  }
  
  return [minX, maxX, minY, maxY, minZ, maxZ];
}

export function getVoxelValueAtPosition(position, volumeData) {
  const { dimensions, spacing, origin, voxelData } = volumeData;
  
  const x = Math.floor((position.x - origin[0]) / spacing[0]);
  const y = Math.floor((position.y - origin[1]) / spacing[1]);
  const z = Math.floor((position.z - origin[2]) / spacing[2]);
  
  if (x < 0 || x >= dimensions[0] || y < 0 || y >= dimensions[1] || z < 0 || z >= dimensions[2]) {
    return -1;
  }
  
  const index = z * dimensions[0] * dimensions[1] + y * dimensions[0] + x;
  return voxelData[index];
}

export function getLayerAtPosition(position, volumeData) {
  const value = getVoxelValueAtPosition(position, volumeData);
  if (value === -1) return null;
  
  return volumeData.layers[value] || null;
}
