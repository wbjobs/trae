package com.z3950.gateway.model;

import lombok.AllArgsConstructor;
import lombok.Builder;
import lombok.Data;
import lombok.NoArgsConstructor;

import java.io.Serializable;
import java.time.LocalDateTime;

@Data
@Builder
@NoArgsConstructor
@AllArgsConstructor
public class QueryLog implements Serializable {
    private String query;
    private String normalizedQuery;
    private LocalDateTime queryTime;
    private int resultCount;
    private long responseTimeMs;
    private String clientIp;
}
