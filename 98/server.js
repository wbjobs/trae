require('dotenv').config();
const express = require('express');
const cors = require('cors');
const Minio = require('minio');
const multer = require('multer');
const path = require('path');
const fs = require('fs');

const app = express();
const PORT = process.env.PORT || 3000;

app.use(cors());
app.use(express.json({ limit: '50mb' }));
app.use(express.static('public'));

const minioClient = new Minio.Client({
  endPoint: process.env.MINIO_ENDPOINT || 'localhost',
  port: parseInt(process.env.MINIO_PORT || '9000'),
  useSSL: process.env.MINIO_USE_SSL === 'true',
  accessKey: process.env.MINIO_ACCESS_KEY || 'minioadmin',
  secretKey: process.env.MINIO_SECRET_KEY || 'minioadmin',
});

const BUCKET_NAME = process.env.MINIO_BUCKET || 'gesture-models';

async function initBucket() {
  try {
    const exists = await minioClient.bucketExists(BUCKET_NAME);
    if (!exists) {
      await minioClient.makeBucket(BUCKET_NAME, 'us-east-1');
      console.log(`Bucket '${BUCKET_NAME}' created successfully`);
    } else {
      console.log(`Bucket '${BUCKET_NAME}' already exists`);
    }
  } catch (err) {
    console.error('Error initializing MinIO bucket:', err);
  }
}
initBucket();

const storage = multer.memoryStorage();
const upload = multer({ storage: storage });

app.post('/api/model/save', upload.single('model'), async (req, res) => {
  try {
    const { modelName, metadata } = req.body;
    const modelData = req.file;

    if (!modelData) {
      return res.status(400).json({ error: 'No model file provided' });
    }

    const timestamp = Date.now();
    const objectName = `${modelName || 'gesture-model'}-${timestamp}.json`;

    const metaData = {
      'Content-Type': 'application/json',
      'Metadata': metadata ? JSON.stringify(metadata) : '',
    };

    await minioClient.putObject(
      BUCKET_NAME,
      objectName,
      modelData.buffer,
      modelData.size,
      metaData
    );

    res.json({
      success: true,
      message: 'Model saved successfully',
      objectName,
      url: `/api/model/${objectName}`,
    });
  } catch (err) {
    console.error('Error saving model:', err);
    res.status(500).json({ error: 'Failed to save model', details: err.message });
  }
});

app.get('/api/model/:objectName', async (req, res) => {
  try {
    const { objectName } = req.params;

    const stream = await minioClient.getObject(BUCKET_NAME, objectName);

    res.setHeader('Content-Type', 'application/json');
    stream.pipe(res);
  } catch (err) {
    console.error('Error retrieving model:', err);
    res.status(404).json({ error: 'Model not found' });
  }
});

app.get('/api/models', async (req, res) => {
  try {
    const objectsList = [];
    const stream = minioClient.listObjects(BUCKET_NAME, '', true);

    for await (const obj of stream) {
      objectsList.push({
        name: obj.name,
        size: obj.size,
        lastModified: obj.lastModified,
      });
    }

    res.json({ models: objectsList });
  } catch (err) {
    console.error('Error listing models:', err);
    res.status(500).json({ error: 'Failed to list models' });
  }
});

app.delete('/api/model/:objectName', async (req, res) => {
  try {
    const { objectName } = req.params;
    await minioClient.removeObject(BUCKET_NAME, objectName);
    res.json({ success: true, message: 'Model deleted successfully' });
  } catch (err) {
    console.error('Error deleting model:', err);
    res.status(500).json({ error: 'Failed to delete model' });
  }
});

const PRETRAINED_DIR = path.join(__dirname, 'pretrained');

app.get('/api/pretrained-models', (req, res) => {
  try {
    if (!fs.existsSync(PRETRAINED_DIR)) {
      return res.json({ models: [] });
    }

    const files = fs.readdirSync(PRETRAINED_DIR);
    const models = files
      .filter(f => f.endsWith('.json'))
      .map(filename => {
        const filePath = path.join(PRETRAINED_DIR, filename);
        const stats = fs.statSync(filePath);
        const content = JSON.parse(fs.readFileSync(filePath, 'utf8'));
        
        return {
          name: filename,
          size: stats.size,
          lastModified: stats.mtime,
          metadata: content.metadata || {},
          description: content.metadata?.description || 'Pre-trained model'
        };
      });

    res.json({ models });
  } catch (err) {
    console.error('Error listing pretrained models:', err);
    res.status(500).json({ error: 'Failed to list pretrained models' });
  }
});

app.get('/api/pretrained-model/:filename', (req, res) => {
  try {
    const { filename } = req.params;
    const filePath = path.join(PRETRAINED_DIR, filename);

    if (!fs.existsSync(filePath)) {
      return res.status(404).json({ error: 'Pretrained model not found' });
    }

    const content = fs.readFileSync(filePath, 'utf8');
    res.setHeader('Content-Type', 'application/json');
    res.send(content);
  } catch (err) {
    console.error('Error loading pretrained model:', err);
    res.status(500).json({ error: 'Failed to load pretrained model' });
  }
});

app.get('/api/health', (req, res) => {
  res.json({ status: 'ok', timestamp: new Date().toISOString() });
});

app.listen(PORT, () => {
  console.log(`Server running on http://localhost:${PORT}`);
  console.log(`MinIO endpoint: ${process.env.MINIO_ENDPOINT}:${process.env.MINIO_PORT}`);
});
