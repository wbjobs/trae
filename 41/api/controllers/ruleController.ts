import { Request, Response } from 'express';
import { v4 as uuidv4 } from 'uuid';
import { rulesDB } from '../database';
import { Rule, ConditionGroup, RuleAction } from '../types';

export const createRule = (req: Request, res: Response) => {
  const { formId } = req.params;
  const { name, conditions, actions }: { name: string; conditions: ConditionGroup; actions: RuleAction[] } = req.body;
  
  const rule: Rule = {
    id: uuidv4(),
    formId,
    name,
    conditions,
    actions,
    createdAt: new Date().toISOString(),
  };

  rulesDB.insert(rule, (err, newRule) => {
    if (err) {
      return res.status(500).json({ error: err.message });
    }
    res.status(201).json(newRule);
  });
};

export const getRulesByForm = (req: Request, res: Response) => {
  const { formId } = req.params;
  
  rulesDB.find({ formId }, (err, rules) => {
    if (err) {
      return res.status(500).json({ error: err.message });
    }
    res.json(rules);
  });
};

export const getRule = (req: Request, res: Response) => {
  const { id } = req.params;
  
  rulesDB.findOne({ id }, (err, rule) => {
    if (err) {
      return res.status(500).json({ error: err.message });
    }
    if (!rule) {
      return res.status(404).json({ error: 'Rule not found' });
    }
    res.json(rule);
  });
};

export const updateRule = (req: Request, res: Response) => {
  const { id } = req.params;
  const { name, conditions, actions }: { name?: string; conditions?: ConditionGroup; actions?: RuleAction[] } = req.body;

  rulesDB.update(
    { id },
    { $set: { name, conditions, actions } },
    { returnUpdatedDocs: true },
    (err, numUpdated, updatedRule) => {
      if (err) {
        return res.status(500).json({ error: err.message });
      }
      if (numUpdated === 0) {
        return res.status(404).json({ error: 'Rule not found' });
      }
      res.json(updatedRule);
    }
  );
};

export const deleteRule = (req: Request, res: Response) => {
  const { id } = req.params;

  rulesDB.remove({ id }, {}, (err, numRemoved) => {
    if (err) {
      return res.status(500).json({ error: err.message });
    }
    if (numRemoved === 0) {
      return res.status(404).json({ error: 'Rule not found' });
    }
    res.json({ message: 'Rule deleted successfully' });
  });
};