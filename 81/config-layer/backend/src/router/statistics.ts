import express from 'express';
import { getStatistics } from '../controller/statistics';

const router = express.Router();

router.get('/', getStatistics);

export default router;
