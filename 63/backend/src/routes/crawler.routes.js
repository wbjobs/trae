const express = require('express');
const router = express.Router();
const crawlerController = require('../controllers/crawler.controller');

router.post('/search', crawlerController.searchLiterature);
router.post('/detail', crawlerController.getLiteratureDetail);
router.post('/batch-crawl', crawlerController.batchCrawl);
router.post('/cross-match', crawlerController.crossLibraryMatch);
router.get('/libraries', crawlerController.getSupportedLibraries);
router.get('/status/:taskId', crawlerController.getCrawlStatus);

module.exports = router;
