import { Request, Response } from 'express';
import { v4 as uuidv4 } from 'uuid';
import { formsDB } from '../database';
import { Form, FormComponent } from '../types';

export const createForm = (req: Request, res: Response) => {
  const { name, config }: { name: string; config: FormComponent[] } = req.body;
  
  const form: Form = {
    id: uuidv4(),
    name,
    config,
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString(),
  };

  formsDB.insert(form, (err, newForm) => {
    if (err) {
      return res.status(500).json({ error: err.message });
    }
    res.status(201).json(newForm);
  });
};

export const getForms = (req: Request, res: Response) => {
  formsDB.find({}, (err, forms) => {
    if (err) {
      return res.status(500).json({ error: err.message });
    }
    res.json(forms);
  });
};

export const getForm = (req: Request, res: Response) => {
  const { id } = req.params;
  
  formsDB.findOne({ id }, (err, form) => {
    if (err) {
      return res.status(500).json({ error: err.message });
    }
    if (!form) {
      return res.status(404).json({ error: 'Form not found' });
    }
    res.json(form);
  });
};

export const updateForm = (req: Request, res: Response) => {
  const { id } = req.params;
  const { name, config }: { name?: string; config?: FormComponent[] } = req.body;

  formsDB.update(
    { id },
    { $set: { name, config, updatedAt: new Date().toISOString() } },
    { returnUpdatedDocs: true },
    (err, numUpdated, updatedForm) => {
      if (err) {
        return res.status(500).json({ error: err.message });
      }
      if (numUpdated === 0) {
        return res.status(404).json({ error: 'Form not found' });
      }
      res.json(updatedForm);
    }
  );
};

export const deleteForm = (req: Request, res: Response) => {
  const { id } = req.params;

  formsDB.remove({ id }, {}, (err, numRemoved) => {
    if (err) {
      return res.status(500).json({ error: err.message });
    }
    if (numRemoved === 0) {
      return res.status(404).json({ error: 'Form not found' });
    }
    res.json({ message: 'Form deleted successfully' });
  });
};