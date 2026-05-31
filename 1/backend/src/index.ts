import express from 'express';
import cors from 'cors';
import { rulesRouter } from './routes/rules';
import { logsRouter } from './routes/logs';
import { groupsRouter } from './routes/groups';
import { statsRouter } from './routes/stats';
import './database';

const app = express();
const PORT = process.env.PORT || 3000;

app.use(cors());
app.use(express.json());

app.use('/api/groups', groupsRouter);
app.use('/api/rules', rulesRouter);
app.use('/api/logs', logsRouter);
app.use('/api/stats', statsRouter);

app.get('/api/health', (req, res) => {
  res.json({ status: 'ok', timestamp: new Date().toISOString() });
});

app.listen(PORT, () => {
  console.log(`[Server] Running on http://localhost:${PORT}`);
  console.log(`[Server] API Endpoints:`);
  console.log(`  GET    /api/health`);
  console.log(`  Groups:`);
  console.log(`    GET    /api/groups`);
  console.log(`    POST   /api/groups`);
  console.log(`    GET    /api/groups/active`);
  console.log(`    GET    /api/groups/:id`);
  console.log(`    PUT    /api/groups/:id`);
  console.log(`    PATCH  /api/groups/:id/activate`);
  console.log(`    DELETE /api/groups/:id`);
  console.log(`    GET    /api/groups/:id/rules`);
  console.log(`  Rules:`);
  console.log(`    GET    /api/rules`);
  console.log(`    POST   /api/rules`);
  console.log(`    PUT    /api/rules/:id`);
  console.log(`    PATCH  /api/rules/:id/enable`);
  console.log(`    PATCH  /api/rules/:id/disable`);
  console.log(`    DELETE /api/rules/:id`);
  console.log(`    POST   /api/rules/reorder`);
  console.log(`    POST   /api/rules/import`);
  console.log(`    GET    /api/rules/export`);
  console.log(`  Logs:`);
  console.log(`    GET    /api/logs`);
  console.log(`    POST   /api/logs`);
  console.log(`    DELETE /api/logs`);
  console.log(`  Stats:`);
  console.log(`    GET    /api/stats`);
  console.log(`    GET    /api/stats/urls`);
  console.log(`    GET    /api/stats/status-codes`);
});
