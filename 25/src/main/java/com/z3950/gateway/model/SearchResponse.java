package com.z3950.gateway.model;

import lombok.AllArgsConstructor;
import lombok.Builder;
import lombok.Data;
import lombok.NoArgsConstructor;

import java.util.List;

@Data
@Builder
@NoArgsConstructor
@AllArgsConstructor
public class SearchResponse {
    private String query;
    private int totalResults;
    private int uniqueResults;
    private List<String> queriedServers;
    private List<String> successfulServers;
    private List<String> failedServers;
    private long responseTimeMs;
    private List<Book> results;
}
