import express from 'express';
import cors from 'cors';
import path from 'path';
import { fileURLToPath } from 'url';
import { parseVTKData, generateSampleVTK } from './vtkParser.js';
import { computeDrillPath, generateDrillLog } from './drillCalculator.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const app = express();
const PORT = 3001;

app.use(cors());
app.use(express.json({ limit: '50mb' }));
app.use(express.static(path.join(__dirname, '../data')));

app.get('/api/health', (req, res) => {
  res.json({ status: 'ok', message: '地质体模型服务运行正常' });
});

app.get('/api/models', (req, res) => {
  res.json({
    models: [
      { id: 'sample', name: '示例地质体模型', description: '包含多层地质结构的示例模型' }
    ]
  });
});

app.get('/api/model/:id', async (req, res) => {
  try {
    const modelId = req.params.id;
    let vtkData;
    
    if (modelId === 'sample') {
      vtkData = generateSampleVTK();
    } else {
      return res.status(404).json({ error: '模型不存在' });
    }
    
    const parsedData = parseVTKData(vtkData);
    res.json({
      id: modelId,
      ...parsedData
    });
  } catch (error) {
    console.error('加载模型失败:', error);
    res.status(500).json({ error: '加载模型失败: ' + error.message });
  }
});

app.post('/api/drill', (req, res) => {
  try {
    const { position, modelData } = req.body;
    
    if (!position || !modelData) {
      return res.status(400).json({ error: '缺少必要参数' });
    }
    
    const drillPath = computeDrillPath(position, modelData);
    const drillLog = generateDrillLog(drillPath, modelData);
    
    res.json({
      success: true,
      drillPath,
      drillLog
    });
  } catch (error) {
    console.error('计算钻孔失败:', error);
    res.status(500).json({ error: '计算钻孔失败: ' + error.message });
  }
});

app.post('/api/export-log', (req, res) => {
  try {
    const { drillData, format } = req.body;
    
    if (!drillData) {
      return res.status(400).json({ error: '缺少钻孔数据' });
    }
    
    let content, filename, mimeType;
    
    if (format === 'csv') {
      content = generateCSVLog(drillData);
      filename = `drill_log_${Date.now()}.csv`;
      mimeType = 'text/csv';
    } else {
      content = generateTextLog(drillData);
      filename = `drill_log_${Date.now()}.txt`;
      mimeType = 'text/plain';
    }
    
    res.setHeader('Content-Type', mimeType);
    res.setHeader('Content-Disposition', `attachment; filename="${filename}"`);
    res.send(content);
  } catch (error) {
    console.error('导出日志失败:', error);
    res.status(500).json({ error: '导出日志失败: ' + error.message });
  }
});

function generateTextLog(drillData) {
  let log = `========================================\n`;
  log += `钻孔日志\n`;
  log += `生成时间: ${new Date().toLocaleString()}\n`;
  log += `钻孔位置: (${drillData.position.x.toFixed(2)}, ${drillData.position.y.toFixed(2)})\n`;
  log += `总深度: ${drillData.totalDepth.toFixed(2)}m\n`;
  log += `========================================\n\n`;
  log += `岩层记录:\n`;
  log += `----------------------------------------\n`;
  
  drillData.layers.forEach((layer, index) => {
    log += `层位 ${index + 1}:\n`;
    log += `  岩石类型: ${layer.rockType}\n`;
    log += `  深度范围: ${layer.startDepth.toFixed(2)}m - ${layer.endDepth.toFixed(2)}m\n`;
    log += `  厚度: ${layer.thickness.toFixed(2)}m\n`;
    log += `  岩性描述: ${layer.description}\n`;
    log += `----------------------------------------\n`;
  });
  
  return log;
}

function generateCSVLog(drillData) {
  let csv = `层号,岩石类型,起始深度(m),终止深度(m),厚度(m),岩性描述\n`;
  
  drillData.layers.forEach((layer, index) => {
    csv += `${index + 1},${layer.rockType},${layer.startDepth.toFixed(2)},${layer.endDepth.toFixed(2)},${layer.thickness.toFixed(2)},"${layer.description}"\n`;
  });
  
  return csv;
}

app.listen(PORT, () => {
  console.log(`地质体模型服务运行在 http://localhost:${PORT}`);
});
