const express = require('express');
const cors = require('cors');
const fs = require('fs');
const path = require('path');

const app = express();
const PORT = process.env.PORT || 3000;

app.use(cors());
app.use(express.json({ limit: '50mb' }));
app.use(express.static(path.join(__dirname, 'public')));
app.use('/lib/filament', express.static(path.join(__dirname, 'node_modules', 'filament')));
app.use('/lib/gl-matrix', express.static(path.join(__dirname, 'node_modules', 'gl-matrix')));

const DATA_DIR = path.join(__dirname, 'data');
const PRESETS_FILE = path.join(DATA_DIR, 'presets.json');

if (!fs.existsSync(DATA_DIR)) {
    fs.mkdirSync(DATA_DIR, { recursive: true });
}

if (!fs.existsSync(PRESETS_FILE)) {
    fs.writeFileSync(PRESETS_FILE, JSON.stringify([], null, 2));
}

function readPresets() {
    try {
        const data = fs.readFileSync(PRESETS_FILE, 'utf-8');
        return JSON.parse(data);
    } catch (e) {
        return [];
    }
}

function writePresets(presets) {
    fs.writeFileSync(PRESETS_FILE, JSON.stringify(presets, null, 2));
}

app.get('/api/presets', (req, res) => {
    const presets = readPresets();
    res.json(presets);
});

app.get('/api/presets/:id', (req, res) => {
    const presets = readPresets();
    const preset = presets.find(p => p.id === req.params.id);
    if (!preset) {
        return res.status(404).json({ error: 'Preset not found' });
    }
    res.json(preset);
});

app.post('/api/presets', (req, res) => {
    const presets = readPresets();
    const preset = {
        id: Date.now().toString(),
        ...req.body,
        createdAt: new Date().toISOString()
    };
    presets.push(preset);
    writePresets(presets);
    res.status(201).json(preset);
});

app.put('/api/presets/:id', (req, res) => {
    const presets = readPresets();
    const idx = presets.findIndex(p => p.id === req.params.id);
    if (idx === -1) {
        return res.status(404).json({ error: 'Preset not found' });
    }
    presets[idx] = { ...presets[idx], ...req.body, updatedAt: new Date().toISOString() };
    writePresets(presets);
    res.json(presets[idx]);
});

app.delete('/api/presets/:id', (req, res) => {
    let presets = readPresets();
    const idx = presets.findIndex(p => p.id === req.params.id);
    if (idx === -1) {
        return res.status(404).json({ error: 'Preset not found' });
    }
    presets.splice(idx, 1);
    writePresets(presets);
    res.json({ success: true });
});

app.listen(PORT, () => {
    console.log(`PBR Material Previewer server running at http://localhost:${PORT}`);
});
