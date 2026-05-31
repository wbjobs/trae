class QueryAnalyzer {
  constructor() {
    this.queryLogs = [];
    this.maxLogs = 1000;
    this.fieldStats = new Map();
    this.queryPatterns = new Map();
    this.nPlusOneCandidates = new Map();
  }

  recordQuery(queryHash, operationName, fields) {
    const log = {
      id: Date.now() + Math.random(),
      queryHash,
      operationName: operationName || 'anonymous',
      timestamp: new Date().toISOString(),
      fields: [],
      totalDuration: 0
    };
    this.queryLogs.unshift(log);
    if (this.queryLogs.length > this.maxLogs) {
      this.queryLogs.pop();
    }
    return log.id;
  }

  recordField(queryLogId, parentType, fieldName, path, durationMs, dataSource = null, isCached = false) {
    const log = this.queryLogs.find(l => l.id === queryLogId);
    if (!log) return;

    const fieldRecord = {
      parentType,
      fieldName,
      path: path.join('.'),
      durationMs,
      dataSource,
      isCached,
      timestamp: new Date().toISOString()
    };

    log.fields.push(fieldRecord);
    log.totalDuration += durationMs;

    const fieldKey = `${parentType}.${fieldName}`;
    if (!this.fieldStats.has(fieldKey)) {
      this.fieldStats.set(fieldKey, {
        count: 0,
        totalDuration: 0,
        maxDuration: 0,
        avgDuration: 0,
        dataSources: new Set(),
        cacheHitCount: 0
      });
    }

    const stats = this.fieldStats.get(fieldKey);
    stats.count++;
    stats.totalDuration += durationMs;
    stats.maxDuration = Math.max(stats.maxDuration, durationMs);
    stats.avgDuration = stats.totalDuration / stats.count;
    if (dataSource) stats.dataSources.add(dataSource);
    if (isCached) stats.cacheHitCount++;

    if (parentType === 'User' && (fieldName === 'weather' || fieldName === 'onlineStatus')) {
      const pathKey = path.slice(0, -1).join('.');
      if (!this.nPlusOneCandidates.has(pathKey)) {
        this.nPlusOneCandidates.set(pathKey, { field: fieldName, count: 0 });
      }
      this.nPlusOneCandidates.get(pathKey).count++;
    }
  }

  getFieldStats() {
    const result = [];
    for (const [field, stats] of this.fieldStats.entries()) {
      result.push({
        field,
        count: stats.count,
        totalDuration: Math.round(stats.totalDuration),
        maxDuration: Math.round(stats.maxDuration),
        avgDuration: Math.round(stats.avgDuration),
        dataSources: Array.from(stats.dataSources),
        cacheHitRate: stats.count > 0 ? `${Math.round(stats.cacheHitCount / stats.count * 100)}%` : '0%'
      });
    }
    return result.sort((a, b) => b.totalDuration - a.totalDuration);
  }

  getRecommendations() {
    const recommendations = [];
    const fieldStats = this.getFieldStats();

    for (const stat of fieldStats) {
      if (stat.avgDuration > 500 && stat.count > 5) {
        recommendations.push({
          type: 'cache',
          severity: 'high',
          field: stat.field,
          message: `字段 "${stat.field}" 平均耗时 ${stat.avgDuration}ms，共访问 ${stat.count} 次，建议添加缓存`,
          impact: '减少数据库/API压力，提升查询性能'
        });
      }

      if (stat.avgDuration > 200 && stat.count > 10 && !stat.dataSources.includes('cache')) {
        recommendations.push({
          type: 'cache',
          severity: 'medium',
          field: stat.field,
          message: `字段 "${stat.field}" 平均耗时 ${stat.avgDuration}ms，访问频繁，考虑添加缓存`,
          impact: '可能改善查询响应时间'
        });
      }
    }

    for (const [path, info] of this.nPlusOneCandidates.entries()) {
      if (info.count > 5) {
        recommendations.push({
          type: 'nplusone',
          severity: 'high',
          field: `${path}.${info.field}`,
          message: `检测到潜在的 N+1 问题："${path}" 下的 "${info.field}" 字段在单次查询中被解析 ${info.count} 次`,
          impact: '可能导致大量重复的数据库/API调用',
          suggestion: '使用 DataLoader 进行批量加载优化'
        });
      }
    }

    const slowQueries = this.queryLogs
      .filter(log => log.totalDuration > 3000)
      .slice(0, 5);
    
    for (const log of slowQueries) {
      recommendations.push({
        type: 'slow_query',
        severity: 'medium',
        query: log.operationName,
        message: `查询 "${log.operationName}" 总耗时 ${Math.round(log.totalDuration)}ms，超过3秒阈值`,
        impact: '影响用户体验'
      });
    }

    this.nPlusOneCandidates.clear();

    return recommendations;
  }

  getRecentQueries(limit = 20) {
    return this.queryLogs.slice(0, limit).map(log => ({
      id: log.id,
      operationName: log.operationName,
      timestamp: log.timestamp,
      totalDuration: Math.round(log.totalDuration),
      fieldCount: log.fields.length,
      fields: log.fields.map(f => ({
        path: f.path,
        durationMs: Math.round(f.durationMs),
        dataSource: f.dataSource,
        isCached: f.isCached
      }))
    }));
  }

  getAnalysisReport() {
    const fieldStats = this.getFieldStats();
    const recommendations = this.getRecommendations();
    const recentQueries = this.getRecentQueries(10);

    const totalQueries = this.queryLogs.length;
    const totalDuration = this.queryLogs.reduce((sum, log) => sum + log.totalDuration, 0);
    const avgQueryDuration = totalQueries > 0 ? totalDuration / totalQueries : 0;

    const slowQueryCount = this.queryLogs.filter(log => log.totalDuration > 1000).length;
    const slowQueryRate = totalQueries > 0 ? (slowQueryCount / totalQueries * 100).toFixed(1) : 0;

    return {
      summary: {
        totalQueriesAnalyzed: totalQueries,
        totalDurationMs: Math.round(totalDuration),
        averageQueryDurationMs: Math.round(avgQueryDuration),
        slowQueryCount,
        slowQueryRate: `${slowQueryRate}%`,
        uniqueFieldsTracked: fieldStats.length
      },
      fieldPerformance: fieldStats,
      recommendations,
      recentQueries
    };
  }

  clear() {
    this.queryLogs = [];
    this.fieldStats.clear();
    this.queryPatterns.clear();
    this.nPlusOneCandidates.clear();
    console.log('[Analyzer] All analysis data cleared');
  }
}

module.exports = QueryAnalyzer;
