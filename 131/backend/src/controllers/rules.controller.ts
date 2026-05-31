import { Request, Response } from 'express';
import { ruleService } from '../services/rule.service';
import { ApiResponse, CreateRuleRequest, UpdateRuleRequest } from '../types';
import { logger } from '../utils/logger';

export class RulesController {
  public async getAllRules(req: Request, res: Response): Promise<void> {
    try {
      const rules = await ruleService.getAllRules();
      res.json({
        success: true,
        data: rules,
        count: rules.length,
      } as ApiResponse);
    } catch (err) {
      logger.error('Failed to get rules:', err);
      res.status(500).json({
        success: false,
        error: 'Failed to fetch rules',
        message: err instanceof Error ? err.message : 'Unknown error',
      } as ApiResponse);
    }
  }

  public async getRuleById(req: Request, res: Response): Promise<void> {
    try {
      const { id } = req.params;
      const rule = await ruleService.getRuleById(id);

      if (!rule) {
        res.status(404).json({
          success: false,
          error: 'Rule not found',
          message: `Rule with id ${id} not found`,
        } as ApiResponse);
        return;
      }

      res.json({
        success: true,
        data: rule,
      } as ApiResponse);
    } catch (err) {
      logger.error('Failed to get rule:', err);
      res.status(500).json({
        success: false,
        error: 'Failed to fetch rule',
        message: err instanceof Error ? err.message : 'Unknown error',
      } as ApiResponse);
    }
  }

  public async createRule(req: Request, res: Response): Promise<void> {
    try {
      const request = req.body as CreateRuleRequest;
      const rule = await ruleService.createRule(request);

      res.status(201).json({
        success: true,
        data: rule,
        message: 'Rule created successfully',
      } as ApiResponse);
    } catch (err) {
      logger.error('Failed to create rule:', err);
      res.status(400).json({
        success: false,
        error: 'Failed to create rule',
        message: err instanceof Error ? err.message : 'Unknown error',
      } as ApiResponse);
    }
  }

  public async updateRule(req: Request, res: Response): Promise<void> {
    try {
      const { id } = req.params;
      const request = req.body as UpdateRuleRequest;

      const rule = await ruleService.updateRule(id, request);

      res.json({
        success: true,
        data: rule,
        message: 'Rule updated successfully',
      } as ApiResponse);
    } catch (err) {
      logger.error('Failed to update rule:', err);
      res.status(400).json({
        success: false,
        error: 'Failed to update rule',
        message: err instanceof Error ? err.message : 'Unknown error',
      } as ApiResponse);
    }
  }

  public async deleteRule(req: Request, res: Response): Promise<void> {
    try {
      const { id } = req.params;
      await ruleService.deleteRule(id);

      res.json({
        success: true,
        message: 'Rule deleted successfully',
      } as ApiResponse);
    } catch (err) {
      logger.error('Failed to delete rule:', err);
      res.status(404).json({
        success: false,
        error: 'Failed to delete rule',
        message: err instanceof Error ? err.message : 'Unknown error',
      } as ApiResponse);
    }
  }

  public async toggleRule(req: Request, res: Response): Promise<void> {
    try {
      const { id } = req.params;
      const { enabled } = req.body;

      if (typeof enabled !== 'boolean') {
        res.status(400).json({
          success: false,
          error: 'Invalid request',
          message: 'enabled must be a boolean',
        } as ApiResponse);
        return;
      }

      const rule = await ruleService.toggleRule(id, enabled);

      res.json({
        success: true,
        data: rule,
        message: `Rule ${enabled ? 'enabled' : 'disabled'} successfully`,
      } as ApiResponse);
    } catch (err) {
      logger.error('Failed to toggle rule:', err);
      res.status(400).json({
        success: false,
        error: 'Failed to toggle rule',
        message: err instanceof Error ? err.message : 'Unknown error',
      } as ApiResponse);
    }
  }

  public async reorderRules(req: Request, res: Response): Promise<void> {
    try {
      const { ruleIds } = req.body;

      if (!Array.isArray(ruleIds)) {
        res.status(400).json({
          success: false,
          error: 'Invalid request',
          message: 'ruleIds must be an array',
        } as ApiResponse);
        return;
      }

      const rules = await ruleService.reorderRules(ruleIds);

      res.json({
        success: true,
        data: rules,
        message: 'Rules reordered successfully',
      } as ApiResponse);
    } catch (err) {
      logger.error('Failed to reorder rules:', err);
      res.status(400).json({
        success: false,
        error: 'Failed to reorder rules',
        message: err instanceof Error ? err.message : 'Unknown error',
      } as ApiResponse);
    }
  }

  public async testRule(req: Request, res: Response): Promise<void> {
    try {
      const { id } = req.params;
      const { userId } = req.query;

      if (!userId || typeof userId !== 'string') {
        res.status(400).json({
          success: false,
          error: 'Invalid request',
          message: 'userId query parameter is required',
        } as ApiResponse);
        return;
      }

      const result = await ruleService.testRule(id, userId);

      res.json({
        success: true,
        data: result,
      } as ApiResponse);
    } catch (err) {
      logger.error('Failed to test rule:', err);
      res.status(400).json({
        success: false,
        error: 'Failed to test rule',
        message: err instanceof Error ? err.message : 'Unknown error',
      } as ApiResponse);
    }
  }

  public async importRules(req: Request, res: Response): Promise<void> {
    try {
      const { rules } = req.body;

      if (!Array.isArray(rules)) {
        res.status(400).json({
          success: false,
          error: 'Invalid request',
          message: 'rules must be an array',
        } as ApiResponse);
        return;
      }

      const imported = await ruleService.importRules(rules);

      res.json({
        success: true,
        data: imported,
        message: `Successfully imported ${imported.length} rules`,
      } as ApiResponse);
    } catch (err) {
      logger.error('Failed to import rules:', err);
      res.status(400).json({
        success: false,
        error: 'Failed to import rules',
        message: err instanceof Error ? err.message : 'Unknown error',
      } as ApiResponse);
    }
  }

  public async exportRules(req: Request, res: Response): Promise<void> {
    try {
      const rules = await ruleService.exportRules();

      res.setHeader('Content-Type', 'application/json');
      res.setHeader('Content-Disposition', 'attachment; filename=gray-rules.json');

      res.json(rules);
    } catch (err) {
      logger.error('Failed to export rules:', err);
      res.status(500).json({
        success: false,
        error: 'Failed to export rules',
        message: err instanceof Error ? err.message : 'Unknown error',
      } as ApiResponse);
    }
  }
}

export const rulesController = new RulesController();
