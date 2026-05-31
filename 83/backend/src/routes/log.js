const express = require('express');
const { getOperationLogs, traceDocumentAccess, generateTraceReport, checkSuspiciousActivity, TRACE_LEVELS } = require('../utils/trace');
const { authenticateToken, requireRole } = require('../middleware/auth');

const router = express.Router();

const OPERATION_TYPE_NAMES = {
  login: '登录',
  logout: '登出',
  upload: '上传',
  view: '浏览',
  download: '下载',
  update: '修改',
  delete: '删除',
  grant: '授权',
  revoke: '撤销',
  print: '打印',
  share: '分享',
  borrow: '借阅',
  return: '归还',
  integrity_check: '完整性检查',
};

router.get('/list', authenticateToken, async (req, res, next) => {
  try {
    const {
      page = 1,
      pageSize = 20,
      operationType,
      startDate,
      endDate,
      documentId,
      isOffline,
      sortBy = 'created_at',
      sortOrder = 'DESC',
    } = req.query;

    const filters = {};
    if (operationType) filters.operationType = operationType;
    if (documentId) filters.documentId = documentId;
    if (startDate) filters.startDate = startDate;
    if (endDate) filters.endDate = endDate;
    if (isOffline !== undefined) filters.isOffline = isOffline === 'true';

    if (req.user.role !== 'admin') {
      filters.userId = req.user.id;
    }

    const result = await getOperationLogs(filters, {
      page: parseInt(page),
      pageSize: parseInt(pageSize),
      sortBy,
      sortOrder,
    });

    res.json(result);
  } catch (err) {
    next(err);
  }
});

router.get('/document/:documentId/trace', authenticateToken, async (req, res, next) => {
  try {
    const { documentId } = req.params;
    const { level = TRACE_LEVELS.MEDIUM } = req.query;

    const traceData = await traceDocumentAccess(parseInt(documentId), level);

    res.json(traceData);
  } catch (err) {
    next(err);
  }
});

router.post('/report', authenticateToken, requireRole('admin'), async (req, res, next) => {
  try {
    const { startDate, endDate, userId, documentId, operationType } = req.body;

    const report = await generateTraceReport({
      startDate,
      endDate,
      userId,
      documentId,
      operationType,
    });

    res.json(report);
  } catch (err) {
    next(err);
  }
});

router.get('/statistics', authenticateToken, async (req, res, next) => {
  try {
    const { days = 7 } = req.query;
    const since = new Date(Date.now() - days * 24 * 60 * 60 * 1000).toISOString();

    const whereSql = req.user.role === 'admin' 
      ? 'WHERE created_at >= ?'
      : 'WHERE created_at >= ? AND user_id = ?';
    const params = req.user.role === 'admin' ? [since] : [since, req.user.id];

    const sqlite3 = require('sqlite3').verbose();
    const { getDb } = require('../config/database');
    const db = getDb();

    const dailyStats = await new Promise((resolve, reject) => {
      db.all(`
        SELECT 
          DATE(created_at) as date,
          operation_type,
          COUNT(*) as count
        FROM operation_logs
        ${whereSql}
        GROUP BY DATE(created_at), operation_type
        ORDER BY date DESC
      `, params, (err, rows) => {
        if (err) reject(err);
        else resolve(rows);
      });
    });

    const typeStats = await new Promise((resolve, reject) => {
      db.all(`
        SELECT 
          operation_type,
          COUNT(*) as count
        FROM operation_logs
        ${whereSql}
        GROUP BY operation_type
        ORDER BY count DESC
      `, params, (err, rows) => {
        if (err) reject(err);
        else resolve(rows);
      });
    });

    const totalCount = await new Promise((resolve, reject) => {
      db.get(`
        SELECT COUNT(*) as total
        FROM operation_logs
        ${whereSql}
      `, params, (err, row) => {
        if (err) reject(err);
        else resolve(row.total);
      });
    });

    res.json({
      totalOperations: totalCount,
      timeRange: { days: parseInt(days), since },
      dailyStats,
      typeStats,
    });
  } catch (err) {
    next(err);
  }
});

router.get('/suspicious/:userId', authenticateToken, requireRole('admin'), async (req, res, next) => {
  try {
    const { userId } = req.params;
    const { timeWindowHours = 24 } = req.query;

    const result = await checkSuspiciousActivity(parseInt(userId), parseInt(timeWindowHours));

    res.json(result);
  } catch (err) {
    next(err);
  }
});

router.get('/export', authenticateToken, requireRole('admin'), async (req, res, next) => {
  try {
    const { startDate, endDate, format = 'json', includeStatistics = 'true' } = req.query;

    const report = await generateTraceReport({ startDate, endDate });
    
    const statistics = includeStatistics === 'true' ? await getExportStatistics(startDate, endDate) : null;

    if (format === 'csv') {
      const csvContent = generateCSVExport(report, statistics);
      res.setHeader('Content-Type', 'text/csv; charset=utf-8');
      res.setHeader('Content-Disposition', `attachment; filename="操作日志_${new Date().toISOString().slice(0, 10)}.csv"`);
      res.send('\uFEFF' + csvContent);
    } else if (format === 'html') {
      const htmlContent = generateHTMLExport(report, statistics);
      res.setHeader('Content-Type', 'text/html; charset=utf-8');
      res.setHeader('Content-Disposition', `attachment; filename="操作日志_${new Date().toISOString().slice(0, 10)}.html"`);
      res.send(htmlContent);
    } else {
      const exportData = {
        exportTime: new Date().toISOString(),
        timeRange: { startDate, endDate },
        summary: statistics?.summary || null,
        logs: report.logs || [],
        statistics: statistics?.charts || null,
      };
      
      res.setHeader('Content-Type', 'application/json');
      res.setHeader('Content-Disposition', `attachment; filename="操作日志_${new Date().toISOString().slice(0, 10)}.json"`);
      res.json(exportData);
    }
  } catch (err) {
    next(err);
  }
});

const getExportStatistics = async (startDate, endDate) => {
  const sqlite3 = require('sqlite3').verbose();
  const { getDb } = require('../config/database');
  const db = getDb();

  const whereClauses = [];
  const params = [];
  
  if (startDate) {
    whereClauses.push('created_at >= ?');
    params.push(startDate);
  }
  if (endDate) {
    whereClauses.push('created_at <= ?');
    params.push(endDate);
  }
  
  const whereSql = whereClauses.length > 0 ? `WHERE ${whereClauses.join(' AND ')}` : '';

  const totalCount = await new Promise((resolve, reject) => {
    db.get(`SELECT COUNT(*) as total FROM operation_logs ${whereSql}`, params, (err, row) => {
      if (err) reject(err);
      else resolve(row.total);
    });
  });

  const typeStats = await new Promise((resolve, reject) => {
    db.all(`
      SELECT operation_type, COUNT(*) as count 
      FROM operation_logs ${whereSql}
      GROUP BY operation_type ORDER BY count DESC
    `, params, (err, rows) => {
      if (err) reject(err);
      else resolve(rows);
    });
  });

  const userStats = await new Promise((resolve, reject) => {
    db.all(`
      SELECT user_name, COUNT(*) as count 
      FROM operation_logs ${whereSql}
      GROUP BY user_name ORDER BY count DESC LIMIT 10
    `, params, (err, rows) => {
      if (err) reject(err);
      else resolve(rows);
    });
  });

  const dailyStats = await new Promise((resolve, reject) => {
    db.all(`
      SELECT DATE(created_at) as date, COUNT(*) as count 
      FROM operation_logs ${whereSql}
      GROUP BY DATE(created_at) ORDER BY date DESC LIMIT 30
    `, params, (err, rows) => {
      if (err) reject(err);
      else resolve(rows);
    });
  });

  const successRate = await new Promise((resolve, reject) => {
    db.get(`
      SELECT 
        COUNT(*) as total,
        SUM(CASE WHEN status = 'success' THEN 1 ELSE 0 END) as success
      FROM operation_logs ${whereSql}
    `, params, (err, row) => {
      if (err) reject(err);
      else resolve(row.total > 0 ? ((row.success / row.total) * 100).toFixed(2) : 0);
    });
  });

  return {
    summary: {
      totalOperations: totalCount,
      successRate: successRate,
      operationTypes: typeStats.length,
      activeUsers: userStats.length,
    },
    charts: {
      operationTypeDistribution: typeStats.map(s => ({
        name: OPERATION_TYPE_NAMES[s.operation_type] || s.operation_type,
        value: s.count,
      })),
      userActivityRanking: userStats.map(s => ({
        user: s.user_name,
        count: s.count,
      })),
      dailyTrend: dailyStats.map(s => ({
        date: s.date,
        count: s.count,
      })),
    },
  };
};

const generateCSVExport = (report, statistics) => {
  let csvContent = '';
  
  if (statistics?.summary) {
    csvContent += '统计概览\n';
    csvContent += `总操作次数,${statistics.summary.totalOperations}\n`;
    csvContent += `成功率,${statistics.summary.successRate}%\n`;
    csvContent += `操作类型数,${statistics.summary.operationTypes}\n`;
    csvContent += `活跃用户数,${statistics.summary.activeUsers}\n`;
    csvContent += '\n';
  }
  
  if (statistics?.charts?.operationTypeDistribution) {
    csvContent += '操作类型分布\n';
    csvContent += '操作类型,次数\n';
    statistics.charts.operationTypeDistribution.forEach(item => {
      csvContent += `"${item.name}",${item.value}\n`;
    });
    csvContent += '\n';
  }
  
  const headers = ['时间', '用户', '操作类型', '文档', '密级', 'IP地址', '状态', '详情'];
  const rows = report.logs.map(log => [
    log.created_at || '',
    log.user_name || log.username || '',
    OPERATION_TYPE_NAMES[log.operation_type] || log.operation_type,
    log.document_title || '',
    log.secret_level || '',
    log.ip_address || '',
    log.status === 'success' ? '成功' : '失败',
    JSON.stringify(log.details || {}).replace(/"/g, '""'),
  ]);
  
  csvContent += '操作日志明细\n';
  csvContent += headers.join(',') + '\n';
  rows.forEach(row => {
    csvContent += row.map(cell => `"${cell}"`).join(',') + '\n';
  });
  
  return csvContent;
};

const generateHTMLExport = (report, statistics) => {
  const operationTypeChart = statistics?.charts?.operationTypeDistribution || [];
  const dailyTrendChart = statistics?.charts?.dailyTrend || [];
  const userRankingChart = statistics?.charts?.userActivityRanking || [];
  
  const maxTypeValue = Math.max(...operationTypeChart.map(d => d.value), 1);
  const maxDailyValue = Math.max(...dailyTrendChart.map(d => d.count), 1);
  const maxUserValue = Math.max(...userRankingChart.map(d => d.count), 1);
  
  const colors = ['#5470c6', '#91cc75', '#fac858', '#ee6666', '#73c0de', '#3ba272', '#fc8452', '#9a60b4', '#ea7ccc', '#48b4bd'];
  
  return `<!DOCTYPE html>
<html lang="zh-CN">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>文档溯源轨迹报告 - ${new Date().toLocaleDateString('zh-CN')}</title>
  <style>
    * { margin: 0; padding: 0; box-sizing: border-box; }
    body { font-family: 'Microsoft YaHei', Arial, sans-serif; background: #f5f7fa; padding: 20px; }
    .container { max-width: 1200px; margin: 0 auto; background: white; padding: 30px; border-radius: 8px; box-shadow: 0 2px 12px rgba(0,0,0,0.1); }
    .header { text-align: center; margin-bottom: 30px; padding-bottom: 20px; border-bottom: 2px solid #409eff; }
    .header h1 { color: #303133; margin-bottom: 10px; }
    .header .sub-info { color: #909399; font-size: 14px; }
    .summary-cards { display: grid; grid-template-columns: repeat(4, 1fr); gap: 20px; margin-bottom: 30px; }
    .summary-card { background: linear-gradient(135deg, #667eea 0%, #764ba2 100%); color: white; padding: 20px; border-radius: 8px; text-align: center; }
    .summary-card:nth-child(2) { background: linear-gradient(135deg, #11998e 0%, #38ef7d 100%); }
    .summary-card:nth-child(3) { background: linear-gradient(135deg, #f093fb 0%, #f5576c 100%); }
    .summary-card:nth-child(4) { background: linear-gradient(135deg, #fa709a 0%, #fee140 100%); }
    .summary-card .value { font-size: 32px; font-weight: bold; margin-bottom: 5px; }
    .summary-card .label { font-size: 14px; opacity: 0.9; }
    .charts-section { margin-bottom: 30px; }
    .chart-row { display: grid; grid-template-columns: 1fr 1fr; gap: 20px; margin-bottom: 20px; }
    .chart-card { background: white; border: 1px solid #ebeef5; border-radius: 8px; padding: 20px; }
    .chart-card h3 { color: #303133; margin-bottom: 15px; font-size: 16px; }
    .bar-chart { display: flex; flex-direction: column; gap: 10px; }
    .bar-item { display: flex; align-items: center; gap: 10px; }
    .bar-label { width: 100px; font-size: 12px; color: #606266; text-align: right; }
    .bar-container { flex: 1; height: 24px; background: #f0f2f5; border-radius: 4px; overflow: hidden; }
    .bar-fill { height: 100%; border-radius: 4px; transition: width 0.3s; }
    .bar-value { width: 60px; font-size: 12px; color: #909399; }
    .pie-chart { display: flex; align-items: center; justify-content: center; gap: 30px; }
    .pie-legend { display: flex; flex-direction: column; gap: 8px; }
    .legend-item { display: flex; align-items: center; gap: 8px; font-size: 12px; }
    .legend-color { width: 12px; height: 12px; border-radius: 2px; }
    .logs-section { margin-top: 30px; }
    .logs-section h3 { color: #303133; margin-bottom: 15px; }
    .logs-table { width: 100%; border-collapse: collapse; font-size: 12px; }
    .logs-table th { background: #f5f7fa; color: #303133; padding: 12px; text-align: left; border-bottom: 2px solid #ebeef5; }
    .logs-table td { padding: 10px; border-bottom: 1px solid #ebeef5; color: #606266; }
    .logs-table tr:hover { background: #f5f7fa; }
    .tag { display: inline-block; padding: 2px 8px; border-radius: 4px; font-size: 11px; }
    .tag-success { background: #f0f9eb; color: #67c23a; }
    .tag-error { background: #fef0f0; color: #f56c6c; }
    .secret-badge { padding: 2px 6px; border-radius: 3px; font-size: 11px; }
    .secret-public { background: #f4f4f5; color: #909399; }
    .secret-internal { background: #ecf5ff; color: #409eff; }
    .secret-secret { background: #fdf6ec; color: #e6a23c; }
    .secret-top_secret { background: #fef0f0; color: #f56c6c; }
    .footer { margin-top: 30px; text-align: center; color: #909399; font-size: 12px; padding-top: 20px; border-top: 1px solid #ebeef5; }
    @media print {
      body { background: white; padding: 0; }
      .container { box-shadow: none; }
    }
  </style>
</head>
<body>
  <div class="container">
    <div class="header">
      <h1>📊 文档溯源轨迹分析报告</h1>
      <div class="sub-info">
        生成时间：${new Date().toLocaleString('zh-CN')} | 
        数据范围：${report.logs?.length || 0} 条操作记录
      </div>
    </div>
    
    ${statistics?.summary ? `
    <div class="summary-cards">
      <div class="summary-card">
        <div class="value">${statistics.summary.totalOperations}</div>
        <div class="label">总操作次数</div>
      </div>
      <div class="summary-card">
        <div class="value">${statistics.summary.successRate}%</div>
        <div class="label">操作成功率</div>
      </div>
      <div class="summary-card">
        <div class="value">${statistics.summary.operationTypes}</div>
        <div class="label">操作类型数</div>
      </div>
      <div class="summary-card">
        <div class="value">${statistics.summary.activeUsers}</div>
        <div class="label">活跃用户数</div>
      </div>
    </div>
    ` : ''}
    
    <div class="charts-section">
      <div class="chart-row">
        <div class="chart-card">
          <h3>📈 操作类型分布</h3>
          <div class="bar-chart">
            ${operationTypeChart.slice(0, 8).map((item, index) => `
              <div class="bar-item">
                <div class="bar-label">${item.name}</div>
                <div class="bar-container">
                  <div class="bar-fill" style="width: ${(item.value / maxTypeValue) * 100}%; background: ${colors[index % colors.length]}"></div>
                </div>
                <div class="bar-value">${item.value}次</div>
              </div>
            `).join('')}
          </div>
        </div>
        
        <div class="chart-card">
          <h3>👥 用户活跃度排行</h3>
          <div class="bar-chart">
            ${userRankingChart.slice(0, 8).map((item, index) => `
              <div class="bar-item">
                <div class="bar-label">${item.user}</div>
                <div class="bar-container">
                  <div class="bar-fill" style="width: ${(item.count / maxUserValue) * 100}%; background: ${colors[index % colors.length]}"></div>
                </div>
                <div class="bar-value">${item.count}次</div>
              </div>
            `).join('')}
          </div>
        </div>
      </div>
      
      <div class="chart-card">
        <h3>📅 每日操作趋势</h3>
        <div class="bar-chart">
          ${dailyTrendChart.slice(0, 15).map((item, index) => `
            <div class="bar-item">
              <div class="bar-label">${item.date}</div>
              <div class="bar-container">
                <div class="bar-fill" style="width: ${(item.count / maxDailyValue) * 100}%; background: #409eff"></div>
              </div>
              <div class="bar-value">${item.count}次</div>
            </div>
          `).join('')}
        </div>
      </div>
    </div>
    
    <div class="logs-section">
      <h3>📋 操作日志明细</h3>
      <table class="logs-table">
        <thead>
          <tr>
            <th>时间</th>
            <th>用户</th>
            <th>操作类型</th>
            <th>文档</th>
            <th>密级</th>
            <th>IP地址</th>
            <th>状态</th>
          </tr>
        </thead>
        <tbody>
          ${(report.logs || []).slice(0, 100).map(log => `
            <tr>
              <td>${log.created_at || '-'}</td>
              <td>${log.user_name || log.username || '-'}</td>
              <td>${OPERATION_TYPE_NAMES[log.operation_type] || log.operation_type}</td>
              <td>${log.document_title || '-'}</td>
              <td>${log.secret_level ? `<span class="secret-badge secret-${log.secret_level}">${log.secret_level}</span>` : '-'}</td>
              <td>${log.ip_address || '-'}</td>
              <td><span class="tag ${log.status === 'success' ? 'tag-success' : 'tag-error'}">${log.status === 'success' ? '成功' : '失败'}</span></td>
            </tr>
          `).join('')}
        </tbody>
      </table>
      ${(report.logs || []).length > 100 ? `<p style="text-align: center; color: #909399; margin-top: 10px;">仅显示前100条记录，完整数据请查看JSON或CSV导出</p>` : ''}
    </div>
    
    <div class="footer">
      <p>涉密文档溯源系统 | 报告生成时间：${new Date().toLocaleString('zh-CN')}</p>
    </div>
  </div>
</body>
</html>`;
};

module.exports = router;
