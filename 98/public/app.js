const GESTURE_NAMES = ['✊ 握拳', '🖐️ 五指张开', '👌 OK'];
const NUM_CLASSES = 3;
const NUM_KEYPOINTS = 21;
const SAMPLES_PER_GESTURE = 30;

const WRIST = 0;
const THUMB_TIP = 4;
const INDEX_TIP = 8;
const MIDDLE_TIP = 12;
const RING_TIP = 16;
const PINKY_TIP = 20;

const HAND_CONNECTIONS = [
  [0, 1], [1, 2], [2, 3], [3, 4],
  [0, 5], [5, 6], [6, 7], [7, 8],
  [5, 9], [9, 10], [10, 11], [11, 12],
  [9, 13], [13, 14], [14, 15], [15, 16],
  [13, 17], [0, 17], [17, 18], [18, 19], [19, 20]
];

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

const NUM_DIST_FEATURES = FEATURE_DISTANCES.length * 3;
const FEATURE_DIM = NUM_KEYPOINTS * 3 + NUM_DIST_FEATURES;

const AUGMENTATION_FACTOR = 3;
const NOISE_STD = 0.01;

let featureMean = null;
let featureStd = null;

const videoElement = document.getElementById('video');
const canvasElement = document.getElementById('canvas');
const canvasCtx = canvasElement.getContext('2d');
const statusElement = document.getElementById('status');
const predictionResult = document.getElementById('predictionResult');

let hands = null;
let camera = null;
let currentLandmarks = null;
let isRecording = false;
let currentGesture = null;
let recordingFrameCount = 0;
let isInferring = false;

const trainingData = {
  0: [],
  1: [],
  2: []
};

let model = null;
let trainingChart = null;
let trainingHistory = {
  loss: [],
  accuracy: [],
  valLoss: [],
  valAcc: []
};

function setStatus(message, type = 'info') {
  statusElement.textContent = message;
  statusElement.className = `status ${type}`;
}

function updateSampleCounts() {
  document.getElementById('count0').textContent = trainingData[0].length;
  document.getElementById('count1').textContent = trainingData[1].length;
  document.getElementById('count2').textContent = trainingData[2].length;
  
  const hasEnoughData = Object.values(trainingData).every(arr => arr.length >= 10);
  document.getElementById('trainBtn').disabled = !hasEnoughData;
}

function updateConfidence(predictions) {
  predictions.forEach((conf, i) => {
    const percent = (conf * 100).toFixed(1);
    document.getElementById(`conf${i}`).textContent = `${percent}%`;
    document.getElementById(`bar${i}`).style.width = `${percent}%`;
  });
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

  const scaled = normalized.map(lm => ({
    x: lm.x / maxDist,
    y: lm.y / maxDist,
    z: lm.z / maxDist
  }));

  return { normalized: scaled, scale: maxDist };
}

function computeDistance(p1, p2) {
  const dx = p1.x - p2.x;
  const dy = p1.y - p2.y;
  const dz = p1.z - p2.z;
  return Math.sqrt(dx * dx + dy * dy + dz * dz);
}

function landmarksToFeatureVector(landmarks) {
  const { normalized } = normalizeLandmarks(landmarks);
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

function drawLandmarks(results) {
  canvasCtx.save();
  canvasCtx.clearRect(0, 0, canvasElement.width, canvasElement.height);
  canvasCtx.drawImage(results.image, 0, 0, canvasElement.width, canvasElement.height);

  if (results.multiHandLandmarks) {
    for (const landmarks of results.multiHandLandmarks) {
      if (typeof drawConnectors === 'function') {
        drawConnectors(canvasCtx, landmarks, HAND_CONNECTIONS,
          { color: isRecording ? '#e74c3c' : '#00FF00', lineWidth: 3 });
      }
      if (typeof drawLandmarks === 'function') {
        drawLandmarks(canvasCtx, landmarks, { color: '#FF0000', lineWidth: 2, radius: 4 });
      }
    }
  }
  canvasCtx.restore();
}

function onResults(results) {
  drawLandmarks(results);

  if (results.multiHandLandmarks && results.multiHandLandmarks.length > 0) {
    currentLandmarks = results.multiHandLandmarks[0];
    document.getElementById('recordBtn').disabled = currentGesture === null;

    if (isRecording && currentGesture !== null) {
      const features = landmarksToFeatureVector(currentLandmarks);
      trainingData[currentGesture].push(features);
      recordingFrameCount++;
      updateSampleCounts();

      if (recordingFrameCount >= SAMPLES_PER_GESTURE) {
        stopRecording();
        setStatus(`已采集 ${SAMPLES_PER_GESTURE} 个 ${GESTURE_NAMES[currentGesture]} 样本`, 'success');
      }
    }

    if (isInferring && model) {
      predict(currentLandmarks);
    }
  } else {
    currentLandmarks = null;
    document.getElementById('recordBtn').disabled = true;
  }
}

async function initMediaPipe() {
  try {
    if (typeof Hands === 'undefined') {
      throw new Error('MediaPipe Hands 未加载');
    }
    
    hands = new Hands({
      locateFile: (file) => {
        return `https://cdn.jsdelivr.net/npm/@mediapipe/hands@0.4.1675469240/${file}`;
      }
    });

    hands.setOptions({
      maxNumHands: 1,
      modelComplexity: 1,
      minDetectionConfidence: 0.5,
      minTrackingConfidence: 0.5
    });

    hands.onResults(onResults);

    if (typeof Camera === 'undefined') {
      throw new Error('Camera 工具未加载');
    }

    camera = new Camera(videoElement, {
      onFrame: async () => {
        await hands.send({ image: videoElement });
      },
      width: 640,
      height: 480
    });

    await camera.start();

    canvasElement.width = 640;
    canvasElement.height = 480;

    setStatus('摄像头已就绪，请选择手势并开始采集数据', 'success');
  } catch (error) {
    console.error('Failed to initialize MediaPipe:', error);
    setStatus('摄像头初始化失败: ' + error.message, 'error');
  }
}

function createModel() {
  const m = tf.sequential();

  m.add(tf.layers.dense({
    units: 64,
    activation: 'relu',
    inputShape: [FEATURE_DIM],
    kernelInitializer: 'heNormal'
  }));
  m.add(tf.layers.batchNormalization());
  m.add(tf.layers.dropout({ rate: 0.2 }));

  m.add(tf.layers.dense({
    units: 32,
    activation: 'relu',
    kernelInitializer: 'heNormal'
  }));
  m.add(tf.layers.batchNormalization());
  m.add(tf.layers.dropout({ rate: 0.15 }));

  m.add(tf.layers.dense({
    units: 16,
    activation: 'relu',
    kernelInitializer: 'heNormal'
  }));
  m.add(tf.layers.dropout({ rate: 0.1 }));

  m.add(tf.layers.dense({
    units: NUM_CLASSES,
    activation: 'softmax'
  }));

  m.compile({
    optimizer: tf.train.adam(0.001),
    loss: 'categoricalCrossentropy',
    metrics: ['accuracy']
  });

  return m;
}

function augmentFeatures(features, stdDev = NOISE_STD) {
  return features.map(f => f + (Math.random() - 0.5) * 2 * stdDev);
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

function checkDataQuality(featuresArray, labelsArray) {
  const classCounts = [0, 0, 0];
  for (const label of labelsArray) {
    classCounts[label.indexOf(1)]++;
  }
  
  const numFeatures = featuresArray[0].length;
  const classMeans = [[], [], []];
  
  for (let c = 0; c < NUM_CLASSES; c++) {
    classMeans[c] = new Array(numFeatures).fill(0);
  }
  
  for (let i = 0; i < featuresArray.length; i++) {
    const c = labelsArray[i].indexOf(1);
    for (let j = 0; j < numFeatures; j++) {
      classMeans[c][j] += featuresArray[i][j];
    }
  }
  
  for (let c = 0; c < NUM_CLASSES; c++) {
    if (classCounts[c] > 0) {
      classMeans[c] = classMeans[c].map(v => v / classCounts[c]);
    }
  }

  let totalDist = 0;
  let pairCount = 0;
  for (let c1 = 0; c1 < NUM_CLASSES; c1++) {
    for (let c2 = c1 + 1; c2 < NUM_CLASSES; c2++) {
      let dist = 0;
      for (let j = 0; j < numFeatures; j++) {
        dist += Math.pow(classMeans[c1][j] - classMeans[c2][j], 2);
      }
      totalDist += Math.sqrt(dist);
      pairCount++;
    }
  }
  
  const avgClassDist = pairCount > 0 ? totalDist / pairCount : 0;

  return {
    classCounts,
    avgClassDist,
    isSeparable: avgClassDist > 0.5
  };
}

function prepareTrainingData() {
  let allFeatures = [];
  let allLabels = [];

  for (let gesture = 0; gesture < NUM_CLASSES; gesture++) {
    for (const features of trainingData[gesture]) {
      allFeatures.push([...features]);
      const label = [0, 0, 0];
      label[gesture] = 1;
      allLabels.push(label);

      for (let aug = 0; aug < AUGMENTATION_FACTOR - 1; aug++) {
        allFeatures.push(augmentFeatures(features));
        allLabels.push(label);
      }
    }
  }

  const qualityCheck = checkDataQuality(allFeatures, allLabels);
  console.log('数据质量检查:', qualityCheck);

  if (!qualityCheck.isSeparable) {
    console.warn('警告: 类别间距离较小，可能需要更多或更好的样本');
  }

  const { mean, std } = computeMeanStd(allFeatures);
  featureMean = mean;
  featureStd = std;

  const standardizedFeatures = allFeatures.map(f => standardizeFeatures(f, mean, std));

  const indices = tf.util.createShuffledIndices(standardizedFeatures.length);
  const shuffledFeatures = indices.map(i => standardizedFeatures[i]);
  const shuffledLabels = indices.map(i => allLabels[i]);

  const xs = tf.tensor2d(shuffledFeatures, [shuffledFeatures.length, FEATURE_DIM]);
  const ys = tf.tensor2d(shuffledLabels, [shuffledLabels.length, NUM_CLASSES]);

  return { xs, ys };
}

async function trainModel() {
  if (!Object.values(trainingData).every(arr => arr.length >= 10)) {
    setStatus('每个手势至少需要10个样本', 'warning');
    return;
  }

  setStatus('开始训练模型...', 'info');
  document.getElementById('trainBtn').disabled = true;

  try {
    if (model) {
      model.dispose();
    }
    model = createModel();

    const { xs, ys } = prepareTrainingData();
    trainingHistory = { loss: [], accuracy: [], valLoss: [], valAcc: [] };

    const totalSamples = xs.shape[0];
    console.log(`训练样本总数: ${totalSamples}, 特征维度: ${FEATURE_DIM}`);

    const TOTAL_EPOCHS = 200;
    const WARMUP_EPOCHS = 10;
    const INITIAL_LR = 0.0005;
    const PEAK_LR = 0.002;
    const LR_DECAY = 0.995;
    const EARLY_STOPPING_PATIENCE = 30;
    let bestValLoss = Infinity;
    let patienceCounter = 0;

    await model.fit(xs, ys, {
      epochs: TOTAL_EPOCHS,
      batchSize: Math.min(32, Math.floor(totalSamples * 0.1)),
      validationSplit: 0.2,
      shuffle: true,
      verbose: 0,
      callbacks: {
        onEpochBegin: (epoch) => {
          let currentLR;
          if (epoch < WARMUP_EPOCHS) {
            currentLR = INITIAL_LR + (PEAK_LR - INITIAL_LR) * (epoch / WARMUP_EPOCHS);
          } else {
            currentLR = PEAK_LR * Math.pow(LR_DECAY, epoch - WARMUP_EPOCHS);
          }
          model.optimizer.learningRate = currentLR;
        },
        onEpochEnd: (epoch, logs) => {
          trainingHistory.loss.push(logs.loss);
          trainingHistory.accuracy.push(logs.acc * 100);
          trainingHistory.valLoss.push(logs.val_loss !== undefined ? logs.val_loss : logs.loss);
          trainingHistory.valAcc.push((logs.val_acc !== undefined ? logs.val_acc : logs.acc) * 100);

          if (epoch % 5 === 0 || epoch < 20) {
            updateTrainingChart();
          }

          const valLossStr = logs.val_loss !== undefined ? logs.val_loss.toFixed(4) : 'N/A';
          const valAccStr = logs.val_acc !== undefined ? (logs.val_acc * 100).toFixed(1) : 'N/A';
          setStatus(
            `训练中... Epoch ${epoch + 1}/${TOTAL_EPOCHS} - Loss: ${logs.loss.toFixed(4)} - Acc: ${(logs.acc * 100).toFixed(1)}% - ValLoss: ${valLossStr} - ValAcc: ${valAccStr}%`,
            'info'
          );

          if (logs.val_loss !== undefined) {
            if (logs.val_loss < bestValLoss) {
              bestValLoss = logs.val_loss;
              patienceCounter = 0;
            } else {
              patienceCounter++;
            }

            if (patienceCounter >= EARLY_STOPPING_PATIENCE && epoch > 50) {
              setStatus(`早停触发！在 Epoch ${epoch + 1} 停止训练 (最佳ValLoss: ${bestValLoss.toFixed(4)})`, 'warning');
              model.stopTraining = true;
            }
          }
        }
      }
    });

    xs.dispose();
    ys.dispose();

    updateTrainingChart();

    const finalAcc = trainingHistory.accuracy[trainingHistory.accuracy.length - 1];
    const finalValAcc = trainingHistory.valAcc[trainingHistory.valAcc.length - 1];
    const bestValAcc = Math.max(...trainingHistory.valAcc);
    
    if (finalAcc < 50 && finalValAcc < 50) {
      setStatus(
        `⚠️ 训练效果不佳 (Acc: ${finalAcc.toFixed(1)}%)。建议：采集更多样本、确保手势清晰、尝试不同角度`,
        'warning'
      );
    } else {
      setStatus(
        `训练完成！训练准确率: ${finalAcc.toFixed(1)}% / 最佳验证准确率: ${bestValAcc.toFixed(1)}%`,
        'success'
      );
    }
    
    document.getElementById('inferBtn').disabled = false;
    document.getElementById('saveModelBtn').disabled = false;
    document.getElementById('trainBtn').disabled = false;
  } catch (error) {
    console.error('Training error:', error);
    setStatus('训练失败: ' + error.message, 'error');
    document.getElementById('trainBtn').disabled = false;
  }
}

function predict(landmarks) {
  if (!model) return;

  tf.tidy(() => {
    let features = landmarksToFeatureVector(landmarks);
    
    if (featureMean && featureStd) {
      features = standardizeFeatures(features, featureMean, featureStd);
    }
    
    const input = tf.tensor2d([features], [1, FEATURE_DIM]);
    const predictions = model.predict(input);
    const confidences = predictions.dataSync();

    updateConfidence(Array.from(confidences));

    const maxIndex = confidences.indexOf(Math.max(...confidences));
    const maxConf = confidences[maxIndex];

    if (maxConf > 0.7) {
      predictionResult.textContent = `预测结果: ${GESTURE_NAMES[maxIndex]} (${(maxConf * 100).toFixed(1)}%)`;
      predictionResult.className = 'status success';
    } else if (maxConf > 0.4) {
      predictionResult.textContent = `可能是: ${GESTURE_NAMES[maxIndex]} (${(maxConf * 100).toFixed(1)}%)`;
      predictionResult.className = 'status warning';
    } else {
      predictionResult.textContent = '未识别到手势';
      predictionResult.className = 'status info';
    }
  });
}

function startRecording() {
  if (currentGesture === null) {
    setStatus('请先选择一个手势', 'warning');
    return;
  }
  isRecording = true;
  recordingFrameCount = 0;
  document.getElementById('recordBtn').textContent = '⏹️ 停止采集';
  document.getElementById('recordBtn').classList.add('recording');
  setStatus(`正在采集 ${GESTURE_NAMES[currentGesture]} 数据...`, 'warning');
}

function stopRecording() {
  isRecording = false;
  document.getElementById('recordBtn').textContent = '⏺️ 开始采集 (按R)';
  document.getElementById('recordBtn').classList.remove('recording');
}

function startInference() {
  if (!model) {
    setStatus('请先训练模型', 'warning');
    return;
  }
  isInferring = true;
  document.getElementById('inferBtn').disabled = true;
  document.getElementById('stopInferBtn').disabled = false;
  setStatus('实时推理已启动', 'success');
}

function stopInference() {
  isInferring = false;
  document.getElementById('inferBtn').disabled = false;
  document.getElementById('stopInferBtn').disabled = true;
  updateConfidence([0, 0, 0]);
  predictionResult.textContent = '等待模型训练...';
  predictionResult.className = 'status info';
  setStatus('实时推理已停止', 'info');
}

function clearData() {
  trainingData[0] = [];
  trainingData[1] = [];
  trainingData[2] = [];
  updateSampleCounts();
  setStatus('所有采集数据已清空', 'info');
}

function resetModel() {
  stopInference();
  if (model) {
    model.dispose();
    model = null;
  }
  if (pretrainedBaseWeights) {
    pretrainedBaseWeights.forEach(w => w.dispose());
    pretrainedBaseWeights = null;
  }
  isPretrainedLoaded = false;
  featureMean = null;
  featureStd = null;
  trainingHistory = { loss: [], accuracy: [], valLoss: [], valAcc: [] };
  updateTrainingChart();
  document.getElementById('inferBtn').disabled = true;
  document.getElementById('saveModelBtn').disabled = true;
  document.getElementById('fineTuneBtn').disabled = true;
  setStatus('模型已重置', 'info');
  setTransferStatus('', 'info');
}

function initChart() {
  const ctx = document.getElementById('trainingChart').getContext('2d');
  trainingChart = new Chart(ctx, {
    type: 'line',
    data: {
      labels: [],
      datasets: [
        {
          label: 'Train Loss',
          data: [],
          borderColor: '#e74c3c',
          backgroundColor: 'rgba(231, 76, 60, 0.1)',
          yAxisID: 'y',
          tension: 0.3
        },
        {
          label: 'Val Loss',
          data: [],
          borderColor: '#e67e22',
          backgroundColor: 'rgba(230, 126, 34, 0.1)',
          yAxisID: 'y',
          tension: 0.3,
          borderDash: [5, 5]
        },
        {
          label: 'Train Acc (%)',
          data: [],
          borderColor: '#27ae60',
          backgroundColor: 'rgba(39, 174, 96, 0.1)',
          yAxisID: 'y1',
          tension: 0.3
        },
        {
          label: 'Val Acc (%)',
          data: [],
          borderColor: '#3498db',
          backgroundColor: 'rgba(52, 152, 219, 0.1)',
          yAxisID: 'y1',
          tension: 0.3,
          borderDash: [5, 5]
        }
      ]
    },
    options: {
      responsive: true,
      maintainAspectRatio: false,
      animation: false,
      interaction: {
        mode: 'index',
        intersect: false,
      },
      scales: {
        y: {
          type: 'linear',
          display: true,
          position: 'left',
          title: { display: true, text: 'Loss' }
        },
        y1: {
          type: 'linear',
          display: true,
          position: 'right',
          title: { display: true, text: 'Accuracy (%)' },
          min: 0,
          max: 100,
          grid: { drawOnChartArea: false }
        },
        x: {
          title: { display: true, text: 'Epoch' }
        }
      }
    }
  });
}

function updateTrainingChart() {
  if (!trainingChart) return;

  trainingChart.data.labels = trainingHistory.loss.map((_, i) => i + 1);
  trainingChart.data.datasets[0].data = trainingHistory.loss;
  trainingChart.data.datasets[1].data = trainingHistory.valLoss || [];
  trainingChart.data.datasets[2].data = trainingHistory.accuracy;
  trainingChart.data.datasets[3].data = trainingHistory.valAcc || [];
  trainingChart.update('none');
}

async function saveModel() {
  if (!model) {
    setStatus('没有可保存的模型', 'warning');
    return;
  }

  try {
    const modelName = document.getElementById('modelName').value || 'gesture-model';
    
    const saved = await model.save('localstorage://temp-model');
    localStorage.removeItem('tensorflowjs_models/temp-model/info');
    localStorage.removeItem('tensorflowjs_models/temp-model/model_topology');
    localStorage.removeItem('tensorflowjs_models/temp-model/weight_data');
    localStorage.removeItem('tensorflowjs_models/temp-model/weight_specs');

    const jsonData = {
      modelTopology: saved.modelTopology,
      weightSpecs: saved.weightSpecs,
      weightData: Array.from(new Uint8Array(saved.weightData)),
      normalization: {
        mean: featureMean,
        std: featureStd
      },
      featureConfig: {
        featureDim: FEATURE_DIM,
        numDistFeatures: NUM_DIST_FEATURES,
        featureDistances: FEATURE_DISTANCES
      },
      trainingData: {
        samples: {
          0: trainingData[0].length,
          1: trainingData[1].length,
          2: trainingData[2].length
        }
      }
    };

    const blob = new Blob([JSON.stringify(jsonData)], { type: 'application/json' });
    const formData = new FormData();
    formData.append('model', blob, 'model.json');
    formData.append('modelName', modelName);
    formData.append('metadata', JSON.stringify({
      gestureNames: GESTURE_NAMES,
      featureDim: FEATURE_DIM,
      trainedAt: new Date().toISOString()
    }));

    const response = await fetch('/api/model/save', {
      method: 'POST',
      body: formData
    });

    const result = await response.json();
    
    if (result.success) {
      setStatus(`模型已保存: ${result.objectName}`, 'success');
      listModels();
    } else {
      setStatus('保存失败: ' + result.error, 'error');
    }
  } catch (error) {
    console.error('Save error:', error);
    setStatus('保存失败: ' + error.message, 'error');
  }
}

async function listModels() {
  try {
    const response = await fetch('/api/models');
    const data = await response.json();
    
    const listEl = document.getElementById('modelList');
    listEl.innerHTML = '';
    
    if (data.models.length === 0) {
      listEl.innerHTML = '<p style="color: #666; text-align: center;">暂无保存的模型</p>';
      return;
    }
    
    for (const modelInfo of data.models) {
      const item = document.createElement('div');
      item.className = 'model-item';
      item.innerHTML = `
        <span>${modelInfo.name}<br><small>${new Date(modelInfo.lastModified).toLocaleString()} - ${(modelInfo.size / 1024).toFixed(1)} KB</small></span>
        <button class="btn-primary" onclick="loadModel('${modelInfo.name}')">加载</button>
        <button class="btn-danger" onclick="deleteModel('${modelInfo.name}')">删除</button>
      `;
      listEl.appendChild(item);
    }
  } catch (error) {
    console.error('List error:', error);
    setStatus('获取模型列表失败', 'error');
  }
}

async function loadModel(objectName) {
  try {
    setStatus(`正在加载模型: ${objectName}`, 'info');
    
    const response = await fetch(`/api/model/${objectName}`);
    const data = await response.json();
    
    const weightData = new Uint8Array(data.weightData).buffer;
    
    const artifacts = {
      modelTopology: data.modelTopology,
      weightSpecs: data.weightSpecs,
      weightData: weightData
    };
    
    if (model) {
      model.dispose();
    }
    
    model = await tf.loadLayersModel({
      load: async () => artifacts
    });
    
    if (data.normalization) {
      featureMean = data.normalization.mean;
      featureStd = data.normalization.std;
    }
    
    if (data.trainingData) {
      trainingData[0] = [];
      trainingData[1] = [];
      trainingData[2] = [];
      updateSampleCounts();
    }
    
    setStatus('模型加载成功！', 'success');
    document.getElementById('inferBtn').disabled = false;
    document.getElementById('saveModelBtn').disabled = false;
  } catch (error) {
    console.error('Load error:', error);
    setStatus('加载模型失败: ' + error.message, 'error');
  }
}

async function deleteModel(objectName) {
  if (!confirm(`确定要删除模型 ${objectName} 吗？`)) return;
  
  try {
    const response = await fetch(`/api/model/${objectName}`, {
      method: 'DELETE'
    });
    
    if (response.ok) {
      setStatus('模型已删除', 'success');
      listModels();
    } else {
      setStatus('删除失败', 'error');
    }
  } catch (error) {
    console.error('Delete error:', error);
    setStatus('删除失败: ' + error.message, 'error');
  }
}

let isPretrainedLoaded = false;
let pretrainedBaseWeights = null;

function setTransferStatus(message, type = 'info') {
  const el = document.getElementById('transferStatus');
  el.textContent = message;
  el.className = `status ${type}`;
}

async function listPretrainedModels() {
  try {
    const response = await fetch('/api/pretrained-models');
    const data = await response.json();
    
    const listEl = document.getElementById('pretrainedModelList');
    listEl.innerHTML = '';
    
    if (data.models.length === 0) {
      listEl.innerHTML = '<p style="color: #666; text-align: center; font-size: 12px;">暂无预训练模型</p>';
      return;
    }
    
    for (const modelInfo of data.models) {
      const item = document.createElement('div');
      item.className = 'model-item';
      item.style.cursor = 'pointer';
      item.innerHTML = `
        <span><strong>${modelInfo.name}</strong><br>
        <small>${modelInfo.description || 'Pre-trained model'} | ${(modelInfo.size / 1024).toFixed(1)} KB</small></span>
        <button class="btn-primary" onclick="loadPretrainedModel('${modelInfo.name}')">加载</button>
      `;
      listEl.appendChild(item);
    }
  } catch (error) {
    console.error('List pretrained error:', error);
    setTransferStatus('获取预训练模型列表失败', 'error');
  }
}

async function loadPretrainedModel(filename) {
  try {
    setTransferStatus(`正在加载预训练模型: ${filename}...`, 'info');
    
    const response = await fetch(`/api/pretrained-model/${filename}`);
    const data = await response.json();
    
    const weightData = new Uint8Array(data.weightData).buffer;
    
    const artifacts = {
      modelTopology: data.modelTopology,
      weightSpecs: data.weightSpecs,
      weightData: weightData
    };
    
    if (model) {
      model.dispose();
      model = null;
    }
    
    model = await tf.loadLayersModel({
      load: async () => artifacts
    });
    
    pretrainedBaseWeights = model.getWeights().map(w => w.clone());
    
    if (data.normalization) {
      featureMean = data.normalization.mean;
      featureStd = data.normalization.std;
    }
    
    isPretrainedLoaded = true;
    
    setTransferStatus(`✓ 预训练模型加载成功！${data.metadata?.numPeople || ''}人数据训练`, 'success');
    setStatus(`预训练模型已加载 (${data.metadata?.numPeople || '100'}人数据)，请采集小样本微调`, 'success');
    
    document.getElementById('inferBtn').disabled = false;
    document.getElementById('saveModelBtn').disabled = false;
    document.getElementById('fineTuneBtn').disabled = false;
    
  } catch (error) {
    console.error('Load pretrained error:', error);
    setTransferStatus('加载预训练模型失败: ' + error.message, 'error');
  }
}

function freezeLayers(numTrainableLayers = 1) {
  if (!model) return;
  
  const layers = model.layers;
  const totalLayers = layers.length;
  const freezeUpTo = totalLayers - numTrainableLayers * 3;
  
  for (let i = 0; i < layers.length; i++) {
    if (i < freezeUpTo) {
      layers[i].trainable = false;
    } else {
      layers[i].trainable = true;
    }
  }
  
  console.log(`已冻结 ${freezeUpTo}/${totalLayers} 层，仅训练最后 ${totalLayers - freezeUpTo} 层`);
}

async function fineTuneModel() {
  if (!model || !isPretrainedLoaded) {
    setTransferStatus('请先加载预训练模型', 'warning');
    return;
  }
  
  const MIN_SAMPLES = 5;
  if (!Object.values(trainingData).every(arr => arr.length >= MIN_SAMPLES)) {
    setTransferStatus(`每个手势至少需要 ${MIN_SAMPLES} 个样本用于微调`, 'warning');
    return;
  }
  
  setTransferStatus('开始微调... 冻结底层，仅训练顶层', 'info');
  document.getElementById('fineTuneBtn').disabled = true;
  
  try {
    freezeLayers(1);
    
    model.compile({
      optimizer: tf.train.adam(0.0001),
      loss: 'categoricalCrossentropy',
      metrics: ['accuracy']
    });
    
    const { xs, ys } = prepareFineTuneData();
    
    const FINE_TUNE_EPOCHS = 3;
    const fineTuneHistory = { loss: [], accuracy: [], valLoss: [], valAcc: [] };
    
    await model.fit(xs, ys, {
      epochs: FINE_TUNE_EPOCHS,
      batchSize: Math.max(4, xs.shape[0] / 4),
      validationSplit: 0.2,
      shuffle: true,
      verbose: 0,
      callbacks: {
        onEpochEnd: (epoch, logs) => {
          fineTuneHistory.loss.push(logs.loss);
          fineTuneHistory.accuracy.push(logs.acc * 100);
          fineTuneHistory.valLoss.push(logs.val_loss !== undefined ? logs.val_loss : logs.loss);
          fineTuneHistory.valAcc.push((logs.val_acc !== undefined ? logs.val_acc : logs.acc) * 100);
          
          setTransferStatus(
            `微调 Epoch ${epoch + 1}/${FINE_TUNE_EPOCHS} - Loss: ${logs.loss.toFixed(4)} - Acc: ${(logs.acc * 100).toFixed(1)}%`,
            'info'
          );
        }
      }
    });
    
    for (let i = 0; i < FINE_TUNE_EPOCHS; i++) {
      trainingHistory.loss.push(fineTuneHistory.loss[i]);
      trainingHistory.accuracy.push(fineTuneHistory.accuracy[i]);
      trainingHistory.valLoss.push(fineTuneHistory.valLoss[i]);
      trainingHistory.valAcc.push(fineTuneHistory.valAcc[i]);
    }
    updateTrainingChart();
    
    xs.dispose();
    ys.dispose();
    
    const finalAcc = fineTuneHistory.accuracy[fineTuneHistory.accuracy.length - 1];
    setTransferStatus(`✓ 微调完成！最终准确率: ${finalAcc.toFixed(1)}%`, 'success');
    setStatus(`模型微调完成，准确率: ${finalAcc.toFixed(1)}%`, 'success');
    
    document.getElementById('fineTuneBtn').disabled = false;
    
  } catch (error) {
    console.error('Fine-tune error:', error);
    setTransferStatus('微调失败: ' + error.message, 'error');
    document.getElementById('fineTuneBtn').disabled = false;
  }
}

function prepareFineTuneData() {
  let allFeatures = [];
  let allLabels = [];

  for (let gesture = 0; gesture < NUM_CLASSES; gesture++) {
    for (const features of trainingData[gesture]) {
      allFeatures.push([...features]);
      const label = [0, 0, 0];
      label[gesture] = 1;
      allLabels.push(label);
    }
  }

  if (featureMean && featureStd) {
    allFeatures = allFeatures.map(f => standardizeFeatures(f, featureMean, featureStd));
  }

  const indices = tf.util.createShuffledIndices(allFeatures.length);
  const shuffledFeatures = indices.map(i => allFeatures[i]);
  const shuffledLabels = indices.map(i => allLabels[i]);

  const xs = tf.tensor2d(shuffledFeatures, [shuffledFeatures.length, FEATURE_DIM]);
  const ys = tf.tensor2d(shuffledLabels, [shuffledLabels.length, NUM_CLASSES]);

  return { xs, ys };
}

function setupEventListeners() {
  document.querySelectorAll('.gesture-btn').forEach(btn => {
    btn.addEventListener('click', () => {
      document.querySelectorAll('.gesture-btn').forEach(b => b.classList.remove('active'));
      btn.classList.add('active');
      currentGesture = parseInt(btn.dataset.gesture);
      document.getElementById('recordBtn').disabled = !currentLandmarks;
    });
  });

  document.getElementById('recordBtn').addEventListener('click', () => {
    if (isRecording) {
      stopRecording();
    } else {
      startRecording();
    }
  });

  document.getElementById('clearDataBtn').addEventListener('click', clearData);
  document.getElementById('trainBtn').addEventListener('click', trainModel);
  document.getElementById('inferBtn').addEventListener('click', startInference);
  document.getElementById('stopInferBtn').addEventListener('click', stopInference);
  document.getElementById('clearModelBtn').addEventListener('click', resetModel);
  document.getElementById('saveModelBtn').addEventListener('click', saveModel);
  document.getElementById('listModelsBtn').addEventListener('click', listModels);
  
  document.getElementById('loadPretrainedBtn').addEventListener('click', listPretrainedModels);
  document.getElementById('fineTuneBtn').addEventListener('click', fineTuneModel);

  document.addEventListener('keydown', (e) => {
    if (e.key.toLowerCase() === 'r' && !e.repeat) {
      if (currentGesture !== null && currentLandmarks) {
        if (isRecording) {
          stopRecording();
        } else {
          startRecording();
        }
      }
    }
  });
}

async function init() {
  initChart();
  setupEventListeners();
  await initMediaPipe();
  updateSampleCounts();
  listModels();
  listPretrainedModels();
}

init();
