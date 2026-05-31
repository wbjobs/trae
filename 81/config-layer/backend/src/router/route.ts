import express from 'express';
import { listRoutes, getRoute, createRoute, updateRoute, deleteRoute } from '../controller/route';
import { requirePermission } from '../middleware/auth';

const router = express.Router();

router.get('/', requirePermission('config:read'), listRoutes);
router.get('/:id', requirePermission('config:read'), getRoute);
router.post('/', requirePermission('config:write'), createRoute);
router.put('/:id', requirePermission('config:write'), updateRoute);
router.delete('/:id', requirePermission('config:write'), deleteRoute);

export default router;
