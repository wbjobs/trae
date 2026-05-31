import express from 'express';
import { submitForm, getSubmissions, getSubmission, deleteSubmission } from '../controllers/submissionController';

const router = express.Router();

router.post('/forms/:formId/submit', submitForm);
router.get('/forms/:formId/submissions', getSubmissions);
router.get('/submissions/:id', getSubmission);
router.delete('/submissions/:id', deleteSubmission);

export default router;