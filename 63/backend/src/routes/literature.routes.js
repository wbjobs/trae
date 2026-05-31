const express = require('express');
const router = express.Router();
const literatureController = require('../controllers/literature.controller');

router.post('/weight', literatureController.calculateWeight);
router.post('/batch-weight', literatureController.batchCalculateWeight);
router.post('/recommend', literatureController.getRecommendations);
router.get('/:id', literatureController.getLiteratureById);
router.post('/relation-match', literatureController.matchRelatedLiterature);

module.exports = router;
