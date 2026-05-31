import { Router } from 'express';
import { rulesController } from '../controllers/rules.controller';
import { healthController } from '../controllers/health.controller';
import samplingRoutes from './sampling.routes';

const router = Router();

router.get('/health', healthController.getHealth);
router.get('/config', healthController.getConfig);
router.post('/config/publish', healthController.publishConfig);

router.get('/rules', rulesController.getAllRules);
router.get('/rules/:id', rulesController.getRuleById);
router.post('/rules', rulesController.createRule);
router.put('/rules/:id', rulesController.updateRule);
router.delete('/rules/:id', rulesController.deleteRule);
router.patch('/rules/:id/toggle', rulesController.toggleRule);
router.post('/rules/reorder', rulesController.reorderRules);
router.get('/rules/:id/test', rulesController.testRule);

router.post('/rules/import', rulesController.importRules);
router.get('/rules/export', rulesController.exportRules);

router.use('/sampling', samplingRoutes);

export default router;
