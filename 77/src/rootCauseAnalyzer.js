const FPGrowth = require('./fpgrowth');

class RootCauseAnalyzer {
  constructor(config = {}) {
    this.minSupport = config.minSupport || 0.15;
    this.minConfidence = config.minConfidence || 0.6;
    this.maxRules = config.maxRules || 10;
    this.dimensions = config.dimensions || ['region', 'deviceType', 'merchant'];
    this.analysisWindowMs = (config.analysisWindowSeconds || 10) * 1000;

    this.fpgrowth = new FPGrowth(this.minSupport, this.minConfidence);
  }

  extractItems(transaction) {
    const items = [];

    for (const dimension of this.dimensions) {
      if (transaction[dimension] !== undefined && transaction[dimension] !== null) {
        items.push(`${dimension}:${transaction[dimension]}`);
      }
    }

    return items;
  }

  analyze(anomalyTransactions, normalTransactions = []) {
    const startTime = Date.now();

    if (anomalyTransactions.length === 0) {
      return {
        rules: [],
        frequentItemsets: [],
        stats: {
          anomalyCount: 0,
          normalCount: normalTransactions.length,
          analysisTimeMs: 0
        }
      };
    }

    const anomalyItemsets = anomalyTransactions.map(tx => this.extractItems(tx));
    const normalItemsets = normalTransactions.map(tx => this.extractItems(tx));

    const anomalyResults = this.fpgrowth.run(anomalyItemsets);
    const normalResults = normalTransactions.length > 0
      ? this.fpgrowth.run(normalItemsets)
      : { frequentItemsets: [], rules: [] };

    const normalItemsetMap = new Map();
    for (const itemset of normalResults.frequentItemsets) {
      const key = itemset.items.sort().join(',');
      normalItemsetMap.set(key, itemset);
    }

    const enrichedRules = anomalyResults.rules.map(rule => {
      const itemsetKey = [...rule.antecedent, ...rule.consequent].sort().join(',');
      const normalItemset = normalItemsetMap.get(itemsetKey);

      const normalSupport = normalItemset ? normalItemset.support : 0;
      const riskRatio = normalSupport > 0 ? rule.support / normalSupport : rule.support * 10;

      return {
        ...rule,
        normalSupport,
        riskRatio,
        descriptiveRule: this.formatRule(rule)
      };
    });

    const sortedRules = enrichedRules
      .filter(rule => rule.riskRatio > 1.5)
      .sort((a, b) => {
        const scoreA = a.confidence * a.riskRatio * a.support;
        const scoreB = b.confidence * b.riskRatio * b.support;
        return scoreB - scoreA;
      })
      .slice(0, this.maxRules);

    const analysisTimeMs = Date.now() - startTime;

    return {
      rules: sortedRules,
      frequentItemsets: anomalyResults.frequentItemsets
        .sort((a, b) => b.support - a.support)
        .slice(0, 20),
      stats: {
        anomalyCount: anomalyTransactions.length,
        normalCount: normalTransactions.length,
        totalItemsets: anomalyResults.frequentItemsets.length,
        totalRules: anomalyResults.rules.length,
        highRiskRules: sortedRules.length,
        analysisTimeMs
      }
    };
  }

  analyzeWithContext(anomalies, allTransactions, windowStart, windowEnd) {
    const analysisStart = windowStart - this.analysisWindowMs;

    const anomalyTransactions = [];
    const normalTransactions = [];

    for (const tx of allTransactions) {
      if (tx.timestamp >= analysisStart && tx.timestamp <= windowEnd) {
        const isAnomaly = anomalies.some(
          a => a.transactionId === tx.transactionId
        );

        if (isAnomaly) {
          anomalyTransactions.push(tx);
        } else {
          normalTransactions.push(tx);
        }
      }
    }

    const result = this.analyze(anomalyTransactions, normalTransactions);

    if (result.rules.length > 0) {
      const topCauses = result.rules.slice(0, 3).map(rule => ({
        pattern: rule.descriptiveRule,
        confidence: rule.confidence,
        support: rule.support,
        riskRatio: rule.riskRatio
      }));

      result.topCauses = topCauses;
      result.summary = this.generateSummary(topCauses, result.stats);
    } else {
      result.topCauses = [];
      result.summary = '未发现显著的异常模式关联规则。';
    }

    return result;
  }

  formatRule(rule) {
    const antecedent = rule.antecedent.map(item => this.formatItem(item)).join(' ∧ ');
    const consequent = rule.consequent.map(item => this.formatItem(item)).join(' ∧ ');
    return `${antecedent} → ${consequent}`;
  }

  formatItem(item) {
    const [dimension, value] = item.split(':');
    const dimensionNames = {
      'region': '地区',
      'deviceType': '设备类型',
      'merchant': '商户'
    };
    const displayName = dimensionNames[dimension] || dimension;
    return `${displayName}:${value}`;
  }

  generateSummary(topCauses, stats) {
    if (topCauses.length === 0) {
      return '未发现显著的异常模式关联规则。';
    }

    const cause = topCauses[0];
    const confidencePercent = (cause.confidence * 100).toFixed(1);
    const supportPercent = (cause.support * 100).toFixed(1);
    const riskRatio = cause.riskRatio.toFixed(1);

    return `最可能的根因: ${cause.pattern} ` +
      `(置信度: ${confidencePercent}%, 支持度: ${supportPercent}%, 风险倍数: ${riskRatio}x)`;
  }
}

module.exports = RootCauseAnalyzer;
