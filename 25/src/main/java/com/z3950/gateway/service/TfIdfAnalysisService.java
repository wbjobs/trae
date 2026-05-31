package com.z3950.gateway.service;

import com.z3950.gateway.config.CacheConfig;
import com.z3950.gateway.model.QueryLog;
import lombok.AllArgsConstructor;
import lombok.Data;
import lombok.extern.slf4j.Slf4j;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.stereotype.Service;

import java.util.*;
import java.util.stream.Collectors;

@Slf4j
@Service
public class TfIdfAnalysisService {
    private final QueryLogService queryLogService;
    private final CacheConfig cacheConfig;

    @Autowired
    public TfIdfAnalysisService(QueryLogService queryLogService, CacheConfig cacheConfig) {
        this.queryLogService = queryLogService;
        this.cacheConfig = cacheConfig;
    }

    @Data
    @AllArgsConstructor
    public static class TermScore implements Comparable<TermScore> {
        private String term;
        private double score;
        private int frequency;

        @Override
        public int compareTo(TermScore other) {
            return Double.compare(other.score, this.score);
        }
    }

    public List<TermScore> analyzeTopQueries() {
        int analysisDays = cacheConfig.getPrefetch().getAnalysisDays();
        int minFrequency = cacheConfig.getPrefetch().getMinQueryFrequency();
        int topN = cacheConfig.getPrefetch().getTopNQueries();

        log.info("Starting TF-IDF analysis for {} days, min frequency: {}, top N: {}",
            analysisDays, minFrequency, topN);

        List<QueryLog> logs = queryLogService.getRecentQueries(analysisDays);
        if (logs.isEmpty()) {
            log.info("No query logs found for analysis");
            return new ArrayList<>();
        }

        Map<String, Integer> termFrequency = new HashMap<>();
        Map<String, Set<String>> termDocuments = new HashMap<>();

        int documentCount = 0;
        for (QueryLog log : logs) {
            String normalizedQuery = log.getNormalizedQuery();
            if (normalizedQuery == null || normalizedQuery.isEmpty()) continue;

            documentCount++;
            Set<String> terms = extractTerms(normalizedQuery);

            for (String term : terms) {
                if (term.length() < 2) continue;
                termFrequency.merge(term, 1, Integer::sum);
                termDocuments.computeIfAbsent(term, k -> new HashSet<>()).add(normalizedQuery);
            }
        }

        if (documentCount == 0) {
            return new ArrayList<>();
        }

        List<TermScore> scores = new ArrayList<>();
        for (Map.Entry<String, Integer> entry : termFrequency.entrySet()) {
            String term = entry.getKey();
            int tf = entry.getValue();

            if (tf < minFrequency) continue;

            int docFreq = termDocuments.getOrDefault(term, Collections.emptySet()).size();
            double idf = Math.log((double) documentCount / (docFreq + 1)) + 1;
            double tfIdf = tf * idf;

            double boostedScore = tfIdf * calculateRecencyBoost(term, logs);

            scores.add(new TermScore(term, boostedScore, tf));
        }

        Collections.sort(scores);

        List<TermScore> topScores = scores.stream()
            .limit(topN)
            .collect(Collectors.toList());

        log.info("TF-IDF analysis completed. Found {} candidate terms, selected top {}",
            scores.size(), topScores.size());

        for (TermScore score : topScores) {
            log.debug("Term: '{}', score: {:.2f}, frequency: {}",
                score.getTerm(), score.getScore(), score.getFrequency());
        }

        return topScores;
    }

    private Set<String> extractTerms(String query) {
        Set<String> terms = new HashSet<>();

        terms.add(query);

        String[] words = query.split("\\s+");
        terms.addAll(Arrays.asList(words));

        if (words.length > 2) {
            for (int i = 0; i < words.length - 1; i++) {
                terms.add(words[i] + " " + words[i + 1]);
            }
        }

        return terms;
    }

    private double calculateRecencyBoost(String term, List<QueryLog> logs) {
        long now = System.currentTimeMillis();
        long recentCount = 0;
        long totalCount = 0;

        long oneDayMs = 24 * 60 * 60 * 1000L;

        for (QueryLog log : logs) {
            if (log.getNormalizedQuery() != null &&
                (log.getNormalizedQuery().equals(term) || log.getNormalizedQuery().contains(term))) {
                totalCount++;
                if (log.getQueryTime() != null) {
                    long ageMs = now - java.sql.Timestamp.valueOf(log.getQueryTime()).getTime();
                    if (ageMs < oneDayMs) {
                        recentCount++;
                    }
                }
            }
        }

        if (totalCount == 0) return 1.0;

        double recencyRatio = (double) recentCount / totalCount;
        return 1.0 + recencyRatio * 2.0;
    }

    public List<String> getPrefetchKeywords() {
        return analyzeTopQueries().stream()
            .map(TermScore::getTerm)
            .collect(Collectors.toList());
    }
}
