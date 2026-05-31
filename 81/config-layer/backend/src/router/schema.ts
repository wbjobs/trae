import express from 'express';
import { listSchemas, getSchema, createSchema, updateSchema, deleteSchema, testParse } from '../controller/schema';
import { requirePermission } from '../middleware/auth';

const router = express.Router();

router.get('/', requirePermission('config:read'), listSchemas);
router.get('/:id', requirePermission('config:read'), getSchema);
router.post('/', requirePermission('config:write'), createSchema);
router.put('/:id', requirePermission('config:write'), updateSchema);
router.delete('/:id', requirePermission('config:write'), deleteSchema);

export default router;
