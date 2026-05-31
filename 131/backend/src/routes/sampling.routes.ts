import { Router } from 'express';
import { samplingController } from '../controllers/sampling.controller';

const router = Router();

router.post('/record', samplingController.recordSample.bind(samplingController));
router.post('/record/batch', samplingController.recordBatchSamples.bind(samplingController));
router.get('/samples', samplingController.getRecentSamples.bind(samplingController));
router.get('/stats', samplingController.getSamplingStats.bind(samplingController));
router.get('/compare', samplingController.compareUpstreams.bind(samplingController));
router.get('/config', samplingController.getSamplingConfig.bind(samplingController));
router.put('/config', samplingController.updateSamplingConfig.bind(samplingController));

export default router;
