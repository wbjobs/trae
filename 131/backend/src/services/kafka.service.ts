import { Kafka, Producer, Consumer, Admin } from 'kafkajs';
import { config } from '../config';
import { logger } from '../utils/logger';

class KafkaService {
  private kafka: Kafka | null = null;
  private producer: Producer | null = null;
  private consumer: Consumer | null = null;
  private admin: Admin | null = null;
  private initialized = false;

  async init(): Promise<void> {
    if (!config.kafka.enabled || this.initialized) {
      return;
    }

    try {
      this.kafka = new Kafka({
        clientId: config.kafka.clientId,
        brokers: config.kafka.brokers,
      });

      // 创建 admin 客户端用于管理
      this.admin = this.kafka.admin();

      // 确保 topic 存在
      await this.ensureTopic(config.kafka.topic);

      // 创建生产者
      this.producer = this.kafka.producer({
        allowAutoTopicCreation: true,
      });
      await this.producer.connect();
      logger.info('Kafka producer connected');

      // 创建消费者（可选，用于消费采样数据进行分析）
      this.consumer = this.kafka.consumer({
        groupId: config.kafka.groupId,
      });
      await this.consumer.connect();
      logger.info('Kafka consumer connected');

      this.initialized = true;
      logger.info(`Kafka service initialized with topic: ${config.kafka.topic}`);
    } catch (error) {
      logger.error('Failed to initialize Kafka service:', error);
    }
  }

  async ensureTopic(topic: string): Promise<void> {
    if (!this.admin) return;

    try {
      const topics = await this.admin.listTopics();
      if (!topics.includes(topic)) {
        await this.admin.createTopics({
          topics: [
            {
              topic,
              numPartitions: 3,
              replicationFactor: 1,
              config: {
                'retention.ms': '604800000', // 7天
                'segment.ms': '86400000', // 1天
                'cleanup.policy': 'delete',
              },
            },
          ],
        });
        logger.info(`Created Kafka topic: ${topic}`);
      }
    } catch (error) {
      logger.warn('Failed to ensure Kafka topic:', error);
    }
  }

  async sendSample(data: Record<string, unknown>): Promise<boolean> {
    if (!this.producer || !config.kafka.enabled) {
      return false;
    }

    try {
      const message = {
        key: data.request_id as string || data.user_id as string || Date.now().toString(),
        value: JSON.stringify(data),
        timestamp: Date.now().toString(),
      };

      await this.producer.send({
        topic: config.kafka.topic,
        messages: [message],
      });

      logger.debug(`Sample sent to Kafka, topic: ${config.kafka.topic}`);
      return true;
    } catch (error) {
      logger.error('Failed to send sample to Kafka:', error);
      return false;
    }
  }

  async sendBatchSamples(samples: Array<Record<string, unknown>>): Promise<boolean> {
    if (!this.producer || !config.kafka.enabled || samples.length === 0) {
      return false;
    }

    try {
      const messages = samples.map((data) => ({
        key: data.request_id as string || data.user_id as string || Date.now().toString(),
        value: JSON.stringify(data),
        timestamp: Date.now().toString(),
      }));

      await this.producer.send({
        topic: config.kafka.topic,
        messages,
      });

      logger.debug(`Batch samples sent to Kafka: ${samples.length} messages`);
      return true;
    } catch (error) {
      logger.error('Failed to send batch samples to Kafka:', error);
      return false;
    }
  }

  async consumeSamples(
    onMessage: (message: Record<string, unknown>) => void
  ): Promise<void> {
    if (!this.consumer || !config.kafka.enabled) {
      return;
    }

    try {
      await this.consumer.subscribe({
        topic: config.kafka.topic,
        fromBeginning: false,
      });

      await this.consumer.run({
        eachMessage: async ({ topic, partition, message }) => {
          try {
            const data = JSON.parse(message.value?.toString() || '{}');
            onMessage(data);
          } catch (error) {
            logger.error('Failed to parse Kafka message:', error);
          }
        },
      });

      logger.info('Kafka consumer started');
    } catch (error) {
      logger.error('Failed to start Kafka consumer:', error);
    }
  }

  async getStats(): Promise<Record<string, unknown>> {
    if (!this.admin || !config.kafka.enabled) {
      return { enabled: false };
    }

    try {
      const topics = await this.admin.listTopics();
      const topicMetadata = await this.admin.fetchTopicMetadata({
        topics: [config.kafka.topic],
      });

      return {
        enabled: true,
        topics,
        topicInfo: topicMetadata.topics[0] || null,
      };
    } catch (error) {
      logger.error('Failed to get Kafka stats:', error);
      return {
        enabled: true,
        error: 'Failed to fetch stats',
      };
    }
  }

  async disconnect(): Promise<void> {
    try {
      if (this.producer) {
        await this.producer.disconnect();
        logger.info('Kafka producer disconnected');
      }
      if (this.consumer) {
        await this.consumer.disconnect();
        logger.info('Kafka consumer disconnected');
      }
      if (this.admin) {
        await this.admin.disconnect();
        logger.info('Kafka admin disconnected');
      }
      this.initialized = false;
    } catch (error) {
      logger.error('Failed to disconnect Kafka:', error);
    }
  }
}

export const kafkaService = new KafkaService();
export default kafkaService;
