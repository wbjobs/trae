require('dotenv').config();

const opcuaClient = require('./opcua/client');
const influxStorage = require('./storage/influxdb');
const alertEngine = require('./alert/alertEngine');
const apiServer = require('./api/server');

async function processDataBatch(batch) {
  try {
    const writePromises = batch.map(item => 
      influxStorage.writePlcData(item.plcId, item.tagName, item.value, item.timestamp)
    );
    await Promise.all(writePromises);
  } catch (error) {
    console.error('[Gateway] Batch write to InfluxDB failed:', error.message);
  }
}

function processAlertBatch(batch) {
  for (const item of batch) {
    alertEngine.updateValue(item.plcId, item.tagName, item.value, item.timestamp);
  }
}

function processWebSocketBatch(batch) {
  for (const item of batch) {
    apiServer.broadcastPlcData(item.plcId, item.tagName, item.value, item.timestamp);
  }
}

async function main() {
  console.log('========================================');
  console.log('🏭 工业物联网OPC UA协议网关启动中...');
  console.log('========================================\n');

  try {
    apiServer.start();
    
    alertEngine.on('alert_triggered', async (alert) => {
      await influxStorage.writeAlert(alert);
      apiServer.broadcastAlert(alert);
    });
    
    alertEngine.on('alert_cleared', (alert) => {
      console.log(`[Alert] Cleared: ${alert.description}`);
    });
    
    alertEngine.start();

    if (opcuaClient.useBatchProcessing) {
      console.log('[Gateway] Using high-performance batch processing mode');
      
      opcuaClient.on('data_batch', async (batch) => {
        await processDataBatch(batch);
      });

      opcuaClient.on('alert_batch', (batch) => {
        processAlertBatch(batch);
      });

      opcuaClient.on('websocket_batch', (batch) => {
        processWebSocketBatch(batch);
      });

      opcuaClient.on('batch_processed', (stats) => {
        if (stats.size > 0) {
          console.log(`[Batch] Processed ${stats.size} items in ${stats.processingTimeMs}ms`);
        }
      });

      opcuaClient.on('backpressure_start', (info) => {
        console.warn(`[Backpressure] Buffer usage at ${(info.usage * 100).toFixed(1)}% - system is under high load`);
      });

      opcuaClient.on('backpressure_end', (info) => {
        console.log(`[Backpressure] Buffer usage recovered to ${(info.usage * 100).toFixed(1)}%`);
      });

      opcuaClient.on('data_dropped', (item) => {
        console.warn(`[Data Dropped] Buffer overflow - dropped data from ${item.plcId}:${item.tagName}`);
      });

      opcuaClient.startBatchProcessing();
    } else {
      console.log('[Gateway] Using standard single-item processing mode');
      
      opcuaClient.on('data_changed', async (data) => {
        await influxStorage.writePlcData(data.plcId, data.tagName, data.value, data.timestamp);
        alertEngine.updateValue(data.plcId, data.tagName, data.value, data.timestamp);
        apiServer.broadcastPlcData(data.plcId, data.tagName, data.value, data.timestamp);
      });
    }

    opcuaClient.on('connected', async () => {
      console.log('[Gateway] OPC UA client connected, starting monitoring...');
      await opcuaClient.monitorAllTags();
    });

    opcuaClient.on('disconnected', () => {
      console.warn('[Gateway] OPC UA client disconnected');
    });

    if (opcuaClient.enableSimulation) {
      console.log('[Gateway] Simulation mode enabled - auto fallback on PLC disconnect');
      
      opcuaClient.on('simulation_started', (info) => {
        console.log(`[Gateway] SIMULATION MODE ACTIVE: ${info.reason} - generating virtual data for ${info.monitoredTags} tags`);
        apiServer.broadcastData('simulation_status', { active: true, info });
      });
      
      opcuaClient.on('simulation_stopped', (info) => {
        console.log(`[Gateway] Simulation ended: ${info.reason} - duration: ${(info.durationMs / 1000).toFixed(1)}s, generated: ${info.generatedPoints} points`);
        apiServer.broadcastData('simulation_status', { active: false, info });
      });
    }

    const connected = await opcuaClient.connect();
    
    if (!connected) {
      console.warn('[Gateway] Failed to connect to OPC UA server. Please ensure the server is running.');
      console.log('[Gateway] Starting in offline mode - API server still available');
      console.log('[Gateway] You can start the OPC UA simulator server with: npm run server');
    }

    console.log('\n========================================');
    console.log('✅ 网关服务启动完成');
    console.log(`📊 Web面板: http://localhost:${process.env.API_PORT || 3000}`);
    console.log(`⚙️  处理模式: ${opcuaClient.useBatchProcessing ? '高性能批量处理' : '标准单条处理'}`);
    if (opcuaClient.useBatchProcessing) {
      console.log(`📦 缓冲区容量: 50,000 条`);
      console.log(`📦 批量大小: 500 条`);
      console.log(`📦 刷新间隔: 100ms`);
    }
    console.log('========================================\n');

    process.on('SIGINT', async () => {
      console.log('\n========================================');
      console.log('🛑 正在关闭网关服务...');
      console.log('========================================\n');
      
      alertEngine.stop();
      await opcuaClient.disconnect();
      apiServer.stop();
      
      console.log('👋 网关服务已关闭');
      process.exit(0);
    });

  } catch (error) {
    console.error('[Gateway] Fatal error during startup:', error);
    process.exit(1);
  }
}

main();
