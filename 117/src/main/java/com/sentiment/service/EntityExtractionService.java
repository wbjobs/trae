package com.sentiment.service;

import com.sentiment.model.SocialMediaPost.EntityResult;
import jakarta.annotation.PostConstruct;
import lombok.extern.slf4j.Slf4j;
import org.springframework.stereotype.Service;

import java.util.*;
import java.util.regex.Matcher;
import java.util.regex.Pattern;
import java.util.stream.Collectors;

@Slf4j
@Service
public class EntityExtractionService {

    private Map<String, String> personNames = new LinkedHashMap<>();
    private Map<String, String> brandNames = new LinkedHashMap<>();
    private Map<String, String> locationNames = new LinkedHashMap<>();
    private Map<String, double[]> locationCoords = new HashMap<>();

    private static final Pattern CHINESE_NAME_PATTERN = Pattern.compile("[\\u4e00-\\u9fa5]{2,4}");
    private static final Pattern ENGLISH_NAME_PATTERN = Pattern.compile("[A-Z][a-z]+(?:\\s[A-Z][a-z]+)*");
    private static final Pattern BRAND_PATTERN = Pattern.compile("([A-Z][a-z0-9]*(?:\\s[A-Z][a-z0-9]*)*|[\\u4e00-\\u9fa5]{2,6}(?:科技|电子|集团|公司|汽车|手机|电脑|家电|网络|信息|智能))");

    @PostConstruct
    public void init() {
        loadPersonNames();
        loadBrandNames();
        loadLocationNames();
        log.info("Entity extraction service initialized with {} persons, {} brands, {} locations",
                personNames.size(), brandNames.size(), locationNames.size());
    }

    private void loadPersonNames() {
        String[] persons = {
                "马云", "马化腾", "雷军", "任正非", "王兴", "张一鸣", "李彦宏", "刘强东",
                "马斯克", "乔布斯", "贝佐斯", "比尔盖茨", "扎克伯格", "库克", "黄仁勋",
                "丁磊", "张小龙", "罗永浩", "余承东", "李想", "李斌", "何小鹏",
                "Elon Musk", "Steve Jobs", "Jeff Bezos", "Bill Gates", "Mark Zuckerberg",
                "Tim Cook", "Jensen Huang", "Sundar Pichai", "Satya Nadella"
        };
        for (String p : persons) {
            personNames.put(p, "PERSON");
        }
    }

    private void loadBrandNames() {
        String[] brands = {
                "华为", "小米", "苹果", "三星", "OPPO", "vivo", "一加", "荣耀",
                "比亚迪", "特斯拉", "蔚来", "小鹏", "理想", "奔驰", "宝马", "奥迪",
                "腾讯", "阿里巴巴", "百度", "字节跳动", "美团", "京东", "拼多多",
                "网易", "滴滴", "顺丰", "海尔", "美的", "格力", "联想",
                "iPhone", "MacBook", "iPad", "iWatch", "Tesla", "Google", "Microsoft",
                "Amazon", "Meta", "Netflix", "Spotify", "YouTube", "Twitter", "Instagram",
                "Facebook", "WhatsApp", "TikTok", "Alibaba", "Tencent", "Baidu"
        };
        for (String b : brands) {
            brandNames.put(b, "BRAND");
        }
    }

    private void loadLocationNames() {
        String[][] locations = {
                {"北京", "39.9042", "116.4074"},
                {"上海", "31.2304", "121.4737"},
                {"广州", "23.1291", "113.2644"},
                {"深圳", "22.5431", "114.0579"},
                {"杭州", "30.2741", "120.1551"},
                {"成都", "30.5728", "104.0668"},
                {"武汉", "30.5928", "114.3055"},
                {"西安", "34.3416", "108.9398"},
                {"南京", "32.0603", "118.7969"},
                {"重庆", "29.5630", "106.5516"},
                {"苏州", "31.2989", "120.5853"},
                {"天津", "39.3434", "117.3616"},
                {"长沙", "28.2282", "112.9388"},
                {"厦门", "24.4798", "118.0819"},
                {"青岛", "36.0671", "120.3826"},
                {"大连", "38.9140", "121.6147"},
                {"香港", "22.3193", "114.1694"},
                {"台北", "25.0330", "121.5654"},
                {"新加坡", "1.3521", "103.8198"},
                {"东京", "35.6762", "139.6503"},
                {"首尔", "37.5665", "126.9780"},
                {"纽约", "40.7128", "-74.0060"},
                {"伦敦", "51.5074", "-0.1278"},
                {"巴黎", "48.8566", "2.3522"},
                {"Beijing", "39.9042", "116.4074"},
                {"Shanghai", "31.2304", "121.4737"},
                {"Tokyo", "35.6762", "139.6503"},
                {"New York", "40.7128", "-74.0060"},
                {"London", "51.5074", "-0.1278"},
                {"Paris", "48.8566", "2.3522"}
        };
        for (String[] loc : locations) {
            locationNames.put(loc[0], "LOCATION");
            locationCoords.put(loc[0], new double[]{Double.parseDouble(loc[1]), Double.parseDouble(loc[2])});
        }
    }

    public List<EntityResult> extract(String text) {
        if (text == null || text.isEmpty()) {
            return new ArrayList<>();
        }

        Map<String, EntityResult> foundEntities = new LinkedHashMap<>();

        for (Map.Entry<String, String> entry : personNames.entrySet()) {
            String name = entry.getKey();
            if (text.contains(name)) {
                EntityResult entity = EntityResult.builder()
                        .name(name)
                        .type("PERSON")
                        .count(1)
                        .confidence(0.95)
                        .build();
                foundEntities.merge(name, entity, (existing, newEntity) -> {
                    existing.setCount(existing.getCount() + 1);
                    return existing;
                });
            }
        }

        for (Map.Entry<String, String> entry : brandNames.entrySet()) {
            String brand = entry.getKey();
            if (text.contains(brand)) {
                EntityResult entity = EntityResult.builder()
                        .name(brand)
                        .type("BRAND")
                        .count(1)
                        .confidence(0.92)
                        .build();
                foundEntities.merge(brand, entity, (existing, newEntity) -> {
                    existing.setCount(existing.getCount() + 1);
                    return existing;
                });
            }
        }

        for (Map.Entry<String, String> entry : locationNames.entrySet()) {
            String loc = entry.getKey();
            if (text.contains(loc)) {
                EntityResult entity = EntityResult.builder()
                        .name(loc)
                        .type("LOCATION")
                        .count(1)
                        .confidence(0.90)
                        .build();
                foundEntities.merge(loc, entity, (existing, newEntity) -> {
                    existing.setCount(existing.getCount() + 1);
                    return existing;
                });
            }
        }

        Matcher brandMatcher = BRAND_PATTERN.matcher(text);
        while (brandMatcher.find()) {
            String potentialBrand = brandMatcher.group();
            if (!foundEntities.containsKey(potentialBrand) && potentialBrand.length() >= 2) {
                EntityResult entity = EntityResult.builder()
                        .name(potentialBrand)
                        .type("BRAND")
                        .count(1)
                        .confidence(0.60)
                        .build();
                foundEntities.merge(potentialBrand, entity, (existing, newEntity) -> {
                    existing.setCount(existing.getCount() + 1);
                    return existing;
                });
            }
        }

        List<EntityResult> result = new ArrayList<>(foundEntities.values());
        result.sort((a, b) -> Integer.compare(b.getCount(), a.getCount()));
        return result;
    }

    public List<EntityResult> extractBatch(List<String> texts) {
        Map<String, EntityResult> aggregated = new HashMap<>();

        for (String text : texts) {
            List<EntityResult> entities = extract(text);
            for (EntityResult entity : entities) {
                String key = entity.getName() + "_" + entity.getType();
                aggregated.merge(key, entity, (existing, newEntity) -> {
                    existing.setCount(existing.getCount() + newEntity.getCount());
                    return existing;
                });
            }
        }

        return aggregated.values().stream()
                .sorted((a, b) -> Integer.compare(b.getCount(), a.getCount()))
                .collect(Collectors.toList());
    }

    public double[] getLocationCoords(String location) {
        return locationCoords.getOrDefault(location, new double[]{0.0, 0.0});
    }

    public Map<String, String> getPersonNames() {
        return personNames;
    }

    public Map<String, String> getBrandNames() {
        return brandNames;
    }

    public Map<String, String> getLocationNames() {
        return locationNames;
    }
}
