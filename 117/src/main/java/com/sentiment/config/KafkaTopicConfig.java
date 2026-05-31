package com.sentiment.config;

import org.apache.kafka.clients.admin.NewTopic;
import org.springframework.beans.factory.annotation.Value;
import org.springframework.context.annotation.Bean;
import org.springframework.context.annotation.Configuration;
import org.springframework.kafka.config.TopicBuilder;

@Configuration
public class KafkaTopicConfig {

    @Value("${app.kafka.topic.raw}")
    private String rawTopic;

    @Value("${app.kafka.topic.processed}")
    private String processedTopic;

    @Bean
    public NewTopic rawTopic() {
        return TopicBuilder.name(rawTopic)
                .partitions(6)
                .replicas(1)
                .config("retention.ms", "86400000")
                .config("segment.bytes", "1073741824")
                .build();
    }

    @Bean
    public NewTopic processedTopic() {
        return TopicBuilder.name(processedTopic)
                .partitions(6)
                .replicas(1)
                .config("retention.ms", "86400000")
                .config("segment.bytes", "1073741824")
                .build();
    }
}
