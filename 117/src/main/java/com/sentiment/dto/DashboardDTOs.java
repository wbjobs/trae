package com.sentiment.dto;

import com.sentiment.model.SocialMediaPost.SentimentType;
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
public class SentimentTrendDTO {
    private Instant timestamp;
    private long totalCount;
    private long positiveCount;
    private long negativeCount;
    private long neutralCount;
    private double positiveRatio;
    private double negativeRatio;
    private double neutralRatio;
}

@Data
@Builder
@NoArgsConstructor
@AllArgsConstructor
public class EntityCountDTO {
    private String name;
    private String type;
    private long count;
}

@Data
@Builder
@NoArgsConstructor
@AllArgsConstructor
public class GeoDistributionDTO {
    private String location;
    private double latitude;
    private double longitude;
    private long count;
    private long positiveCount;
    private long negativeCount;
}

@Data
@Builder
@NoArgsConstructor
@AllArgsConstructor
public class DashboardStatsDTO {
    private long totalPosts;
    private long totalPositive;
    private long totalNegative;
    private long totalNeutral;
    private double positiveRatio;
    private double negativeRatio;
    private double neutralRatio;
    private List<EntityCountDTO> topEntities;
    private List<SentimentTrendDTO> recentTrends;
    private List<GeoDistributionDTO> topLocations;
}
