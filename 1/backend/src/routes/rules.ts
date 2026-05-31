import { Router } from 'express';
import { db } from '../database';
import { Rule } from '../types';
import { apiKeyAuth } from '../middleware/auth';

const router = Router();

function serializeRule(rule: any): Rule {
  return {
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
  };
}

function getActiveGroupId(): string {
  const activeGroup = db.prepare('SELECT id FROM groups WHERE isActive = 1').get() as { id: string } | undefined;
  return activeGroup?.id || 'group_default';
}

router.use(apiKeyAuth);

router.get('/', (req, res) => {
  const activeGroupId = getActiveGroupId();
  const rules = db
    .prepare('SELECT * FROM rules WHERE groupId = ? ORDER BY priority DESC, createdAt ASC')
    .all(activeGroupId)
    .map(serializeRule);
  res.json(rules);
});

router.get('/:id', (req, res) => {
  const rule = db.prepare('SELECT * FROM rules WHERE id = ?').get(req.params.id);
  if (!rule) {
    return res.status(404).json({ error: 'Rule not found' });
  }
  res.json(serializeRule(rule));
});

router.post('/', (req, res) => {
  const {
    groupId,
    name,
    urlPattern,
    methods,
    headerConditions,
    actionType,
    forwardUrl,
    mockStatusCode,
    mockHeaders,
    mockBody,
    requestHeaders,
    responseHeaders,
    enabled,
    priority,
  } = req.body;

  const id = `rule_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
  const targetGroupId = groupId || getActiveGroupId();

  db.prepare(
    `INSERT INTO rules (id, groupId, name, urlPattern, methods, headerConditions, actionType, forwardUrl, mockStatusCode, mockHeaders, mockBody, requestHeaders, responseHeaders, enabled, priority)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`
  ).run(
    id,
    targetGroupId,
    name,
    urlPattern,
    JSON.stringify(methods),
    headerConditions ? JSON.stringify(headerConditions) : null,
    actionType,
    actionType === 'forward' ? forwardUrl : null,
    actionType === 'mock' ? mockStatusCode : null,
    actionType === 'mock' && mockHeaders ? JSON.stringify(mockHeaders) : null,
    actionType === 'mock' ? mockBody : null,
    requestHeaders ? JSON.stringify(requestHeaders) : JSON.stringify([]),
    responseHeaders ? JSON.stringify(responseHeaders) : JSON.stringify([]),
    enabled ? 1 : 0,
    priority || 0
  );

  const created = db.prepare('SELECT * FROM rules WHERE id = ?').get(id);
  res.status(201).json(serializeRule(created));
});

router.put('/:id', (req, res) => {
  const existing = db.prepare('SELECT * FROM rules WHERE id = ?').get(req.params.id);
  if (!existing) {
    return res.status(404).json({ error: 'Rule not found' });
  }

  const {
    groupId,
    name,
    urlPattern,
    methods,
    headerConditions,
    actionType,
    forwardUrl,
    mockStatusCode,
    mockHeaders,
    mockBody,
    requestHeaders,
    responseHeaders,
    enabled,
    priority,
  } = req.body;

  db.prepare(
    `UPDATE rules SET groupId = ?, name = ?, urlPattern = ?, methods = ?, headerConditions = ?, actionType = ?, forwardUrl = ?, mockStatusCode = ?, mockHeaders = ?, mockBody = ?, requestHeaders = ?, responseHeaders = ?, enabled = ?, priority = ?, updatedAt = CURRENT_TIMESTAMP
     WHERE id = ?`
  ).run(
    groupId || existing.groupId,
    name,
    urlPattern,
    JSON.stringify(methods),
    headerConditions ? JSON.stringify(headerConditions) : null,
    actionType,
    actionType === 'forward' ? forwardUrl : null,
    actionType === 'mock' ? mockStatusCode : null,
    actionType === 'mock' && mockHeaders ? JSON.stringify(mockHeaders) : null,
    actionType === 'mock' ? mockBody : null,
    requestHeaders ? JSON.stringify(requestHeaders) : JSON.stringify([]),
    responseHeaders ? JSON.stringify(responseHeaders) : JSON.stringify([]),
    enabled ? 1 : 0,
    priority || 0,
    req.params.id
  );

  const updated = db.prepare('SELECT * FROM rules WHERE id = ?').get(req.params.id);
  res.json(serializeRule(updated));
});

router.patch('/:id/enable', (req, res) => {
  const existing = db.prepare('SELECT * FROM rules WHERE id = ?').get(req.params.id);
  if (!existing) {
    return res.status(404).json({ error: 'Rule not found' });
  }

  db.prepare('UPDATE rules SET enabled = 1, updatedAt = CURRENT_TIMESTAMP WHERE id = ?').run(req.params.id);
  const updated = db.prepare('SELECT * FROM rules WHERE id = ?').get(req.params.id);
  res.json(serializeRule(updated));
});

router.patch('/:id/disable', (req, res) => {
  const existing = db.prepare('SELECT * FROM rules WHERE id = ?').get(req.params.id);
  if (!existing) {
    return res.status(404).json({ error: 'Rule not found' });
  }

  db.prepare('UPDATE rules SET enabled = 0, updatedAt = CURRENT_TIMESTAMP WHERE id = ?').run(req.params.id);
  const updated = db.prepare('SELECT * FROM rules WHERE id = ?').get(req.params.id);
  res.json(serializeRule(updated));
});

router.delete('/:id', (req, res) => {
  const existing = db.prepare('SELECT * FROM rules WHERE id = ?').get(req.params.id);
  if (!existing) {
    return res.status(404).json({ error: 'Rule not found' });
  }

  db.prepare('DELETE FROM rules WHERE id = ?').run(req.params.id);
  res.status(204).send();
});

router.post('/reorder', (req, res) => {
  const { order } = req.body as { order: { id: string; priority: number }[] };

  const updateStmt = db.prepare('UPDATE rules SET priority = ?, updatedAt = CURRENT_TIMESTAMP WHERE id = ?');

  const transaction = db.transaction((items) => {
    for (const item of items) {
      updateStmt.run(item.priority, item.id);
    }
  });

  transaction(order);

  const activeGroupId = getActiveGroupId();
  const rules = db
    .prepare('SELECT * FROM rules WHERE groupId = ? ORDER BY priority DESC, createdAt ASC')
    .all(activeGroupId)
    .map(serializeRule);
  res.json(rules);
});

router.post('/import', (req, res) => {
  const { rules: importedRules, groupId } = req.body;

  if (!Array.isArray(importedRules)) {
    return res.status(400).json({ error: 'Invalid rules format' });
  }

  const targetGroupId = groupId || getActiveGroupId();
  const created: Rule[] = [];

  const transaction = db.transaction(() => {
    for (const rule of importedRules) {
      const id = `rule_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
      db.prepare(
        `INSERT INTO rules (id, groupId, name, urlPattern, methods, headerConditions, actionType, forwardUrl, mockStatusCode, mockHeaders, mockBody, requestHeaders, responseHeaders, enabled, priority)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`
      ).run(
        id,
        targetGroupId,
        rule.name,
        rule.urlPattern,
        JSON.stringify(rule.methods || ['GET']),
        rule.headerConditions ? JSON.stringify(rule.headerConditions) : null,
        rule.actionType || 'forward',
        rule.actionType === 'forward' ? rule.forwardUrl : null,
        rule.actionType === 'mock' ? rule.mockStatusCode : null,
        rule.actionType === 'mock' && rule.mockHeaders ? JSON.stringify(rule.mockHeaders) : null,
        rule.actionType === 'mock' ? rule.mockBody : null,
        rule.requestHeaders ? JSON.stringify(rule.requestHeaders) : JSON.stringify([]),
        rule.responseHeaders ? JSON.stringify(rule.responseHeaders) : JSON.stringify([]),
        rule.enabled ? 1 : 1,
        rule.priority || 0
      );
      const createdRule = db.prepare('SELECT * FROM rules WHERE id = ?').get(id);
      created.push(serializeRule(createdRule));
    }
  });

  transaction();

  res.status(201).json({ imported: created.length, rules: created });
});

router.get('/export/:groupId?', (req, res) => {
  const groupId = req.params.groupId || getActiveGroupId();
  const rules = db
    .prepare('SELECT * FROM rules WHERE groupId = ? ORDER BY priority DESC, createdAt ASC')
    .all(groupId)
    .map(serializeRule);

  const group = db.prepare('SELECT * FROM groups WHERE id = ?').get(groupId);

  res.json({
    version: 1,
    exportedAt: new Date().toISOString(),
    group: group ? { id: group.id, name: group.name, description: group.description } : null,
    rules,
  });
});

export { router as rulesRouter };
