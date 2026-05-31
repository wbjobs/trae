package com.sentiment.model;

import lombok.AllArgsConstructor;
import lombok.Builder;
import lombok.Data;
import lombok.NoArgsConstructor;

import java.time.Instant;
import java.util.List;
import java.util.Map;

@Data
@Builder
@NoArgsConstructor
@AllArgsConstructor
public class SocialMediaPost {
    private String id;
    private String platform;
    private String author;
    private String content;
    private String location;
    private Double latitude;
    private Double longitude;
    private Instant timestamp;
    private Integer likes;
    private Integer shares;
    private Integer comments;
    private String language;

    private SentimentResult sentiment;
    private List<EntityResult> entities;

    public enum SentimentType {
        POSITIVE, NEGATIVE, NEUTRAL
    }

    @Data
    @Builder
    @NoArgsConstructor
    @AllArgsConstructor
    public static class SentimentResult {
        private SentimentType type;
        private double positiveScore;
        private double negativeScore;
        private double neutralScore;
        private double confidence;
    }

    @Data
    @Builder
    @NoArgsConstructor
    @AllArgsConstructor
    public static class EntityResult {
        private String name;
        private String type;
        private int count;
        private double confidence;
    }

    public Map<String, Object> toMap() {
        return Map.of(
            "id", id,
            "platform", platform != null ? platform : "",
            "author", author != null ? author : "",
            "content", content != null ? content : "",
            "location", location != null ? location : "",
            "latitude", latitude != null ? latitude : 0.0,
            "longitude", longitude != null ? longitude : 0.0,
            "timestamp", timestamp != null ? timestamp.toString() : Instant.now().toString(),
            "likes", likes != null ? likes : 0,
            "shares", shares != null ? shares : 0,
            "comments", comments != null ? comments : 0,
            "language", language != null ? language : "zh",
            "sentiment_type", sentiment != null && sentiment.getType() != null ? sentiment.getType().name() : "NEUTRAL",
            "sentiment_positive", sentiment != null ? sentiment.getPositiveScore() : 0.0,
            "sentiment_negative", sentiment != null ? sentiment.getNegativeScore() : 0.0,
            "sentiment_neutral", sentiment != null ? sentiment.getNeutralScore() : 0.0,
            "sentiment_confidence", sentiment != null ? sentiment.getConfidence() : 0.0
        );
    }
}
