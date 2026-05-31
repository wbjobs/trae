const WS_URL = 'ws://localhost:8080';
const MAX_DATA_POINTS = 100;
const MAX_ALERTS = 50;

let ws = null;
let reconnectAttempts = 0;
const MAX_RECONNECT_ATTEMPTS = 10;
const RECONNECT_DELAY = 3000;

let statsData = [];
let rateData = [];
let alerts = [];
let anomalyPoints = [];
let upperBoundData = [];
let lowerBoundData = [];

let totalTransactions = 0;
let totalAlerts = 0;
let currentRate = 0;

let mainChart = null;
let rateChart = null;

function initCharts() {
    mainChart = echarts.init(document.getElementById('mainChart'));
    rateChart = echarts.init(document.getElementById('rateChart'));

    window.addEventListener('resize', () => {
        mainChart.resize();
        rateChart.resize();
    });

    updateMainChart();
    updateRateChart();
}

function updateMainChart() {
    const option = {
        backgroundColor: 'transparent',
        tooltip: {
            trigger: 'axis',
            backgroundColor: 'rgba(0, 0, 0, 0.8)',
            borderColor: '#00d4ff',
            textStyle: { color: '#fff' },
            formatter: function(params) {
                let result = params[0].axisValueLabel + '<br/>';
                params.forEach(param => {
                    if (param.seriesName !== '异常点') {
                        result += `${param.marker} ${param.seriesName}: ¥${param.value.toFixed(2)}<br/>`;
                    }
                });
                if (anomalyPoints.length > 0) {
                    const anomaly = anomalyPoints.find(a => a[0] === params[0].axisValue);
                    if (anomaly) {
                        result += `<span style="color:#ff4757;">⚠️ 检测到 ${anomaly[2]} 个异常交易</span>`;
                    }
                }
                return result;
            }
        },
        legend: {
            data: ['平均金额', '3σ上界', '3σ下界', '异常点'],
            textStyle: { color: '#888' },
            top: 10
        },
        grid: {
            left: '3%',
            right: '4%',
            bottom: '3%',
            top: 50,
            containLabel: true
        },
        xAxis: {
            type: 'category',
            boundaryGap: false,
            data: statsData.map(d => formatTime(d[0])),
            axisLine: { lineStyle: { color: '#444' } },
            axisLabel: { color: '#888', fontSize: 11 }
        },
        yAxis: {
            type: 'value',
            name: '金额 (¥)',
            axisLine: { lineStyle: { color: '#444' } },
            axisLabel: { color: '#888', formatter: '¥{value}' },
            splitLine: { lineStyle: { color: 'rgba(255,255,255,0.05)' } }
        },
        series: [
            {
                name: '平均金额',
                type: 'line',
                smooth: true,
                data: statsData.map(d => d[1]),
                lineStyle: { color: '#00d4ff', width: 2 },
                itemStyle: { color: '#00d4ff' },
                areaStyle: {
                    color: new echarts.graphic.LinearGradient(0, 0, 0, 1, [
                        { offset: 0, color: 'rgba(0, 212, 255, 0.3)' },
                        { offset: 1, color: 'rgba(0, 212, 255, 0)' }
                    ])
                }
            },
            {
                name: '3σ上界',
                type: 'line',
                smooth: true,
                data: upperBoundData.map(d => d[1]),
                lineStyle: { color: '#ff4757', width: 1, type: 'dashed' },
                itemStyle: { color: '#ff4757' },
                showSymbol: false
            },
            {
                name: '3σ下界',
                type: 'line',
                smooth: true,
                data: lowerBoundData.map(d => d[1]),
                lineStyle: { color: '#00ff88', width: 1, type: 'dashed' },
                itemStyle: { color: '#00ff88' },
                showSymbol: false
            },
            {
                name: '异常点',
                type: 'scatter',
                data: anomalyPoints,
                symbolSize: 12,
                itemStyle: {
                    color: '#ff4757',
                    shadowBlur: 10,
                    shadowColor: 'rgba(255, 71, 87, 0.5)'
                },
                tooltip: {
                    formatter: function(params) {
                        return `时间: ${params.data[0]}<br/>异常交易数: ${params.data[2]}<br/>窗口均值: ¥${params.data[3].toFixed(2)}`;
                    }
                }
            }
        ]
    };

    mainChart.setOption(option);
}

function updateRateChart() {
    const option = {
        backgroundColor: 'transparent',
        tooltip: {
            trigger: 'axis',
            backgroundColor: 'rgba(0, 0, 0, 0.8)',
            borderColor: '#00d4ff',
            textStyle: { color: '#fff' },
            formatter: function(params) {
                return `${params[0].axisValueLabel}<br/>${params[0].marker} 交易速率: ${params[0].value} tx/s`;
            }
        },
        grid: {
            left: '3%',
            right: '4%',
            bottom: '3%',
            top: 30,
            containLabel: true
        },
        xAxis: {
            type: 'category',
            boundaryGap: false,
            data: rateData.map(d => formatTime(d[0])),
            axisLine: { lineStyle: { color: '#444' } },
            axisLabel: { color: '#888', fontSize: 11 }
        },
        yAxis: {
            type: 'value',
            name: 'TPS',
            axisLine: { lineStyle: { color: '#444' } },
            axisLabel: { color: '#888' },
            splitLine: { lineStyle: { color: 'rgba(255,255,255,0.05)' } }
        },
        series: [{
            name: '交易速率',
            type: 'line',
            smooth: true,
            data: rateData.map(d => d[1]),
            lineStyle: {
                color: new echarts.graphic.LinearGradient(0, 0, 1, 0, [
                    { offset: 0, color: '#7b2cbf' },
                    { offset: 1, color: '#00d4ff' }
                ]),
                width: 2
            },
            itemStyle: { color: '#7b2cbf' },
            areaStyle: {
                color: new echarts.graphic.LinearGradient(0, 0, 0, 1, [
                    { offset: 0, color: 'rgba(123, 44, 191, 0.3)' },
                    { offset: 1, color: 'rgba(123, 44, 191, 0)' }
                ])
            }
        }]
    };

    rateChart.setOption(option);
}

function formatTime(timestamp) {
    const date = new Date(timestamp);
    return date.toLocaleTimeString('zh-CN', { hour12: false });
}

function connectWebSocket() {
    if (ws && ws.readyState === WebSocket.OPEN) {
        return;
    }

    updateConnectionStatus(false);
    document.getElementById('reconnectBtn').disabled = true;

    try {
        ws = new WebSocket(WS_URL);
    } catch (error) {
        console.error('WebSocket connection error:', error);
        scheduleReconnect();
        return;
    }

    ws.onopen = function() {
        console.log('WebSocket connected');
        reconnectAttempts = 0;
        updateConnectionStatus(true);
        document.getElementById('reconnectBtn').disabled = false;
    };

    ws.onmessage = function(event) {
        try {
            const message = JSON.parse(event.data);
            handleMessage(message);
        } catch (error) {
            console.error('Failed to parse WebSocket message:', error);
        }
    };

    ws.onclose = function() {
        console.log('WebSocket disconnected');
        updateConnectionStatus(false);
        scheduleReconnect();
    };

    ws.onerror = function(error) {
        console.error('WebSocket error:', error);
    };
}

function scheduleReconnect() {
    if (reconnectAttempts < MAX_RECONNECT_ATTEMPTS) {
        reconnectAttempts++;
        console.log(`Reconnecting... (attempt ${reconnectAttempts}/${MAX_RECONNECT_ATTEMPTS})`);
        document.getElementById('connectionText').textContent = `重连中 (${reconnectAttempts})`;
        setTimeout(connectWebSocket, RECONNECT_DELAY);
    } else {
        document.getElementById('connectionText').textContent = '连接失败';
        document.getElementById('reconnectBtn').disabled = false;
    }
}

function updateConnectionStatus(connected) {
    const statusDot = document.getElementById('connectionStatus');
    const statusText = document.getElementById('connectionText');

    if (connected) {
        statusDot.className = 'status-dot connected';
        statusText.textContent = '已连接';
    } else {
        statusDot.className = 'status-dot disconnected';
        statusText.textContent = '未连接';
    }
}

function handleMessage(message) {
    switch (message.type) {
        case 'INIT':
            handleInit(message.data);
            break;
        case 'STATS_UPDATE':
            handleStatsUpdate(message.data);
            break;
        case 'ALERT':
            handleAlert(message.data);
            break;
        case 'RATE_UPDATE':
            handleRateUpdate(message.data);
            break;
    }
}

function handleInit(data) {
    statsData = data.stats.map(s => [s.timestamp, s.mean]);
    upperBoundData = data.stats.map(s => [s.timestamp, s.mean + 3 * s.stddev]);
    lowerBoundData = data.stats.map(s => [s.timestamp, Math.max(0, s.mean - 3 * s.stddev)]);
    alerts = data.alerts || [];
    currentRate = data.currentRate || 0;

    totalAlerts = alerts.length;
    updateStatsDisplay();
    updateAlertsList();
    updateMainChart();
    updateRateChart();
}

function handleStatsUpdate(stats) {
    statsData.push([stats.timestamp, stats.mean]);
    upperBoundData.push([stats.timestamp, stats.mean + 3 * stats.stddev]);
    lowerBoundData.push([stats.timestamp, Math.max(0, stats.mean - 3 * stats.stddev)]);

    if (statsData.length > MAX_DATA_POINTS) {
        statsData.shift();
        upperBoundData.shift();
        lowerBoundData.shift();
    }

    totalTransactions += stats.count;

    updateStatsDisplay();
    updateMainChart();
}

function handleAlert(alert) {
    alerts.unshift(alert);
    if (alerts.length > MAX_ALERTS) {
        alerts.pop();
    }

    totalAlerts++;

    const timeStr = formatTime(alert.timestamp);
    anomalyPoints.push([timeStr, alert.windowMean, alert.anomalyCount, alert.windowMean]);

    if (alert.rootCauseAnalysis) {
        updateRootCauseAnalysis(alert.rootCauseAnalysis, alert);
    }

    updateStatsDisplay();
    updateAlertsList();
    updateMainChart();

    if (Notification && Notification.permission === 'granted') {
        new Notification('⚠️ 异常交易检测', {
            body: `检测到 ${alert.anomalyCount} 笔异常交易，严重程度: ${alert.severity}`,
            icon: 'data:image/svg+xml,<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 100 100"><text y=".9em" font-size="90">⚠️</text></svg>'
        });
    }
}

function handleRateUpdate(data) {
    currentRate = data.rate;
    rateData.push([data.timestamp, data.rate]);

    if (rateData.length > MAX_DATA_POINTS) {
        rateData.shift();
    }

    document.getElementById('transactionRate').textContent = currentRate;
    updateRateChart();
}

function updateStatsDisplay() {
    document.getElementById('totalTransactions').textContent = totalTransactions.toLocaleString();
    document.getElementById('totalAlerts').textContent = totalAlerts;

    if (statsData.length > 0) {
        const recentStats = statsData.slice(-10);
        const avgAmount = recentStats.reduce((sum, d) => sum + d[1], 0) / recentStats.length;
        document.getElementById('avgAmount').textContent = avgAmount.toFixed(2);

        const lastStat = statsData[statsData.length - 1];
        document.getElementById('currentMean').textContent = lastStat[1].toFixed(2);
    }

    if (upperBoundData.length > 0 && lowerBoundData.length > 0) {
        const lastUpper = upperBoundData[upperBoundData.length - 1];
        const lastLower = lowerBoundData[lowerBoundData.length - 1];
        document.getElementById('upperBound').textContent = lastUpper[1].toFixed(2);
        document.getElementById('lowerBound').textContent = lastLower[1].toFixed(2);
    }

    document.getElementById('alertCount').textContent = alerts.length;
}

function updateAlertsList() {
    const container = document.getElementById('alertsList');

    if (alerts.length === 0) {
        container.innerHTML = '<div class="no-alerts">暂无异常告警</div>';
        return;
    }

    container.innerHTML = alerts.map(alert => {
        const time = new Date(alert.timestamp).toLocaleString('zh-CN');
        const severityClass = alert.severity === 'HIGH' ? 'high' : 'medium';

        return `
            <div class="alert-item ${severityClass}">
                <div class="alert-header">
                    <span class="alert-severity ${alert.severity}">${alert.severity}</span>
                    <span class="alert-time">${time}</span>
                </div>
                <div class="alert-details">
                    <div class="alert-detail-row">
                        <span class="alert-detail-label">异常交易数:</span>
                        <span class="alert-detail-value">${alert.anomalyCount} / ${alert.totalTransactions}</span>
                    </div>
                    <div class="alert-detail-row">
                        <span class="alert-detail-label">窗口均值:</span>
                        <span class="alert-detail-value">¥${alert.windowMean.toFixed(2)}</span>
                    </div>
                    <div class="alert-detail-row">
                        <span class="alert-detail-label">置信区间:</span>
                        <span class="alert-detail-value">¥${alert.lowerBound.toFixed(2)} ~ ¥${alert.upperBound.toFixed(2)}</span>
                    </div>
                    ${alert.anomalies && alert.anomalies.length > 0 ? `
                    <div class="alert-detail-row">
                        <span class="alert-detail-label">最高异常金额:</span>
                        <span class="alert-detail-value" style="color: #ff4757;">¥${Math.max(...alert.anomalies.map(a => a.amount)).toFixed(2)}</span>
                    </div>
                    ` : ''}
                    ${alert.rootCauseAnalysis && alert.rootCauseAnalysis.summary ? `
                    <div class="alert-detail-row" style="margin-top: 8px; padding-top: 8px; border-top: 1px solid rgba(255,255,255,0.1);">
                        <span class="alert-detail-label">🔍 根因:</span>
                        <span class="alert-detail-value" style="font-size: 11px; color: #00d4ff;">${alert.rootCauseAnalysis.summary}</span>
                    </div>
                    ` : ''}
                </div>
            </div>
        `;
    }).join('');
}

function updateRootCauseAnalysis(rootCauseData, alert) {
    const summaryContainer = document.getElementById('rootCauseSummary');
    const rulesContainer = document.getElementById('rootCauseRules');

    if (!rootCauseData || !rootCauseData.rules || rootCauseData.rules.length === 0) {
        summaryContainer.innerHTML = `
            <div class="root-cause-summary-text">
                <strong>分析时间:</strong> ${new Date(alert.timestamp).toLocaleString('zh-CN')}<br/>
                <strong>结果:</strong> 未发现显著的异常模式关联规则。
            </div>
        `;
        summaryContainer.classList.add('has-result');
        rulesContainer.innerHTML = '<div class="no-rules">暂无高置信度关联规则</div>';
        return;
    }

    const summary = rootCauseData.summary || '已完成根因分析';
    const stats = rootCauseData.stats || {};

    summaryContainer.innerHTML = `
        <div class="root-cause-summary-text">
            <strong>⚠️  最新异常根因:</strong><br/>
            ${summary}
        </div>
        <div class="root-cause-meta">
            <span>分析时间: ${new Date(alert.timestamp).toLocaleString('zh-CN')}</span>
            <span>异常样本: ${stats.anomalyCount || 0} 笔</span>
            <span>规则数量: ${rootCauseData.rules.length} 条</span>
            <span>耗时: ${stats.analysisTimeMs || 0}ms</span>
        </div>
    `;
    summaryContainer.classList.add('has-result');

    rulesContainer.innerHTML = rootCauseData.rules.slice(0, 6).map((rule, index) => {
        const antecedent = rule.antecedent ? rule.antecedent.map(item => formatRuleItem(item)).join(' ∧ ') : '';
        const consequent = rule.consequent ? rule.consequent.map(item => formatRuleItem(item)).join(' ∧ ') : '';
        const confidence = (rule.confidence * 100).toFixed(1);
        const support = (rule.support * 100).toFixed(1);
        const riskRatio = rule.riskRatio ? rule.riskRatio.toFixed(1) : 'N/A';

        return `
            <div class="rule-card">
                <span class="rule-rank">#${index + 1}</span>
                <div class="rule-pattern">
                    <span class="antecedent">${antecedent}</span>
                    <span class="arrow">→</span>
                    <span class="consequent">${consequent}</span>
                </div>
                <div class="rule-metrics">
                    <div class="metric">
                        <div class="metric-label">置信度</div>
                        <div class="metric-value">${confidence}%</div>
                    </div>
                    <div class="metric">
                        <div class="metric-label">支持度</div>
                        <div class="metric-value support">${support}%</div>
                    </div>
                    <div class="metric">
                        <div class="metric-label">风险倍数</div>
                        <div class="metric-value risk">${riskRatio}x</div>
                    </div>
                </div>
            </div>
        `;
    }).join('');
}

function formatRuleItem(item) {
    const [dimension, value] = item.split(':');
    const dimensionNames = {
        'region': '地区',
        'deviceType': '设备',
        'merchant': '商户'
    };
    const displayName = dimensionNames[dimension] || dimension;
    return `${displayName}:${value}`;
}

function requestNotificationPermission() {
    if ('Notification' in window && Notification.permission === 'default') {
        Notification.requestPermission();
    }
}

document.addEventListener('DOMContentLoaded', function() {
    initCharts();
    connectWebSocket();
    requestNotificationPermission();
});
