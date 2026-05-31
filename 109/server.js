const express = require('express');
const cors = require('cors');
const path = require('path');

const app = express();
const PORT = 3000;

app.use(cors());
app.use(express.json());
app.use(express.static(path.join(__dirname, 'public')));

const clothPresets = {
  silk: {
    name: '丝绸',
    stiffness: 0.3,
    damping: 0.8,
    mass: 0.5,
    gravity: -9.8,
    windStrength: 0.3,
    description: '轻盈柔软，阻尼较高，适合模拟丝绸飘动'
  },
  cotton: {
    name: '棉布',
    stiffness: 0.6,
    damping: 0.5,
    mass: 1.0,
    gravity: -9.8,
    windStrength: 0.5,
    description: '中等刚度，适合模拟日常布料'
  },
  denim: {
    name: '牛仔布',
    stiffness: 0.9,
    damping: 0.3,
    mass: 1.5,
    gravity: -9.8,
    windStrength: 0.8,
    description: '坚硬厚重，抗风性强'
  },
  rubber: {
    name: '橡胶',
    stiffness: 0.4,
    damping: 0.9,
    mass: 2.0,
    gravity: -9.8,
    windStrength: 1.0,
    description: '高弹性，高阻尼，回弹效果明显'
  },
  custom: {
    name: '自定义',
    stiffness: 0.5,
    damping: 0.5,
    mass: 1.0,
    gravity: -9.8,
    windStrength: 0.5,
    description: '用户自定义参数'
  }
};

let currentPreset = 'cotton';
let customParams = { ...clothPresets.custom };

app.get('/api/presets', (req, res) => {
  const presetList = Object.entries(clothPresets).map(([key, value]) => ({
    id: key,
    name: value.name,
    description: value.description
  }));
  res.json({ presets: presetList, currentPreset });
});

app.get('/api/presets/:id', (req, res) => {
  const presetId = req.params.id;
  if (clothPresets[presetId]) {
    res.json({ id: presetId, ...clothPresets[presetId] });
  } else {
    res.status(404).json({ error: '预设不存在' });
  }
});

app.post('/api/presets/:id/apply', (req, res) => {
  const presetId = req.params.id;
  if (clothPresets[presetId]) {
    currentPreset = presetId;
    if (presetId !== 'custom') {
      customParams = { ...clothPresets[presetId] };
    }
    res.json({
      success: true,
      message: `已应用 ${clothPresets[presetId].name} 预设`,
      params: presetId === 'custom' ? customParams : clothPresets[presetId]
    });
  } else {
    res.status(404).json({ error: '预设不存在' });
  }
});

app.get('/api/params', (req, res) => {
  const params = currentPreset === 'custom' ? customParams : clothPresets[currentPreset];
  res.json({ currentPreset, params });
});

app.put('/api/params', (req, res) => {
  const { stiffness, damping, mass, gravity, windStrength } = req.body;
  
  if (stiffness !== undefined) customParams.stiffness = Math.max(0, Math.min(1, stiffness));
  if (damping !== undefined) customParams.damping = Math.max(0, Math.min(1, damping));
  if (mass !== undefined) customParams.mass = Math.max(0.1, mass);
  if (gravity !== undefined) customParams.gravity = gravity;
  if (windStrength !== undefined) customParams.windStrength = Math.max(0, windStrength);
  
  currentPreset = 'custom';
  
  res.json({ success: true, params: customParams });
});

app.post('/api/wind/pulse', (req, res) => {
  const { strength = 2, duration = 500 } = req.body;
  res.json({
    success: true,
    message: '已触发风脉冲',
    pulse: { strength: Math.min(5, Math.max(0, strength)), duration: Math.min(2000, Math.max(100, duration)) }
  });
});

app.listen(PORT, () => {
  console.log(`\n========================================`);
  console.log(`  布料模拟服务器已启动`);
  console.log(`  访问地址: http://localhost:${PORT}`);
  console.log(`========================================\n`);
  console.log(`API 接口:`);
  console.log(`  GET  /api/presets          - 获取所有预设列表`);
  console.log(`  GET  /api/presets/:id      - 获取指定预设详情`);
  console.log(`  POST /api/presets/:id/apply - 应用指定预设`);
  console.log(`  GET  /api/params           - 获取当前参数`);
  console.log(`  PUT  /api/params           - 更新自定义参数`);
  console.log(`  POST /api/wind/pulse       - 触发风脉冲效果\n`);
});
