import { Router } from 'express';
import { db } from '../database';
import { StatsSummary, UrlStats, StatusCodeStats } from '../types';
import { apiKeyAuth } from '../middleware/auth';

const router = Router();

router.use(apiKeyAuth);

router.get('/', (req, res) => {
  const hours = Math.min(parseInt(req.query.hours as string) || 24, 168);
  const limit = Math.min(parseInt(req.query.limit as string) || 10, 50);

  const timeThreshold = new Date(Date.now() - hours * 60 * 60 * 1000).toISOString();

  const totalResult = db.prepare(`
    SELECT 
      COUNT(*) as total,
      SUM(CASE WHEN status = 'success' THEN 1 ELSE 0 END) as successCount,
      SUM(CASE WHEN status = 'error' THEN 1 ELSE 0 END) as errorCount,
      AVG(responseTime) as avgResponseTime
    FROM logs
    WHERE timestamp >= ?
  `).get(timeThreshold) as {
    total: number;
    successCount: number;
    errorCount: number;
    avgResponseTime: number;
  };

  const topUrls = db.prepare(`
    SELECT 
      requestUrl as url,
      COUNT(*) as count,
      SUM(CASE WHEN status = 'success' THEN 1 ELSE 0 END) as successCount,
      SUM(CASE WHEN status = 'error' THEN 1 ELSE 0 END) as errorCount,
      AVG(responseTime) as avgResponseTime
    FROM logs
    WHERE timestamp >= ?
    GROUP BY requestUrl
    ORDER BY count DESC
    LIMIT ?
  `).all(timeThreshold, limit) as UrlStats[];

  const statusCodes = db.prepare(`
    SELECT 
      responseStatusCode as statusCode,
      COUNT(*) as count
    FROM logs
    WHERE timestamp >= ? AND responseStatusCode IS NOT NULL
    GROUP BY responseStatusCode
    ORDER BY count DESC
  `).all(timeThreshold) as StatusCodeStats[];

  const summary: StatsSummary = {
    totalRequests: totalResult.total || 0,
    successCount: totalResult.successCount || 0,
    errorCount: totalResult.errorCount || 0,
    successRate: totalResult.total > 0 ? (totalResult.successCount || 0) / totalResult.total : 0,
    avgResponseTime: totalResult.avgResponseTime || 0,
    topUrls: topUrls.map(u => ({
      ...u,
      avgResponseTime: u.avgResponseTime || 0,
    })),
    statusCodes,
  };

  res.json(summary);
});

router.get('/urls', (req, res) => {
  const hours = Math.min(parseInt(req.query.hours as string) || 24, 168);
  const limit = Math.min(parseInt(req.query.limit as string) || 20, 100);
  const timeThreshold = new Date(Date.now() - hours * 60 * 60 * 1000).toISOString();

  const urls = db.prepare(`
    SELECT 
      requestUrl as url,
      COUNT(*) as count,
      SUM(CASE WHEN status = 'success' THEN 1 ELSE 0 END) as successCount,
      SUM(CASE WHEN status = 'error' THEN 1 ELSE 0 END) as errorCount,
      AVG(responseTime) as avgResponseTime
    FROM logs
    WHERE timestamp >= ?
    GROUP BY requestUrl
    ORDER BY count DESC
    LIMIT ?
  `).all(timeThreshold, limit) as UrlStats[];

  res.json(urls.map(u => ({ ...u, avgResponseTime: u.avgResponseTime || 0 })));
});

router.get('/status-codes', (req, res) => {
  const hours = Math.min(parseInt(req.query.hours as string) || 24, 168);
  const timeThreshold = new Date(Date.now() - hours * 60 * 60 * 1000).toISOString();

  const statusCodes = db.prepare(`
    SELECT 
      responseStatusCode as statusCode,
      COUNT(*) as count
    FROM logs
    WHERE timestamp >= ? AND responseStatusCode IS NOT NULL
    GROUP BY responseStatusCode
    ORDER BY count DESC
  `).all(timeThreshold) as StatusCodeStats[];

  res.json(statusCodes);
});

export { router as statsRouter };
