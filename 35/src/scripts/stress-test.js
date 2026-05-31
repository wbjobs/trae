const BatchProcessor = require('../utils/BatchProcessor');

const TOTAL_ITEMS = 50000;
const CONCURRENT_TAGS = 500;
const INTERVAL_MS = 10;

console.log('========================================');
console.log('🏋️  批量处理器压力测试');
console.log(`📊 模拟 ${CONCURRENT_TAGS} 个并发标签, 共 ${TOTAL_ITEMS} 条数据`);
console.log('========================================\n');

const processor = new BatchProcessor({
  bufferCapacity: 50000,
  batchSize: 500,
  flushIntervalMs: 100,
  maxBatchDelayMs: 500,
  backpressureThreshold: 0.8,
  stalenessThresholdMs: 5000
});

let processedCount = 0;
let batchCount = 0;
let totalProcessingTime = 0;
let maxBatchTime = 0;
let droppedCount = 0;
let backpressureEvents = 0;
let startedAt = null;
let endedAt = null;

processor.on('data_batch', (batch) => {
  const startTime = Date.now();
  processedCount += batch.length;
  batchCount++;
  
  const processingTime = Date.now() - startTime;
  totalProcessingTime += processingTime;
  if (processingTime > maxBatchTime) {
    maxBatchTime = processingTime;
  }
  
  if (processedCount % 5000 === 0) {
    console.log(`📦 已处理 ${processedCount}/${TOTAL_ITEMS} 条 (${((processedCount/TOTAL_ITEMS)*100).toFixed(1)}%)`);
  }
  
  if (processedCount >= TOTAL_ITEMS && endedAt === null) {
    endedAt = Date.now();
    printResults();
    process.exit(0);
  }
});

processor.on('data_dropped', () => {
  droppedCount++;
});

processor.on('backpressure_start', () => {
  backpressureEvents++;
  console.log(`⚠️  背压触发 #${backpressureEvents}, 缓冲区使用: ${processor.getBufferUsage().toFixed(1)}%`);
});

processor.start();
startedAt = Date.now();

console.log('🚀 开始注入数据...\n');

let itemCount = 0;
const injectInterval = setInterval(() => {
  for (let i = 0; i < CONCURRENT_TAGS; i++) {
    if (itemCount >= TOTAL_ITEMS) {
      clearInterval(injectInterval);
      return;
    }
    
    const plcId = `PLC${String(Math.floor(i / 3) + 1).padStart(3, '0')}`;
    const tags = ['temperature', 'pressure', 'speed'];
    const tagName = tags[i % 3];
    
    processor.write({
      plcId,
      tagName,
      value: Math.random() * 100,
      timestamp: new Date(),
      status: 'good'
    });
    
    itemCount++;
  }
}, INTERVAL_MS);

function printResults() {
  const totalTime = (endedAt - startedAt) / 1000;
  const throughput = processedCount / totalTime;
  const avgBatchSize = processedCount / batchCount;
  const avgBatchTime = totalProcessingTime / batchCount;
  const stats = processor.getStats();
  
  console.log('\n========================================');
  console.log('📊 压力测试结果');
  console.log('========================================');
  console.log(`总处理量: ${processedCount} 条`);
  console.log(`总耗时: ${totalTime.toFixed(2)} 秒`);
  console.log(`吞吐量: ${throughput.toFixed(0)} 条/秒`);
  console.log(`批次数: ${batchCount}`);
  console.log(`平均批大小: ${avgBatchSize.toFixed(1)} 条`);
  console.log(`平均批处理时间: ${avgBatchTime.toFixed(3)}ms`);
  console.log(`最大批处理时间: ${maxBatchTime}ms`);
  console.log('');
  console.log(`缓冲区容量: ${stats.buffer.capacity} 条`);
  console.log(`最大缓冲区使用: ${stats.buffer.usage}`);
  console.log(`数据丢弃数: ${droppedCount} 条`);
  console.log(`过期丢弃数: ${stats.totalStaleDropped} 条`);
  console.log(`背压事件数: ${backpressureEvents}`);
  console.log(`平均处理延迟: ${stats.buffer.averageLatencyMs}ms`);
  console.log(`最大处理延迟: ${stats.buffer.maxLatencyMs}ms`);
  console.log('');
  
  if (droppedCount === 0 && backpressureEvents === 0) {
    console.log('✅ 测试通过: 无数据丢失, 无背压触发');
  } else if (droppedCount === 0) {
    console.log('⚠️  测试通过: 无数据丢失, 但有背压触发');
  } else {
    console.log(`❌ 测试失败: 丢失 ${droppedCount} 条数据`);
  }
  console.log('========================================\n');
}

process.on('SIGINT', () => {
  console.log('\n🛑 测试中断');
  endedAt = Date.now();
  printResults();
  process.exit(0);
});
