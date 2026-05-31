import express from 'express';
import {
  createVersion, getVersions, getVersion, updateVersion, deleteVersion,
  createRelease, startRelease, pauseRelease, resumeRelease, rollbackRelease,
  getReleases, getRelease, getVersionStats
} from '../controller/version';
import { requirePermission } from '../middleware/auth';

const router = express.Router();

router.get('/versions', requirePermission('version:read'), getVersions);
router.post('/versions', requirePermission('version:write'), createVersion);
router.get('/versions/:id', requirePermission('version:read'), getVersion);
router.put('/versions/:id', requirePermission('version:write'), updateVersion);
router.delete('/versions/:id', requirePermission('version:write'), deleteVersion);

router.get('/releases', requirePermission('version:read'), getReleases);
router.post('/releases', requirePermission('version:write'), createRelease);
router.get('/releases/:id', requirePermission('version:read'), getRelease);
router.post('/releases/:id/start', requirePermission('version:write'), startRelease);
router.post('/releases/:id/pause', requirePermission('version:write'), pauseRelease);
router.post('/releases/:id/resume', requirePermission('version:write'), resumeRelease);
router.post('/releases/:id/rollback', requirePermission('version:write'), rollbackRelease);

router.get('/statistics', requirePermission('version:read'), getVersionStats);

export default router;
