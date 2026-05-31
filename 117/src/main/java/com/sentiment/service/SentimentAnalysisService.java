package com.sentiment.service;

import com.sentiment.model.SocialMediaPost;
import com.sentiment.model.SocialMediaPost.SentimentResult;
import com.sentiment.model.SocialMediaPost.SentimentType;
import jakarta.annotation.PostConstruct;
import lombok.extern.slf4j.Slf4j;
import org.springframework.stereotype.Service;

import java.io.BufferedReader;
import java.io.InputStream;
import java.io.InputStreamReader;
import java.nio.charset.StandardCharsets;
import java.util.*;
import java.util.stream.Collectors;

@Slf4j
@Service
public class SentimentAnalysisService {

    private Map<String, Double> positiveWords = new HashMap<>();
    private Map<String, Double> negativeWords = new HashMap<>();
    private Set<String> degreeWords = new HashSet<>();
    private Set<String> negationWords = new HashSet<>();

    @PostConstruct
    public void init() {
        loadBuiltInDictionaries();
        log.info("Sentiment analysis service initialized with {} positive words and {} negative words",
                positiveWords.size(), negativeWords.size());
    }

    private void loadBuiltInDictionaries() {
        positiveWords.put("太棒了", 2.0);
        positiveWords.put("真厉害", 2.0);
        positiveWords.put("非常棒", 2.0);
        positiveWords.put("喜欢", 1.5);
        positiveWords.put("推荐", 1.5);
        positiveWords.put("好用", 1.5);
        positiveWords.put("完美", 2.5);
        positiveWords.put("超赞", 2.5);
        positiveWords.put("优秀", 2.0);
        positiveWords.put("满意", 1.5);
        positiveWords.put("惊喜", 2.0);
        positiveWords.put("精彩", 2.0);
        positiveWords.put("出色", 2.0);
        positiveWords.put("值得", 1.5);
        positiveWords.put("一流", 2.0);
        positiveWords.put("创新", 2.0);
        positiveWords.put("amazing", 2.5);
        positiveWords.put("great", 2.0);
        positiveWords.put("excellent", 2.0);
        positiveWords.put("love", 2.5);
        positiveWords.put("best", 2.0);
        positiveWords.put("perfect", 2.5);
        positiveWords.put("awesome", 2.5);
        positiveWords.put("good", 1.5);
        positiveWords.put("nice", 1.5);
        positiveWords.put("wonderful", 2.5);
        positiveWords.put("fantastic", 2.5);
        positiveWords.put("beautiful", 2.0);
        positiveWords.put("happy", 2.0);
        positiveWords.put("开心", 2.0);
        positiveWords.put("高兴", 2.0);
        positiveWords.put("满意", 1.5);
        positiveWords.put("愉快", 2.0);
        positiveWords.put("享受", 2.0);
        positiveWords.put("爱", 2.5);

        negativeWords.put("太差了", -2.0);
        negativeWords.put("糟糕", -2.0);
        negativeWords.put("失望", -2.0);
        negativeWords.put("骗人", -2.5);
        negativeWords.put("垃圾", -2.5);
        negativeWords.put("愤怒", -2.5);
        negativeWords.put("无语", -1.5);
        negativeWords.put("后悔", -2.0);
        negativeWords.put("差评", -2.0);
        negativeWords.put("质量差", -2.0);
        negativeWords.put("服务差", -2.0);
        negativeWords.put("骗钱", -2.5);
        negativeWords.put("虚假", -2.0);
        negativeWords.put("恶心", -2.5);
        negativeWords.put("讨厌", -2.0);
        negativeWords.put("失败", -2.0);
        negativeWords.put("terrible", -2.5);
        negativeWords.put("bad", -1.5);
        negativeWords.put("awful", -2.5);
        negativeWords.put("hate", -2.5);
        negativeWords.put("worst", -2.5);
        negativeWords.put("disappointing", -2.0);
        negativeWords.put("poor", -1.5);
        negativeWords.put("slow", -1.5);
        negativeWords.put("bug", -1.5);
        negativeWords.put("crash", -2.0);
        negativeWords.put("不好", -1.5);
        negativeWords.put("差", -1.5);
        negativeWords.put("烂", -2.0);
        negativeWords.put("失望", -2.0);
        negativeWords.put("不满意", -2.0);
        negativeWords.put("生气", -2.0);
        negativeWords.put("烦", -1.5);
        negativeWords.put("讨厌", -2.0);

        negationWords.add("不");
        negationWords.add("没");
        negationWords.add("无");
        negationWords.add("非");
        negationWords.add("别");
        negationWords.add("莫");
        negationWords.add("not");
        negationWords.add("no");
        negationWords.add("never");
        negationWords.add("don't");
        negationWords.add("doesn't");
        negationWords.add("didn't");
        negationWords.add("won't");

        degreeWords.add("非常");
        degreeWords.add("很");
        degreeWords.add("特别");
        degreeWords.add("十分");
        degreeWords.add("相当");
        degreeWords.add("极");
        degreeWords.add("极其");
        degreeWords.add("非常");
        degreeWords.add("真的");
        degreeWords.add("确实");
        degreeWords.add("really");
        degreeWords.add("very");
        degreeWords.add("extremely");
        degreeWords.add("absolutely");
        degreeWords.add("totally");
    }

    public SentimentResult analyze(String text) {
        if (text == null || text.isEmpty()) {
            return SentimentResult.builder()
                    .type(SentimentType.NEUTRAL)
                    .positiveScore(0.33)
                    .negativeScore(0.33)
                    .neutralScore(0.34)
                    .confidence(0.5)
                    .build();
        }

        double positiveScore = 0.0;
        double negativeScore = 0.0;
        String lowerText = text.toLowerCase();

        for (Map.Entry<String, Double> entry : positiveWords.entrySet()) {
            String word = entry.getKey().toLowerCase();
            if (lowerText.contains(word)) {
                double score = entry.getValue();
                if (hasNegationBefore(text, word)) {
                    score = -score;
                    negativeScore += Math.abs(score);
                } else {
                    positiveScore += score;
                }
            }
        }

        for (Map.Entry<String, Double> entry : negativeWords.entrySet()) {
            String word = entry.getKey().toLowerCase();
            if (lowerText.contains(word)) {
                double score = entry.getValue();
                if (hasNegationBefore(text, word)) {
                    score = -score;
                    positiveScore += Math.abs(score);
                } else {
                    negativeScore += Math.abs(score);
                }
            }
        }

        double totalScore = positiveScore + negativeScore;
        double normalizedPositive, normalizedNegative, normalizedNeutral;

        if (totalScore == 0) {
            normalizedPositive = 0.33;
            normalizedNegative = 0.33;
            normalizedNeutral = 0.34;
        } else {
            normalizedPositive = positiveScore / totalScore * 0.8 + 0.1;
            normalizedNegative = negativeScore / totalScore * 0.8 + 0.1;
            normalizedNeutral = Math.max(0, 1.0 - normalizedPositive - normalizedNegative);
        }

        double sum = normalizedPositive + normalizedNegative + normalizedNeutral;
        normalizedPositive /= sum;
        normalizedNegative /= sum;
        normalizedNeutral /= sum;

        SentimentType sentimentType;
        double confidence;

        if (normalizedPositive > normalizedNegative && normalizedPositive > normalizedNeutral) {
            sentimentType = SentimentType.POSITIVE;
            confidence = normalizedPositive;
        } else if (normalizedNegative > normalizedPositive && normalizedNegative > normalizedNeutral) {
            sentimentType = SentimentType.NEGATIVE;
            confidence = normalizedNegative;
        } else {
            sentimentType = SentimentType.NEUTRAL;
            confidence = normalizedNeutral;
        }

        return SentimentResult.builder()
                .type(sentimentType)
                .positiveScore(Math.round(normalizedPositive * 1000.0) / 1000.0)
                .negativeScore(Math.round(normalizedNegative * 1000.0) / 1000.0)
                .neutralScore(Math.round(normalizedNeutral * 1000.0) / 1000.0)
                .confidence(Math.round(confidence * 1000.0) / 1000.0)
                .build();
    }

    private boolean hasNegationBefore(String text, String word) {
        int wordIndex = text.toLowerCase().indexOf(word.toLowerCase());
        if (wordIndex <= 0) return false;
        String before = text.substring(Math.max(0, wordIndex - 5), wordIndex);
        for (String neg : negationWords) {
            if (before.contains(neg)) {
                return true;
            }
        }
        return false;
    }

    public List<SentimentResult> analyzeBatch(List<String> texts) {
        return texts.stream()
                .map(this::analyze)
                .collect(Collectors.toList());
    }
}
