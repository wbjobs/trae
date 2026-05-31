require('dotenv').config();
const express = require('express');
const path = require('path');

const KafkaConsumer = require('./src/kafkaConsumer');
const StreamProcessor = require('./src/streamProcessor');
const InfluxDBWriter = require('./src/influxDBWriter');
const WebSocketServer = require('./src/websocketServer');
const RootCauseAnalyzer = require('./src/rootCauseAnalyzer');

const app = express();
const HTTP_PORT = process.env.HTTP_PORT || 3000;
const WS_PORT = process.env.WS_PORT || 8080;

app.use(express.static(path.join(__dirname, 'public')));

app.get('/health', (req, res) => {
  const status = {
    status: 'ok',
    timestamp: new Date().toISOString(),
    kafkaConnected: kafkaConsumer ? true : false,
    websocketClients: wsServer ? wsServer.getClientCount() : 0
  };

  if (streamProcessor) {
    const streamStatus = streamProcessor.getStatus();
    status.streamProcessor = {
      watermark: streamStatus.watermark,
      watermarkTime: new Date(streamStatus.watermark).toISOString(),
      maxObservedTimestamp: streamStatus.maxObservedTimestamp,
      maxObservedTime: new Date(streamStatus.maxObservedTimestamp).toISOString(),
      openWindows: streamStatus.openWindows,
      totalDroppedMessages: streamStatus.totalDroppedMessages,
      allowedLatenessMs: streamStatus.allowedLatenessMs,
      windowSizeMs: streamStatus.windowSizeMs
    };
  }

  res.json(status);
});

let kafkaConsumer = null;
let streamProcessor = null;
let influxDBWriter = null;
let wsServer = null;

async function init() {
  console.log('='.repeat(60));
  console.log('🚀 实时交易异常检测仪表板启动中...');
  console.log('='.repeat(60));

  try {
    influxDBWriter = new InfluxDBWriter({
      url: process.env.INFLUXDB_URL,
      token: process.env.INFLUXDB_TOKEN,
      org: process.env.INFLUXDB_ORG,
      bucket: process.env.INFLUXDB_BUCKET,
      enabled: process.env.INFLUXDB_ENABLED !== 'false'
    });

    wsServer = new WebSocketServer({
      port: WS_PORT,
      maxDataPoints: parseInt(process.env.MAX_DATA_POINTS) || 100,
      maxAlerts: parseInt(process.env.MAX_ALERTS) || 50
    });
    await wsServer.start();

    streamProcessor = new StreamProcessor({
      windowSizeSeconds: parseInt(process.env.WINDOW_SIZE_SECONDS) || 10,
      sigmaThreshold: parseInt(process.env.SIGMA_THRESHOLD) || 3,
      allowedLatenessSeconds: parseInt(process.env.ALLOWED_LATENESS_SECONDS) || 5,
      rootCauseAnalysisWindowSeconds: parseInt(process.env.ROOT_CAUSE_WINDOW_SECONDS) || 10
    });

    const rootCauseAnalyzer = new RootCauseAnalyzer({
      minSupport: parseFloat(process.env.MIN_SUPPORT) || 0.15,
      minConfidence: parseFloat(process.env.MIN_CONFIDENCE) || 0.6,
      maxRules: parseInt(process.env.MAX_RULES) || 10,
      dimensions: ['region', 'deviceType', 'merchant'],
      analysisWindowSeconds: parseInt(process.env.ROOT_CAUSE_WINDOW_SECONDS) || 10
    });

    streamProcessor.setOnStatsCallback((stats) => {
      wsServer.sendStats(stats);
      if (influxDBWriter) {
        influxDBWriter.writeStats(stats);
      }
    });

    streamProcessor.setOnAlertCallback((alert) => {
      console.log(`⚠️  [ALERT] ${alert.severity} - 检测到 ${alert.anomalyCount} 笔异常交易`);
      if (alert.rootCauseAnalysis && alert.rootCauseAnalysis.summary) {
        console.log(`🔍 根因分析: ${alert.rootCauseAnalysis.summary}`);
      }
      wsServer.sendAlert(alert);
      if (influxDBWriter) {
        influxDBWriter.writeAlert(alert);
      }
    });

    streamProcessor.setOnRootCauseAnalysisCallback(async (anomalies, allTransactions, windowStart, windowEnd) => {
      try {
        const result = rootCauseAnalyzer.analyzeWithContext(anomalies, allTransactions, windowStart, windowEnd);
        console.log(`🔍 根因分析完成 - 发现 ${result.rules.length} 条规则, 耗时: ${result.stats.analysisTimeMs}ms`);
        return result;
      } catch (error) {
        console.error('[RootCause] Analysis error:', error.message);
        return null;
      }
    });

    kafkaConsumer = new KafkaConsumer({
      brokers: process.env.KAFKA_BROKERS ? process.env.KAFKA_BROKERS.split(',') : ['localhost:9092'],
      topic: process.env.KAFKA_TOPIC || 'trading-transactions',
      groupId: process.env.KAFKA_GROUP_ID || 'trading-dashboard-group',
      fromBeginning: process.env.KAFKA_FROM_BEGINNING === 'true'
    });

    kafkaConsumer.setMessageHandler(async (messages) => {
      wsServer.updateTransactionCount(messages.length);
      streamProcessor.processMessages(messages);
    });

    await kafkaConsumer.connect();
    await kafkaConsumer.subscribe();
    await kafkaConsumer.start();

    app.listen(HTTP_PORT, () => {
      console.log(`\n📊 HTTP 服务器运行在 http://localhost:${HTTP_PORT}`);
      console.log(`🔌 WebSocket 服务器运行在 ws://localhost:${WS_PORT}`);
      console.log('\n✅ 所有服务启动完成！');
      console.log('='.repeat(60));
    });

    process.on('SIGINT', async () => {
      console.log('\n\n📤 正在优雅关闭服务...');
      if (kafkaConsumer) await kafkaConsumer.disconnect();
      if (influxDBWriter) await influxDBWriter.close();
      if (wsServer) await wsServer.stop();
      process.exit(0);
    });

    process.on('SIGTERM', async () => {
      console.log('\n\n📤 正在优雅关闭服务...');
      if (kafkaConsumer) await kafkaConsumer.disconnect();
      if (influxDBWriter) await influxDBWriter.close();
      if (wsServer) await wsServer.stop();
      process.exit(0);
    });

  } catch (error) {
    console.error('\n❌ 启动失败:', error.message);
    console.error(error.stack);
    process.exit(1);
  }
}

init();
