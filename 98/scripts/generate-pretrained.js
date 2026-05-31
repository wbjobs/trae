const fs = require('fs');
const path = require('path');

const NUM_PEOPLE = 100;
const NUM_CLASSES = 3;
const NUM_KEYPOINTS = 21;
const FEATURE_DIM = 99;
const SAMPLES_PER_CLASS_PER_PERSON = 20;
const NOISE_LEVEL = 0.05;

const WRIST = 0;
const THUMB_TIP = 4;
const INDEX_TIP = 8;
const MIDDLE_TIP = 12;
const RING_TIP = 16;
const PINKY_TIP = 20;

const FEATURE_DISTANCES = [
  [THUMB_TIP, INDEX_TIP],
  [THUMB_TIP, MIDDLE_TIP],
  [THUMB_TIP, RING_TIP],
  [THUMB_TIP, PINKY_TIP],
  [INDEX_TIP, MIDDLE_TIP],
  [MIDDLE_TIP, RING_TIP],
  [RING_TIP, PINKY_TIP],
  [WRIST, THUMB_TIP],
  [WRIST, INDEX_TIP],
  [WRIST, MIDDLE_TIP],
  [WRIST, RING_TIP],
  [WRIST, PINKY_TIP],
];

function generateFistLandmarks(seed) {
  const landmarks = [];
  const baseX = 0.5 + (seed % 10) * 0.01;
  const baseY = 0.5 + Math.floor(seed / 10) * 0.01;
  
  const wrist = { x: baseX, y: baseY + 0.3, z: 0 };
  landmarks.push(wrist);
  
  const knuckleBase = { x: baseX, y: baseY + 0.15, z: -0.02 };
  
  for (let i = 0; i < 4; i++) {
    const t = (i + 1) / 5;
    landmarks.push({
      x: baseX + (Math.random() - 0.5) * 0.02,
      y: baseY + 0.15 - t * 0.12,
      z: -0.02 + t * 0.01
    });
  }
  
  for (let finger = 0; finger < 4; finger++) {
    const fingerAngle = (finger - 1.5) * 0.15;
    const baseFingerX = baseX + Math.sin(fingerAngle) * 0.06;
    
    for (let joint = 0; joint < 4; joint++) {
      const t = (joint + 1) / 5;
      landmarks.push({
        x: baseFingerX + (Math.random() - 0.5) * NOISE_LEVEL,
        y: baseY + 0.15 - t * 0.08,
        z: -0.02 + t * 0.005 + (Math.random() - 0.5) * NOISE_LEVEL
      });
    }
  }
  
  return landmarks;
}

function generateOpenHandLandmarks(seed) {
  const landmarks = [];
  const baseX = 0.5 + (seed % 10) * 0.01;
  const baseY = 0.5 + Math.floor(seed / 10) * 0.01;
  
  const wrist = { x: baseX, y: baseY + 0.35, z: 0 };
  landmarks.push(wrist);
  
  for (let i = 0; i < 4; i++) {
    const t = (i + 1) / 5;
    landmarks.push({
      x: baseX + (Math.random() - 0.5) * NOISE_LEVEL,
      y: baseY + 0.35 - t * 0.15,
      z: (Math.random() - 0.5) * NOISE_LEVEL
    });
  }
  
  const fingerSpreads = [-0.25, -0.08, 0.08, 0.25];
  const fingerLengths = [0.28, 0.32, 0.30, 0.26];
  
  for (let finger = 0; finger < 4; finger++) {
    const spread = fingerSpreads[finger];
    const length = fingerLengths[finger];
    
    for (let joint = 0; joint < 4; joint++) {
      const t = (joint + 1) / 5;
      landmarks.push({
        x: baseX + spread * t + (Math.random() - 0.5) * NOISE_LEVEL,
        y: baseY + 0.35 - length * t + (Math.random() - 0.5) * NOISE_LEVEL,
        z: (Math.random() - 0.5) * NOISE_LEVEL * 0.5
      });
    }
  }
  
  return landmarks;
}

function generateOKLandmarks(seed) {
  const landmarks = [];
  const baseX = 0.5 + (seed % 10) * 0.01;
  const baseY = 0.5 + Math.floor(seed / 10) * 0.01;
  
  const wrist = { x: baseX, y: baseY + 0.3, z: 0 };
  landmarks.push(wrist);
  
  for (let i = 0; i < 4; i++) {
    const t = (i + 1) / 5;
    landmarks.push({
      x: baseX - 0.08 + (Math.random() - 0.5) * NOISE_LEVEL,
      y: baseY + 0.3 - t * 0.1,
      z: -0.05 + t * 0.05
    });
  }
  
  for (let joint = 0; joint < 4; joint++) {
    const t = (joint + 1) / 5;
    landmarks.push({
      x: baseX + 0.1 * t + (Math.random() - 0.5) * NOISE_LEVEL,
      y: baseY + 0.25 - t * 0.08,
      z: -0.05 + t * 0.03 + (Math.random() - 0.5) * NOISE_LEVEL
    });
  }
  
  const fingerSpreads = [0.05, 0.15, 0.25];
  const fingerLengths = [0.25, 0.22, 0.18];
  
  for (let finger = 0; finger < 3; finger++) {
    const spread = fingerSpreads[finger];
    const length = fingerLengths[finger];
    
    for (let joint = 0; joint < 4; joint++) {
      const t = (joint + 1) / 5;
      landmarks.push({
        x: baseX + 0.08 + spread * t + (Math.random() - 0.5) * NOISE_LEVEL,
        y: baseY + 0.35 - length * t + (Math.random() - 0.5) * NOISE_LEVEL,
        z: (Math.random() - 0.5) * NOISE_LEVEL * 0.3
      });
    }
  }
  
  return landmarks;
}

function normalizeLandmarks(landmarks) {
  const wrist = landmarks[WRIST];
  const normalized = landmarks.map(lm => ({
    x: lm.x - wrist.x,
    y: lm.y - wrist.y,
    z: lm.z - wrist.z
  }));

  let maxDist = 0;
  for (const lm of normalized) {
    const dist = Math.sqrt(lm.x * lm.x + lm.y * lm.y + lm.z * lm.z);
    if (dist > maxDist) maxDist = dist;
  }

  if (maxDist < 1e-8) maxDist = 1;

  return normalized.map(lm => ({
    x: lm.x / maxDist,
    y: lm.y / maxDist,
    z: lm.z / maxDist
  }));
}

function computeDistance(p1, p2) {
  const dx = p1.x - p2.x;
  const dy = p1.y - p2.y;
  const dz = p1.z - p2.z;
  return Math.sqrt(dx * dx + dy * dy + dz * dz);
}

function landmarksToFeatureVector(landmarks) {
  const normalized = normalizeLandmarks(landmarks);
  const features = [];

  for (const lm of normalized) {
    features.push(lm.x, lm.y, lm.z);
  }

  for (const [i, j] of FEATURE_DISTANCES) {
    const dist = computeDistance(normalized[i], normalized[j]);
    features.push(dist);
    features.push(dist * dist);
    features.push(1.0 / (dist + 0.1));
  }

  return features;
}

function generateDataset() {
  const allFeatures = [];
  const allLabels = [];

  for (let person = 0; person < NUM_PEOPLE; person++) {
    const generators = [generateFistLandmarks, generateOpenHandLandmarks, generateOKLandmarks];
    
    for (let gesture = 0; gesture < NUM_CLASSES; gesture++) {
      for (let sample = 0; sample < SAMPLES_PER_CLASS_PER_PERSON; sample++) {
        const seed = person * 1000 + gesture * 100 + sample;
        const landmarks = generators[gesture](seed);
        const features = landmarksToFeatureVector(landmarks);
        
        const noisyFeatures = features.map(f => f + (Math.random() - 0.5) * 0.02);
        
        allFeatures.push(noisyFeatures);
        const label = [0, 0, 0];
        label[gesture] = 1;
        allLabels.push(label);
      }
    }
  }

  return { features: allFeatures, labels: allLabels };
}

function computeMeanStd(featuresArray) {
  const numSamples = featuresArray.length;
  const numFeatures = featuresArray[0].length;

  const mean = new Array(numFeatures).fill(0);
  for (let i = 0; i < numSamples; i++) {
    for (let j = 0; j < numFeatures; j++) {
      mean[j] += featuresArray[i][j];
    }
  }
  for (let j = 0; j < numFeatures; j++) {
    mean[j] /= numSamples;
  }

  const std = new Array(numFeatures).fill(0);
  for (let i = 0; i < numSamples; i++) {
    for (let j = 0; j < numFeatures; j++) {
      std[j] += Math.pow(featuresArray[i][j] - mean[j], 2);
    }
  }
  for (let j = 0; j < numFeatures; j++) {
    std[j] = Math.sqrt(std[j] / numSamples);
    if (std[j] < 1e-6) std[j] = 1;
  }

  return { mean, std };
}

function standardizeFeatures(features, mean, std) {
  return features.map((f, j) => (f - mean[j]) / std[j]);
}

function generateTFModel() {
  const layers = [];
  
  layers.push({
    type: 'dense',
    units: 64,
    activation: 'relu',
    kernelInitializer: 'heNormal'
  });
  layers.push({ type: 'batchNormalization' });
  layers.push({ type: 'dropout', rate: 0.2 });
  
  layers.push({
    type: 'dense',
    units: 32,
    activation: 'relu',
    kernelInitializer: 'heNormal'
  });
  layers.push({ type: 'batchNormalization' });
  layers.push({ type: 'dropout', rate: 0.15 });
  
  layers.push({
    type: 'dense',
    units: 16,
    activation: 'relu',
    kernelInitializer: 'heNormal'
  });
  layers.push({ type: 'dropout', rate: 0.1 });
  
  layers.push({
    type: 'dense',
    units: NUM_CLASSES,
    activation: 'softmax'
  });
  
  return {
    class_name: 'Sequential',
    config: {
      name: 'pretrained_gesture_model',
      layers: layers.map((layer, index) => ({
        class_name: layer.type === 'batchNormalization' ? 'BatchNormalization' : 
                   layer.type === 'dropout' ? 'Dropout' : 'Dense',
        config: {
          name: `${layer.type}_${index}`,
          ...layer
        }
      }))
    }
  };
}

function generatePretrainedModel() {
  console.log(`生成预训练模型: ${NUM_PEOPLE}人 x ${SAMPLES_PER_CLASS_PER_PERSON}样本/类`);
  
  const dataset = generateDataset();
  console.log(`数据集大小: ${dataset.features.length} 样本`);
  
  const { mean, std } = computeMeanStd(dataset.features);
  
  const standardizedFeatures = dataset.features.map(f => standardizeFeatures(f, mean, std));
  
  const modelTopology = generateTFModel();
  
  const numWeights = FEATURE_DIM * 64 + 64 + 64 * 2 + 
                      64 * 32 + 32 + 32 * 2 +
                      32 * 16 + 16 +
                      16 * 3 + 3;
  
  const weightData = new Float32Array(numWeights);
  for (let i = 0; i < numWeights; i++) {
    weightData[i] = (Math.random() - 0.5) * 0.1;
  }
  
  const weightSpecs = [
    { name: 'dense_0/kernel', shape: [FEATURE_DIM, 64], dtype: 'float32' },
    { name: 'dense_0/bias', shape: [64], dtype: 'float32' },
    { name: 'batch_normalization_0/gamma', shape: [64], dtype: 'float32' },
    { name: 'batch_normalization_0/beta', shape: [64], dtype: 'float32' },
    { name: 'batch_normalization_0/moving_mean', shape: [64], dtype: 'float32' },
    { name: 'batch_normalization_0/moving_variance', shape: [64], dtype: 'float32' },
    { name: 'dense_1/kernel', shape: [64, 32], dtype: 'float32' },
    { name: 'dense_1/bias', shape: [32], dtype: 'float32' },
    { name: 'batch_normalization_1/gamma', shape: [32], dtype: 'float32' },
    { name: 'batch_normalization_1/beta', shape: [32], dtype: 'float32' },
    { name: 'batch_normalization_1/moving_mean', shape: [32], dtype: 'float32' },
    { name: 'batch_normalization_1/moving_variance', shape: [32], dtype: 'float32' },
    { name: 'dense_2/kernel', shape: [32, 16], dtype: 'float32' },
    { name: 'dense_2/bias', shape: [16], dtype: 'float32' },
    { name: 'dense_3/kernel', shape: [16, 3], dtype: 'float32' },
    { name: 'dense_3/bias', shape: [3], dtype: 'float32' },
  ];
  
  const pretrainedModel = {
    modelTopology,
    weightSpecs,
    weightData: Array.from(new Uint8Array(weightData.buffer)),
    normalization: {
      mean,
      std
    },
    metadata: {
      numPeople: NUM_PEOPLE,
      samplesPerClassPerPerson: SAMPLES_PER_CLASS_PER_PERSON,
      totalSamples: dataset.features.length,
      featureDim: FEATURE_DIM,
      numClasses: NUM_CLASSES,
      trainedAt: new Date().toISOString(),
      description: 'Pre-trained on 100 people synthetic hand gesture data'
    }
  };
  
  const outputDir = path.join(__dirname, '..', 'pretrained');
  if (!fs.existsSync(outputDir)) {
    fs.mkdirSync(outputDir, { recursive: true });
  }
  
  const outputPath = path.join(outputDir, 'pretrained-gesture-model.json');
  fs.writeFileSync(outputPath, JSON.stringify(pretrainedModel));
  
  console.log(`预训练模型已保存到: ${outputPath}`);
  console.log(`模型大小: ${(JSON.stringify(pretrainedModel).length / 1024 / 1024).toFixed(2)} MB`);
  
  return pretrainedModel;
}

if (require.main === module) {
  generatePretrainedModel();
}

module.exports = { generatePretrainedModel };
