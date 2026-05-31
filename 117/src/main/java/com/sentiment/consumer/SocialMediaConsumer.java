package com.sentiment.consumer;

import com.fasterxml.jackson.databind.ObjectMapper;
import com.fasterxml.jackson.datatype.jsr310.JavaTimeModule;
import com.sentiment.model.SocialMediaPost;
import com.sentiment.service.EntityExtractionService;
import com.sentiment.service.SentimentAnalysisService;
import com.sentiment.service.DruidIngestionService;
import lombok.extern.slf4j.Slf4j;
import org.springframework.beans.factory.annotation.Value;
import org.springframework.kafka.annotation.KafkaListener;
import org.springframework.kafka.support.Acknowledgment;
import org.springframework.kafka.support.KafkaHeaders;
import org.springframework.messaging.handler.annotation.Header;
import org.springframework.messaging.handler.annotation.Payload;
import org.springframework.stereotype.Component;

import java.util.ArrayList;
import java.util.List;
import java.util.concurrent.atomic.AtomicLong;

@Slf4j
@Component
public class SocialMediaConsumer {

    private final ObjectMapper objectMapper;
    private final SentimentAnalysisService sentimentService;
    private final EntityExtractionService entityService;
    private final DruidIngestionService druidService;
    private final AtomicLong processedCount = new AtomicLong(0);

    @Value("${app.kafka.topic.processed}")
    private String processedTopic;

    public SocialMediaConsumer(SentimentAnalysisService sentimentService,
                               EntityExtractionService entityService,
                               DruidIngestionService druidService) {
        this.sentimentService = sentimentService;
        this.entityService = entityService;
        this.druidService = druidService;
        this.objectMapper = new ObjectMapper();
        this.objectMapper.registerModule(new JavaTimeModule());
    }

    @KafkaListener(topics = "${app.kafka.topic.raw}", groupId = "sentiment-consumer-group",
            containerFactory = "kafkaListenerContainerFactory")
    public void consumeRawMessages(@Payload List<String> messages,
                                   @Header(KafkaHeaders.RECEIVED_TOPIC) String topic,
                                   Acknowledgment acknowledgment) {
        try {
            List<SocialMediaPost> processedPosts = new ArrayList<>();

            for (String message : messages) {
                try {
                    SocialMediaPost post = objectMapper.readValue(message, SocialMediaPost.class);
                    processPost(post);
                    processedPosts.add(post);
                } catch (Exception e) {
                    log.warn("Error processing message: {}", e.getMessage());
                }
            }

            if (!processedPosts.isEmpty()) {
                druidService.ingestBatch(processedPosts);
                long count = processedCount.addAndGet(processedPosts.size());
                if (count % 1000 == 0) {
                    log.info("Processed {} posts so far", count);
                }
            }

            acknowledgment.acknowledge();
        } catch (Exception e) {
            log.error("Error processing batch", e);
        }
    }

    private void processPost(SocialMediaPost post) {
        post.setSentiment(sentimentService.analyze(post.getContent()));
        post.setEntities(entityService.extract(post.getContent()));
    }

    public long getProcessedCount() {
        return processedCount.get();
    }
}
