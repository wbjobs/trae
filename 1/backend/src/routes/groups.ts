import { Router } from 'express';
import { db } from '../database';
import { RuleGroup } from '../types';
import { apiKeyAuth } from '../middleware/auth';

const router = Router();

function serializeGroup(group: any): RuleGroup {
  return {
    id: group.id,
    name: group.name,
    description: group.description,
    isActive: group.isActive === 1,
    createdAt: group.createdAt,
    updatedAt: group.updatedAt,
  };
}

router.use(apiKeyAuth);

router.get('/', (req, res) => {
  const groups = db
    .prepare('SELECT * FROM groups ORDER BY createdAt ASC')
    .all()
    .map(serializeGroup);
  res.json(groups);
});

router.get('/active', (req, res) => {
  const activeGroup = db.prepare('SELECT * FROM groups WHERE isActive = 1').get();
  if (!activeGroup) {
    return res.status(404).json({ error: 'No active group' });
  }
  res.json(serializeGroup(activeGroup));
});

router.get('/:id', (req, res) => {
  const group = db.prepare('SELECT * FROM groups WHERE id = ?').get(req.params.id);
  if (!group) {
    return res.status(404).json({ error: 'Group not found' });
  }
  res.json(serializeGroup(group));
});

router.post('/', (req, res) => {
  const { name, description } = req.body;

  const id = `group_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;

  db.prepare(
    `INSERT INTO groups (id, name, description, isActive)
     VALUES (?, ?, ?, 0)`
  ).run(id, name, description);

  const created = db.prepare('SELECT * FROM groups WHERE id = ?').get(id);
  res.status(201).json(serializeGroup(created));
});

router.put('/:id', (req, res) => {
  const existing = db.prepare('SELECT * FROM groups WHERE id = ?').get(req.params.id);
  if (!existing) {
    return res.status(404).json({ error: 'Group not found' });
  }

  const { name, description } = req.body;

  db.prepare(
    `UPDATE groups SET name = ?, description = ?, updatedAt = CURRENT_TIMESTAMP
     WHERE id = ?`
  ).run(name, description, req.params.id);

  const updated = db.prepare('SELECT * FROM groups WHERE id = ?').get(req.params.id);
  res.json(serializeGroup(updated));
});

router.patch('/:id/activate', (req, res) => {
  const existing = db.prepare('SELECT * FROM groups WHERE id = ?').get(req.params.id);
  if (!existing) {
    return res.status(404).json({ error: 'Group not found' });
  }

  const transaction = db.transaction(() => {
    db.prepare('UPDATE groups SET isActive = 0').run();
    db.prepare('UPDATE groups SET isActive = 1, updatedAt = CURRENT_TIMESTAMP WHERE id = ?').run(req.params.id);
  });
  transaction();

  const updated = db.prepare('SELECT * FROM groups WHERE id = ?').get(req.params.id);
  res.json(serializeGroup(updated));
});

router.delete('/:id', (req, res) => {
  const existing = db.prepare('SELECT * FROM groups WHERE id = ?').get(req.params.id);
  if (!existing) {
    return res.status(404).json({ error: 'Group not found' });
  }

  if (existing.isActive === 1) {
    return res.status(400).json({ error: 'Cannot delete active group' });
  }

  const ruleCount = db.prepare('SELECT COUNT(*) as count FROM rules WHERE groupId = ?').get(req.params.id) as { count: number };
  if (ruleCount.count > 0) {
    return res.status(400).json({ error: 'Cannot delete group with rules' });
  }

  db.prepare('DELETE FROM groups WHERE id = ?').run(req.params.id);
  res.status(204).send();
});

router.get('/:id/rules', (req, res) => {
  const group = db.prepare('SELECT * FROM groups WHERE id = ?').get(req.params.id);
  if (!group) {
    return res.status(404).json({ error: 'Group not found' });
  }

  const rules = db
    .prepare('SELECT * FROM rules WHERE groupId = ? ORDER BY priority DESC, createdAt ASC')
    .all(req.params.id)
    .map((rule: any) => ({
      id: rule.id,
      groupId: rule.groupId,
      name: rule.name,
      urlPattern: rule.urlPattern,
      methods: JSON.parse(rule.methods),
      headerConditions: rule.headerConditions ? JSON.parse(rule.headerConditions) : [],
      actionType: rule.actionType,
      forwardUrl: rule.forwardUrl,
      mockStatusCode: rule.mockStatusCode,
      mockHeaders: rule.mockHeaders ? JSON.parse(rule.mockHeaders) : {},
      mockBody: rule.mockBody,
      requestHeaders: rule.requestHeaders ? JSON.parse(rule.requestHeaders) : [],
      responseHeaders: rule.responseHeaders ? JSON.parse(rule.responseHeaders) : [],
      enabled: rule.enabled === 1,
      priority: rule.priority,
      createdAt: rule.createdAt,
      updatedAt: rule.updatedAt,
    }));

  res.json(rules);
});

export { router as groupsRouter };
