import { Request, Response } from 'express';
import { etcdService } from '../services/etcd.service';
import { ApiResponse } from '../types';

export class HealthController {
  public async getHealth(req: Request, res: Response): Promise<void> {
    const etcdConnected = await etcdService.testConnection();

    res.json({
      success: true,
      data: {
        status: 'healthy',
        timestamp: new Date().toISOString(),
        services: {
          etcd: etcdConnected ? 'healthy' : 'unhealthy',
        },
      },
    } as ApiResponse);
  }

  public async getConfig(req: Request, res: Response): Promise<void> {
    try {
      const config = await etcdService.getConfig();

      res.json({
        success: true,
        data: config,
      } as ApiResponse);
    } catch (err) {
      res.status(500).json({
        success: false,
        error: 'Failed to get config',
        message: err instanceof Error ? err.message : 'Unknown error',
      } as ApiResponse);
    }
  }

  public async publishConfig(req: Request, res: Response): Promise<void> {
    try {
      await etcdService.publishConfig(req.body);

      res.json({
        success: true,
        message: 'Configuration published successfully',
      } as ApiResponse);
    } catch (err) {
      res.status(500).json({
        success: false,
        error: 'Failed to publish config',
        message: err instanceof Error ? err.message : 'Unknown error',
      } as ApiResponse);
    }
  }
}

export const healthController = new HealthController();
