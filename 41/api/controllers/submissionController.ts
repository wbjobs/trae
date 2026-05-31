import { Request, Response } from 'express';
import { v4 as uuidv4 } from 'uuid';
import { submissionsDB, rulesDB } from '../database';
import { Submission, Rule } from '../types';
import { evaluateRules } from '../services/ruleEngine';

export const submitForm = async (req: Request, res: Response) => {
  const { formId } = req.params;
  const { data, debugMode = false }: { data: Record<string, unknown>; debugMode?: boolean } = req.body;

  try {
    const rules = await new Promise<Rule[]>((resolve, reject) => {
      rulesDB.find({ formId }, (err, rules) => {
        if (err) reject(err);
        else resolve(rules as Rule[]);
      });
    });

    const effects = await evaluateRules(rules, data, formId, debugMode);

    const submission: Submission = {
      id: uuidv4(),
      formId,
      data,
      submittedAt: new Date().toISOString(),
    };

    const newSubmission = await new Promise((resolve, reject) => {
      submissionsDB.insert(submission, (insertErr, result) => {
        if (insertErr) reject(insertErr);
        else resolve(result);
      });
    });

    res.status(201).json({ submission: newSubmission, effects });
  } catch (error) {
    res.status(500).json({ error: error instanceof Error ? error.message : String(error) });
  }
};

export const getSubmissions = (req: Request, res: Response) => {
  const { formId } = req.params;
  
  submissionsDB.find({ formId }, (err, submissions) => {
    if (err) {
      return res.status(500).json({ error: err.message });
    }
    res.json(submissions);
  });
};

export const getSubmission = (req: Request, res: Response) => {
  const { id } = req.params;
  
  submissionsDB.findOne({ id }, (err, submission) => {
    if (err) {
      return res.status(500).json({ error: err.message });
    }
    if (!submission) {
      return res.status(404).json({ error: 'Submission not found' });
    }
    res.json(submission);
  });
};

export const deleteSubmission = (req: Request, res: Response) => {
  const { id } = req.params;

  submissionsDB.remove({ id }, {}, (err, numRemoved) => {
    if (err) {
      return res.status(500).json({ error: err.message });
    }
    if (numRemoved === 0) {
      return res.status(404).json({ error: 'Submission not found' });
    }
    res.json({ message: 'Submission deleted successfully' });
  });
};