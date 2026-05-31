from kafka.admin import KafkaAdminClient, NewTopic
from kafka.errors import TopicAlreadyExistsError
from config import (
    KAFKA_BOOTSTRAP_SERVERS,
    KAFKA_TICK_TOPIC,
    KAFKA_ANOMALY_TOPIC,
    KAFKA_TICK_PARTITIONS,
)


def create_topics():
    admin_client = KafkaAdminClient(
        bootstrap_servers=KAFKA_BOOTSTRAP_SERVERS,
        client_id="stock-monitor-admin"
    )

    topics = [
        NewTopic(
            name=KAFKA_TICK_TOPIC,
            num_partitions=KAFKA_TICK_PARTITIONS,
            replication_factor=1,
            topic_configs={
                "retention.ms": "300000",
                "segment.bytes": "1073741824",
            }
        ),
        NewTopic(
            name=KAFKA_ANOMALY_TOPIC,
            num_partitions=2,
            replication_factor=1,
            topic_configs={
                "retention.ms": "600000",
            }
        ),
    ]

    for topic in topics:
        try:
            admin_client.create_topics(new_topics=[topic], validate_only=False)
            print(f"✅ 主题创建成功: {topic.name} (分区: {topic.num_partitions})")
        except TopicAlreadyExistsError:
            print(f"ℹ️  主题已存在: {topic.name}")

            try:
                current_topics = admin_client.describe_topics([topic.name])
                current_partitions = len(current_topics[0]['partitions'])
                if current_partitions < topic.num_partitions:
                    print(f"   增加分区: {current_partitions} -> {topic.num_partitions}")
                    admin_client.create_partitions({
                        topic.name: NewTopic(topic.name, topic.num_partitions, 1)
                    })
            except Exception as e:
                print(f"   检查分区失败: {e}")

    admin_client.close()
    print("\n所有主题配置完成！")


if __name__ == "__main__":
    create_topics()
