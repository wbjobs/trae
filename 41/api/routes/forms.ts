import express from 'express';
import { createForm, getForms, getForm, updateForm, deleteForm } from '../controllers/formController';

const router = express.Router();

router.post('/', createForm);
router.get('/', getForms);
router.get('/:id', getForm);
router.put('/:id', updateForm);
router.delete('/:id', deleteForm);

export default router;