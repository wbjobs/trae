import express from 'express';
import { createRule, getRulesByForm, getRule, updateRule, deleteRule } from '../controllers/ruleController';

const router = express.Router();

router.post('/forms/:formId/rules', createRule);
router.get('/forms/:formId/rules', getRulesByForm);
router.get('/rules/:id', getRule);
router.put('/rules/:id', updateRule);
router.delete('/rules/:id', deleteRule);

export default router;