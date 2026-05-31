package com.sentiment.producer;

import com.fasterxml.jackson.databind.ObjectMapper;
import com.fasterxml.jackson.datatype.jsr310.JavaTimeModule;
import com.sentiment.model.SocialMediaPost;
import lombok.extern.slf4j.Slf4j;
import org.springframework.beans.factory.annotation.Value;
import org.springframework.kafka.core.KafkaTemplate;
import org.springframework.scheduling.annotation.Scheduled;
import org.springframework.stereotype.Component;

import jakarta.annotation.PostConstruct;
import java.time.Instant;
import java.util.*;
import java.util.concurrent.Executors;
import java.util.concurrent.ScheduledExecutorService;
import java.util.concurrent.TimeUnit;
import java.util.concurrent.atomic.AtomicLong;

@Slf4j
@Component
public class SocialMediaProducer {

    private final KafkaTemplate<String, String> kafkaTemplate;
    private final ObjectMapper objectMapper;
    private final AtomicLong postCounter = new AtomicLong(0);
    private final Random random = new Random();
    private ScheduledExecutorService scheduler;

    @Value("${app.kafka.topic.raw}")
    private String rawTopic;

    @Value("${app.sentiment.producer.rate-per-second:5000}")
    private int ratePerSecond;

    @Value("${app.sentiment.producer.enabled:true}")
    private boolean producerEnabled;

    private static final String[] PLATFORMS = {"微博", "Twitter", "抖音", "小红书", "Facebook", "Instagram"};
    private static final String[] AUTHORS = {"张三", "李四", "王五", "赵六", "钱七", "孙八", "周九", "吴十",
            "科技爱好者", "美食博主", "旅游达人", "时尚评论", "财经观察", "体育迷", "音乐人", "电影爱好者"};

    private static final String[] POSITIVE_WORDS = {
            "太棒了", "真厉害", "非常棒", "喜欢", "推荐", "好用", "完美", "超赞",
            "优秀", "满意", "惊喜", "精彩", "出色", "值得", "一流", "创新",
            "amazing", "great", "excellent", "love", "best", "perfect", "awesome"
    };

    private static final String[] NEGATIVE_WORDS = {
            "太差了", "糟糕", "失望", "骗人", "垃圾", "愤怒", "无语", "后悔",
            "差评", "质量差", "服务差", "骗钱", "虚假", "恶心", "讨厌", "失败",
            "terrible", "bad", "awful", "hate", "worst", "disappointing", "poor"
    };

    private static final String[] NEUTRAL_WORDS = {
            "一般", "还行", "普通", "一般般", "可以", "正常", "标准", "常规",
            "okay", "fine", "normal", "average", "standard", "regular"
    };

    private static final String[] PERSON_NAMES = {
            "马云", "马化腾", "雷军", "任正非", "王兴", "张一鸣", "李彦宏", "刘强东",
            "马斯克", "乔布斯", "贝佐斯", "比尔盖茨", "扎克伯格", "库克", "黄仁勋"
    };

    private static final String[] BRANDS = {
            "华为", "小米", "苹果", "三星", "OPPO", "vivo", "一加", "荣耀",
            "比亚迪", "特斯拉", "蔚来", "小鹏", "理想", "奔驰", "宝马", "奥迪",
            "iPhone", "MacBook", "Tesla", "Google", "Microsoft", "Amazon", "Meta", "Netflix"
    };

    private static final String[] LOCATIONS = {
            "北京", "上海", "广州", "深圳", "杭州", "成都", "武汉", "西安",
            "南京", "重庆", "苏州", "天津", "长沙", "厦门", "青岛", "大连",
            "香港", "台北", "新加坡", "东京", "首尔", "纽约", "伦敦", "巴黎"
    };

    private static final double[][] LOCATION_COORDS = {
            {39.9042, 116.4074}, {31.2304, 121.4737}, {23.1291, 113.2644}, {22.5431, 114.0579},
            {30.2741, 120.1551}, {30.5728, 104.0668}, {30.5928, 114.3055}, {34.3416, 108.9398},
            {32.0603, 118.7969}, {29.5630, 106.5516}, {31.2989, 120.5853}, {39.3434, 117.3616},
            {28.2282, 112.9388}, {24.4798, 118.0819}, {36.0671, 120.3826}, {38.9140, 121.6147},
            {22.3193, 114.1694}, {25.0330, 121.5654}, {1.3521, 103.8198}, {35.6762, 139.6503},
            {37.5665, 126.9780}, {40.7128, -74.0060}, {51.5074, -0.1278}, {48.8566, 2.3522}
    };

    private static final String[] CONTENT_TEMPLATES = {
            "我今天用了{brand}的产品，感觉{adj}！{person}真的{adj}",
            "刚从{location}回来，那里真的{adj}，{brand}在这里很受欢迎",
            "{brand}发布会刚刚结束，{person}的演讲{adj}",
            "我的新{brand}手机到货了，使用体验{adj}",
            "在{location}看到了{person}，太激动了，心情{adj}",
            "{brand}的服务{adj}，{person}推荐的果然没错",
            "今天在{location}参加了{brand}的活动，{adj}",
            "{person}说{brand}的产品{adj}，我觉得也是",
            "刚买了{brand}的{product}，{adj}，值得推荐",
            "{location}的{brand}旗舰店开业了，现场{adj}"
    };

    private static final String[] PRODUCTS = {
            "手机", "电脑", "耳机", "手表", "汽车", "家电", "相机", "平板",
            "笔记本", "充电器", "配件", "服务", "应用", "软件", "游戏"
    };

    public SocialMediaProducer(KafkaTemplate<String, String> kafkaTemplate) {
        this.kafkaTemplate = kafkaTemplate;
        this.objectMapper = new ObjectMapper();
        this.objectMapper.registerModule(new JavaTimeModule());
    }

    @PostConstruct
    public void init() {
        if (producerEnabled) {
            log.info("Starting social media producer at rate: {} posts/second", ratePerSecond);
            scheduler = Executors.newScheduledThreadPool(4);
            startProducing();
        } else {
            log.info("Social media producer is disabled");
        }
    }

    private void startProducing() {
        int batchSize = ratePerSecond / 10;
        scheduler.scheduleAtFixedRate(() -> {
            for (int i = 0; i < batchSize; i++) {
                sendPost();
            }
        }, 0, 100, TimeUnit.MILLISECONDS);
    }

    public void sendPost() {
        try {
            SocialMediaPost post = generateRandomPost();
            String json = objectMapper.writeValueAsString(post);
            String key = post.getId();
            kafkaTemplate.send(rawTopic, key, json);
            long count = postCounter.incrementAndGet();
            if (count % 5000 == 0) {
                log.info("Produced {} posts so far", count);
            }
        } catch (Exception e) {
            log.error("Error producing post", e);
        }
    }

    private SocialMediaPost generateRandomPost() {
        String id = UUID.randomUUID().toString();
        String platform = PLATFORMS[random.nextInt(PLATFORMS.length)];
        String author = AUTHORS[random.nextInt(AUTHORS.length)];

        SentimentType sentimentType = getRandomSentimentType();
        String[] wordList = switch (sentimentType) {
            case POSITIVE -> POSITIVE_WORDS;
            case NEGATIVE -> NEGATIVE_WORDS;
            case NEUTRAL -> NEUTRAL_WORDS;
        };
        String adj = wordList[random.nextInt(wordList.length)];

        String template = CONTENT_TEMPLATES[random.nextInt(CONTENT_TEMPLATES.length)];
        String product = PRODUCTS[random.nextInt(PRODUCTS.length)];
        String person = PERSON_NAMES[random.nextInt(PERSON_NAMES.length)];
        String brand = BRANDS[random.nextInt(BRANDS.length)];
        int locationIndex = random.nextInt(LOCATIONS.length);
        String location = LOCATIONS[locationIndex];

        String content = template
                .replace("{adj}", adj)
                .replace("{person}", person)
                .replace("{brand}", brand)
                .replace("{location}", location)
                .replace("{product}", product);

        return SocialMediaPost.builder()
                .id(id)
                .platform(platform)
                .author(author)
                .content(content)
                .location(location)
                .latitude(LOCATION_COORDS[locationIndex][0])
                .longitude(LOCATION_COORDS[locationIndex][1])
                .timestamp(Instant.now())
                .likes(random.nextInt(1000))
                .shares(random.nextInt(500))
                .comments(random.nextInt(200))
                .language(random.nextBoolean() ? "zh" : "en")
                .build();
    }

    private SentimentType getRandomSentimentType() {
        double r = random.nextDouble();
        if (r < 0.35) return SentimentType.POSITIVE;
        if (r < 0.65) return SentimentType.NEGATIVE;
        return SentimentType.NEUTRAL;
    }

    public long getTotalProduced() {
        return postCounter.get();
    }

    public void stop() {
        if (scheduler != null && !scheduler.isShutdown()) {
            scheduler.shutdown();
        }
    }
}
