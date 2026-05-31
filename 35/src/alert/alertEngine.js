const EventEmitter = require('events');
const config = require('../config/config');

class AlertEngine extends EventEmitter {
  constructor() {
    super();
    this.rules = [...config.alertRules];
    this.currentValues = new Map();
    this.valueHistory = new Map();
    this.activeAlerts = new Map();
    this.checkInterval = null;
    this.cooldownPeriod = 30000;
    this.lastAlertTime = new Map();
  }

  start() {
    if (this.checkInterval) {
      this.stop();
    }
    
    this.checkInterval = setInterval(() => {
      this.checkAllRules();
    }, config.alert.checkInterval);
    
    console.log(`[Alert Engine] Started with ${this.rules.length} rules`);
  }

  stop() {
    if (this.checkInterval) {
      clearInterval(this.checkInterval);
      this.checkInterval = null;
      console.log('[Alert Engine] Stopped');
    }
  }

  updateValue(plcId, tagName, value, timestamp = new Date()) {
    const key = `${plcId}:${tagName}`;
    const previousValue = this.currentValues.get(key);
    
    this.currentValues.set(key, {
      value,
      timestamp
    });

    if (!this.valueHistory.has(key)) {
      this.valueHistory.set(key, []);
    }
    
    const history = this.valueHistory.get(key);
    history.push({ value, timestamp });
    
    const maxHistoryAge = 60000;
    const cutoffTime = Date.now() - maxHistoryAge;
    while (history.length > 0 && history[0].timestamp.getTime() < cutoffTime) {
      history.shift();
    }

    if (previousValue) {
      this.checkRulesForTag(plcId, tagName, value, previousValue.value);
    }
  }

  checkAllRules() {
    this.rules.forEach(rule => {
      const key = `${rule.plcId}:${rule.tag}`;
      const currentData = this.currentValues.get(key);
      
      if (!currentData) return;

      if (rule.type === 'threshold') {
        this.checkThresholdRule(rule, currentData.value);
      } else if (rule.type === 'changeRate') {
        this.checkChangeRateRule(rule, key);
      }
    });
  }

  checkRulesForTag(plcId, tagName, currentValue, previousValue) {
    const relevantRules = this.rules.filter(
      rule => rule.plcId === plcId && rule.tag === tagName
    );

    relevantRules.forEach(rule => {
      if (rule.type === 'threshold') {
        this.checkThresholdRule(rule, currentValue);
      } else if (rule.type === 'changeRate') {
        const key = `${plcId}:${tagName}`;
        this.checkChangeRateRule(rule, key);
      }
    });
  }

  checkThresholdRule(rule, currentValue) {
    let isTriggered = false;
    
    switch (rule.operator) {
      case '>':
        isTriggered = currentValue > rule.value;
        break;
      case '>=':
        isTriggered = currentValue >= rule.value;
        break;
      case '<':
        isTriggered = currentValue < rule.value;
        break;
      case '<=':
        isTriggered = currentValue <= rule.value;
        break;
      case '==':
        isTriggered = currentValue === rule.value;
        break;
      case '!=':
        isTriggered = currentValue !== rule.value;
        break;
      default:
        return;
    }

    const alertKey = rule.id;
    
    if (isTriggered) {
      if (!this.activeAlerts.has(alertKey)) {
        if (this.shouldTriggerAlert(alertKey)) {
          this.triggerAlert(rule, currentValue);
        }
      }
    } else {
      if (this.activeAlerts.has(alertKey)) {
        this.clearAlert(rule, currentValue);
      }
    }
  }

  checkChangeRateRule(rule, key) {
    const history = this.valueHistory.get(key);
    if (!history || history.length < 2) return;

    const windowMs = rule.windowMs || 5000;
    const now = Date.now();
    const windowStart = now - windowMs;
    
    const windowValues = history.filter(
      h => h.timestamp.getTime() >= windowStart
    );
    
    if (windowValues.length < 2) return;

    const oldest = windowValues[0];
    const newest = windowValues[windowValues.length - 1];
    
    const timeDiff = (newest.timestamp.getTime() - oldest.timestamp.getTime()) / 1000;
    if (timeDiff <= 0) return;
    
    const changeRate = Math.abs(newest.value - oldest.value) / timeDiff;
    
    let isTriggered = false;
    switch (rule.operator) {
      case '>':
        isTriggered = changeRate > rule.value;
        break;
      case '>=':
        isTriggered = changeRate >= rule.value;
        break;
      case '<':
        isTriggered = changeRate < rule.value;
        break;
      default:
        return;
    }

    const alertKey = rule.id;
    
    if (isTriggered) {
      if (!this.activeAlerts.has(alertKey)) {
        if (this.shouldTriggerAlert(alertKey)) {
          this.triggerAlert(rule, newest.value, changeRate);
        }
      }
    } else {
      if (this.activeAlerts.has(alertKey)) {
        this.clearAlert(rule, newest.value);
      }
    }
  }

  shouldTriggerAlert(alertKey) {
    const lastTriggered = this.lastAlertTime.get(alertKey);
    if (!lastTriggered) return true;
    
    const timeSinceLast = Date.now() - lastTriggered.getTime();
    return timeSinceLast >= this.cooldownPeriod;
  }

  triggerAlert(rule, currentValue, changeRate = null) {
    const alert = {
      id: `${rule.id}-${Date.now()}`,
      ruleId: rule.id,
      plcId: rule.plcId,
      tagName: rule.tag,
      type: rule.type,
      severity: rule.severity,
      value: currentValue,
      threshold: rule.value,
      changeRate: changeRate,
      description: rule.description,
      timestamp: new Date(),
      status: 'active'
    };

    this.activeAlerts.set(rule.id, alert);
    this.lastAlertTime.set(rule.id, new Date());
    
    this.emit('alert_triggered', alert);
    console.log(`[Alert Engine] ALERT: ${rule.description} - Value: ${currentValue}${changeRate ? `, Rate: ${changeRate.toFixed(2)}/s` : ''}`);
  }

  clearAlert(rule, currentValue) {
    const alert = this.activeAlerts.get(rule.id);
    if (alert) {
      alert.status = 'cleared';
      alert.clearedAt = new Date();
      alert.clearedValue = currentValue;
      
      this.emit('alert_cleared', alert);
      this.activeAlerts.delete(rule.id);
      
      console.log(`[Alert Engine] CLEARED: ${rule.description} - Current Value: ${currentValue}`);
    }
  }

  addRule(rule) {
    this.rules.push(rule);
    console.log(`[Alert Engine] Rule added: ${rule.description}`);
  }

  removeRule(ruleId) {
    const index = this.rules.findIndex(r => r.id === ruleId);
    if (index !== -1) {
      this.rules.splice(index, 1);
      this.activeAlerts.delete(ruleId);
      this.lastAlertTime.delete(ruleId);
      console.log(`[Alert Engine] Rule removed: ${ruleId}`);
    }
  }

  getActiveAlerts() {
    return Array.from(this.activeAlerts.values());
  }

  getRules() {
    return [...this.rules];
  }

  getCurrentValue(plcId, tagName) {
    const key = `${plcId}:${tagName}`;
    return this.currentValues.get(key) || null;
  }

  getAllCurrentValues() {
    const result = {};
    for (const [key, data] of this.currentValues.entries()) {
      const [plcId, tagName] = key.split(':');
      if (!result[plcId]) {
        result[plcId] = {};
      }
      result[plcId][tagName] = data;
    }
    return result;
  }
}

const alertEngine = new AlertEngine();

module.exports = alertEngine;
module.exports.AlertEngine = AlertEngine;
