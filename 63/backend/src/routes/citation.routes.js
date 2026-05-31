const express = require('express');
const router = express.Router();
const citationController = require('../controllers/citation.controller');

router.post('/parse', citationController.parseCitation);
router.post('/format', citationController.formatCitation);
router.post('/batch-format', citationController.batchFormatCitations);
router.get('/formats', citationController.getSupportedFormats);
router.post('/rules', citationController.getFormatRules);

router.post('/analyze', citationController.analyzeCitation);
router.post('/auto-fix', citationController.autoFixCitation);
router.post('/batch-analyze', citationController.batchAnalyzeCitations);

module.exports = router;
