const { Kafka } = require('kafkajs');

class KafkaConsumer {
  constructor(config) {
    this.kafka = new Kafka({
      brokers: config.brokers,
      clientId: 'trading-dashboard-client'
    });
    this.consumer = this.kafka.consumer({
      groupId: config.groupId,
      sessionTimeout: 30000,
      heartbeatInterval: 3000,
      maxBytesPerPartition: 10485760,
      minBytes: 1,
      maxWaitTimeInMs: 500
    });
    this.topic = config.topic;
    this.fromBeginning = config.fromBeginning || false;
    this.messageHandler = null;
    this.isRunning = false;
  }

  setMessageHandler(handler) {
    this.messageHandler = handler;
  }

  async connect() {
    try {
      await this.consumer.connect();
      console.log('[Kafka] Consumer connected successfully');
    } catch (error) {
      console.error('[Kafka] Connection error:', error.message);
      throw error;
    }
  }

  async subscribe() {
    try {
      await this.consumer.subscribe({
        topic: this.topic,
        fromBeginning: this.fromBeginning
      });
      console.log(`[Kafka] Subscribed to topic: ${this.topic}`);
    } catch (error) {
      console.error('[Kafka] Subscription error:', error.message);
      throw error;
    }
  }

  async start() {
    if (this.isRunning) return;
    this.isRunning = true;

    try {
      await this.consumer.run({
        eachBatch: async ({ batch, resolveOffset, heartbeat, isRunning, isStale }) => {
          if (!isRunning() || isStale()) return;

          const messages = batch.messages.map(msg => {
            try {
              return JSON.parse(msg.value.toString());
            } catch (e) {
              console.warn('[Kafka] Failed to parse message:', msg.value.toString());
              return null;
            }
          }).filter(Boolean);

          if (messages.length > 0 && this.messageHandler) {
            await this.messageHandler(messages);
          }

          for (const message of batch.messages) {
            if (!isRunning() || isStale()) break;
            await resolveOffset(message.offset);
          }
          await heartbeat();
        }
      });
      console.log('[Kafka] Consumer started');
    } catch (error) {
      console.error('[Kafka] Consumer run error:', error.message);
      this.isRunning = false;
      throw error;
    }
  }

  async disconnect() {
    this.isRunning = false;
    try {
      await this.consumer.disconnect();
      console.log('[Kafka] Consumer disconnected');
    } catch (error) {
      console.error('[Kafka] Disconnect error:', error.message);
    }
  }
}

module.exports = KafkaConsumer;
