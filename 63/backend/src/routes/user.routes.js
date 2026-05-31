const express = require('express');
const router = express.Router();
const userController = require('../controllers/user.controller');

router.get('/:userId/profile', userController.getUserProfile);
router.put('/:userId/profile', userController.updateUserProfile);
router.get('/:userId/collection', userController.getUserCollection);
router.post('/:userId/collection', userController.addToCollection);
router.delete('/:userId/collection/:id', userController.removeFromCollection);
router.post('/:userId/sync', userController.syncAcademicProfile);
router.get('/:userId/statistics', userController.getUserStatistics);

module.exports = router;
