require('dotenv').config();
const { Kafka } = require('kafkajs');

const kafka = new Kafka({
  brokers: process.env.KAFKA_BROKERS ? process.env.KAFKA_BROKERS.split(',') : ['localhost:9092'],
  clientId: 'trading-producer'
});

const producer = kafka.producer({
  allowAutoTopicCreation: true,
  transactionTimeout: 30000
});

const topic = process.env.KAFKA_TOPIC || 'trading-transactions';
const targetRate = parseInt(process.env.PRODUCER_RATE) || 1000;
const batchSize = 50;
const sendInterval = (1000 * batchSize) / targetRate;

const merchants = [
  'Alibaba', 'Tencent', 'Baidu', 'JD.com', 'Meituan',
  'Pinduoduo', 'NetEase', 'Xiaomi', 'Huawei', 'ByteDance',
  'Taobao', 'Tmall', 'JD Mall', 'Suning', 'Gome',
  'Starbucks', 'McDonalds', 'KFC', 'PizzaHut', 'Nike'
];

const regions = [
  'Beijing', 'Shanghai', 'Guangzhou', 'Shenzhen', 'Hangzhou',
  'Chengdu', 'Wuhan', 'Xi\'an', 'Nanjing', 'Chongqing',
  'Tianjin', 'Suzhou', 'Zhengzhou', 'Changsha', 'Qingdao'
];

const deviceTypes = [
  'iOS', 'Android', 'Windows', 'MacOS', 'Web'
];

const anomalyPatterns = [
  { region: 'Beijing', device: 'iOS', weight: 0.3 },
  { region: 'Shanghai', device: 'Android', weight: 0.25 },
  { region: 'Shenzhen', device: 'Web', weight: 0.2 },
  { region: 'Guangzhou', device: 'Windows', weight: 0.15 }
];

function weightedRandom(items) {
  const total = items.reduce((sum, item) => sum + item.weight, 0);
  let random = Math.random() * total;
  for (const item of items) {
    random -= item.weight;
    if (random <= 0) return item;
  }
  return items[items.length - 1];
}

function generateTransaction(baseAmount = 500, anomalyChance = 0.02) {
  const isAnomaly = Math.random() < anomalyChance;
  let amount;
  let region;
  let deviceType;

  if (isAnomaly) {
    if (Math.random() < 0.5) {
      amount = baseAmount * (5 + Math.random() * 10);
    } else {
      amount = baseAmount * (0.01 + Math.random() * 0.1);
    }

    const pattern = weightedRandom(anomalyPatterns);
    region = pattern.region;
    deviceType = pattern.device;
  } else {
    const variation = (Math.random() - 0.5) * 0.6;
    amount = baseAmount * (1 + variation);
    region = regions[Math.floor(Math.random() * regions.length)];
    deviceType = deviceTypes[Math.floor(Math.random() * deviceTypes.length)];
  }

  return {
    transactionId: `tx_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`,
    userId: `user_${Math.floor(Math.random() * 10000)}`,
    merchant: merchants[Math.floor(Math.random() * merchants.length)],
    amount: Math.round(amount * 100) / 100,
    timestamp: Date.now(),
    region: region,
    deviceType: deviceType,
    isAnomaly
  };
}

async function sendBatch(count) {
  const messages = [];
  for (let i = 0; i < count; i++) {
    const tx = generateTransaction();
    messages.push({
      value: JSON.stringify(tx)
    });
  }

  try {
    await producer.send({
      topic,
      messages
    });
    return messages.length;
  } catch (error) {
    console.error('发送消息失败:', error.message);
    return 0;
  }
}

async function main() {
  console.log('='.repeat(60));
  console.log('📤 Kafka 交易数据生成器启动中...');
  console.log('='.repeat(60));
  console.log(`目标速率: ${targetRate} 条/秒`);
  console.log(`批大小: ${batchSize} 条`);
  console.log(`发送间隔: ${sendInterval.toFixed(2)} 毫秒`);
  console.log(`主题: ${topic}`);
  console.log('='.repeat(60));

  try {
    await producer.connect();
    console.log('✅ Kafka 生产者已连接\n');

    let totalSent = 0;
    let lastReport = Date.now();
    let sentInLastSecond = 0;
    let anomalyCount = 0;

    const intervalId = setInterval(async () => {
      const count = await sendBatch(batchSize);
      totalSent += count;
      sentInLastSecond += count;

      const now = Date.now();
      if (now - lastReport >= 1000) {
        const elapsed = (now - lastReport) / 1000;
        const actualRate = Math.round(sentInLastSecond / elapsed);
        console.log(`[${new Date().toLocaleTimeString()}] ` +
          `已发送: ${totalSent.toLocaleString()} | ` +
          `速率: ${actualRate} tx/s | ` +
          `目标: ${targetRate} tx/s`);

        sentInLastSecond = 0;
        lastReport = now;
      }
    }, sendInterval);

    process.on('SIGINT', async () => {
      console.log('\n\n📤 正在关闭生产者...');
      clearInterval(intervalId);
      await producer.disconnect();
      console.log(`✅ 生成器已停止，总计发送: ${totalSent.toLocaleString()} 条消息`);
      process.exit(0);
    });

    process.on('SIGTERM', async () => {
      console.log('\n\n📤 正在关闭生产者...');
      clearInterval(intervalId);
      await producer.disconnect();
      console.log(`✅ 生成器已停止，总计发送: ${totalSent.toLocaleString()} 条消息`);
      process.exit(0);
    });

  } catch (error) {
    console.error('❌ 生产者启动失败:', error.message);
    process.exit(1);
  }
}

main();
