package com.anomaly.alert.rootcause;

import lombok.Data;
import lombok.extern.slf4j.Slf4j;
import org.springframework.stereotype.Component;

import javax.annotation.PostConstruct;
import java.util.*;
import java.util.concurrent.ConcurrentHashMap;
import java.util.stream.Collectors;

@Slf4j
@Component
public class RootCauseKnowledgeBase {

    private final Map<String, List<CausePattern>> metricPatterns = new ConcurrentHashMap<>();
    private final Map<String, List<CausePattern>> algorithmPatterns = new ConcurrentHashMap<>();
    private final Map<String, List<CausePattern>> tagPatterns = new ConcurrentHashMap<>();

    @PostConstruct
    public void init() {
        loadBuiltInKnowledge();
        log.info("Root Cause Knowledge Base initialized with {} metric patterns, {} algorithm patterns, {} tag patterns",
            metricPatterns.size(), algorithmPatterns.size(), tagPatterns.size());
    }

    private void loadBuiltInKnowledge() {
        addMetricPattern("cpu.usage", Arrays.asList(
            new CausePattern(
                "CPU使用率突增",
                Arrays.asList("高并发请求", "死循环", "内存泄漏导致频繁GC", "恶意攻击"),
                Arrays.asList(
                    "1. 检查系统负载和进程CPU占用: top -H -p <pid>",
                    "2. 查看线程栈信息: jstack <pid>",
                    "3. 分析GC日志: jstat -gcutil <pid> 1000",
                    "4. 检查访问日志是否有异常流量",
                    "5. 考虑水平扩展或优化热点代码"
                ),
                0.9,
                "high_cpu_spike"
            ),
            new CausePattern(
                "CPU使用率持续高位",
                Arrays.asList("业务量增长", "资源不足", "计算密集型任务"),
                Arrays.asList(
                    "1. 分析业务量趋势，确认是否正常增长",
                    "2. 检查是否有大数据量任务在运行",
                    "3. 考虑升级CPU配置或增加节点",
                    "4. 优化算法复杂度，减少计算量"
                ),
                0.8,
                "sustained_high_cpu"
            ),
            new CausePattern(
                "CPU使用率异常低",
                Arrays.asList("服务假死", "线程阻塞", "请求量暴跌", "资源未充分利用"),
                Arrays.asList(
                    "1. 检查服务是否响应正常",
                    "2. 查看线程状态: jstack <pid> | grep BLOCKED",
                    "3. 检查监控确认流量是否正常",
                    "4. 检查是否有死锁或资源等待"
                ),
                0.85,
                "abnormally_low_cpu"
            )
        ));

        addMetricPattern("memory.usage", Arrays.asList(
            new CausePattern(
                "内存使用率持续上升",
                Arrays.asList("内存泄漏", "缓存未设置过期", "大对象创建过多", "元空间泄漏"),
                Arrays.asList(
                    "1. 生成堆转储: jmap -dump:format=b,file=heap.hprof <pid>",
                    "2. 使用MAT或JVisualVM分析堆内存",
                    "3. 检查缓存配置，设置合理的过期时间",
                    "4. 分析GC日志，查看内存回收情况",
                    "5. 检查是否有大对象或数组未释放"
                ),
                0.95,
                "memory_leak"
            ),
            new CausePattern(
                "内存突然飙升",
                Arrays.asList("大流量突发", "批量数据处理", "内存溢出前兆", "异常请求"),
                Arrays.asList(
                    "1. 检查是否有突发流量或批量任务",
                    "2. 查看GC情况，是否频繁Full GC",
                    "3. 检查请求参数是否有异常大的值",
                    "4. 考虑增加JVM内存配置"
                ),
                0.8,
                "memory_spike"
            ),
            new CausePattern(
                "频繁Full GC",
                Arrays.asList("内存不足", "大对象分配", "内存泄漏", "永久代/元空间满"),
                Arrays.asList(
                    "1. 分析GC日志，确认GC原因",
                    "2. 检查堆内存配置是否合理",
                    "3. 检查是否有内存泄漏",
                    "4. 考虑使用G1垃圾回收器优化",
                    "5. 检查元空间使用情况"
                ),
                0.9,
                "frequent_full_gc"
            )
        ));

        addMetricPattern("network.traffic", Arrays.asList(
            new CausePattern(
                "网络流量突增",
                Arrays.asList("业务高峰", "DDoS攻击", "爬虫/扫描", "数据同步任务", "接口被刷"),
                Arrays.asList(
                    "1. 检查访问日志，分析请求来源和特征",
                    "2. 使用netstat查看连接情况: netstat -an | grep ESTABLISHED",
                    "3. 检查是否有异常IP大量访问",
                    "4. 考虑启用WAF或限流策略",
                    "5. 确认是否有正常的业务活动或推广"
                ),
                0.85,
                "traffic_surge"
            ),
            new CausePattern(
                "网络流量异常下降",
                Arrays.asList("服务故障", "网络中断", "DNS问题", "客户端故障", "CDN异常"),
                Arrays.asList(
                    "1. 检查服务健康状态",
                    "2. 测试网络连通性: ping/traceroute",
                    "3. 检查DNS解析是否正常",
                    "4. 查看CDN状态和回源情况",
                    "5. 检查是否有客户端版本问题"
                ),
                0.9,
                "traffic_drop"
            ),
            new CausePattern(
                "网络延迟增加",
                Arrays.asList("网络拥塞", "服务过载", "数据库慢查询", "第三方依赖慢", "跨地域访问"),
                Arrays.asList(
                    "1. 使用traceroute分析网络路径延迟",
                    "2. 检查服务负载和响应时间",
                    "3. 分析慢查询日志，优化数据库查询",
                    "4. 检查第三方服务响应时间",
                    "5. 考虑使用CDN或就近部署"
                ),
                0.8,
                "network_latency"
            )
        ));

        addMetricPattern("disk.io", Arrays.asList(
            new CausePattern(
                "磁盘IO过高",
                Arrays.asList("大量读写操作", "日志输出过多", "数据库索引问题", "磁盘满", "文件系统碎片"),
                Arrays.asList(
                    "1. 查看IO高的进程: iotop",
                    "2. 检查日志级别和输出量",
                    "3. 分析数据库慢查询，优化索引",
                    "4. 检查磁盘使用率: df -h",
                    "5. 考虑使用SSD或优化存储架构"
                ),
                0.85,
                "high_disk_io"
            ),
            new CausePattern(
                "磁盘空间不足",
                Arrays.asList("日志未清理", "临时文件堆积", "数据量增长", "磁盘配额不足"),
                Arrays.asList(
                    "1. 查找大文件: find / -type f -size +100M",
                    "2. 检查日志文件，配置轮转和清理策略",
                    "3. 清理临时文件和过期数据",
                    "4. 考虑扩容磁盘或增加存储节点",
                    "5. 检查是否有异常进程大量写磁盘"
                ),
                0.95,
                "disk_full"
            )
        ));

        addMetricPattern("response.time", Arrays.asList(
            new CausePattern(
                "响应时间突增",
                Arrays.asList("服务过载", "数据库慢查询", "缓存失效", "第三方依赖慢", "网络问题"),
                Arrays.asList(
                    "1. 检查系统负载和资源使用情况",
                    "2. 分析慢查询日志，优化数据库查询",
                    "3. 检查缓存命中率",
                    "4. 查看依赖服务的响应时间",
                    "5. 检查网络连接和带宽使用"
                ),
                0.9,
                "latency_spike"
            ),
            new CausePattern(
                "响应时间持续偏高",
                Arrays.asList("性能退化", "资源瓶颈", "代码低效", "数据量增长"),
                Arrays.asList(
                    "1. 进行性能剖析，定位瓶颈",
                    "2. 检查数据库索引和查询效率",
                    "3. 分析代码热点，优化算法",
                    "4. 考虑增加缓存层",
                    "5. 评估是否需要扩容"
                ),
                0.85,
                "sustained_high_latency"
            ),
            new CausePattern(
                "错误率上升",
                Arrays.asList("服务异常", "依赖故障", "数据问题", "配置错误", "攻击行为"),
                Arrays.asList(
                    "1. 查看错误日志，定位异常类型",
                    "2. 检查依赖服务是否正常",
                    "3. 验证数据完整性和正确性",
                    "4. 检查最近的配置变更",
                    "5. 分析请求模式，是否有攻击特征"
                ),
                0.95,
                "error_rate_increase"
            )
        ));

        addAlgorithmPattern("3sigma", Arrays.asList(
            new CausePattern(
                "统计异常（偏离均值过远）",
                Arrays.asList("真实业务异常", "数据采集错误", "突发流量", "系统故障"),
                Arrays.asList(
                    "1. 结合业务场景判断是否为真实异常",
                    "2. 检查数据采集和传输是否正常",
                    "3. 查看历史趋势，分析异常模式",
                    "4. 结合其他相关指标综合判断"
                ),
                0.7,
                "statistical_outlier"
            )
        ));

        addAlgorithmPattern("isolation-forest", Arrays.asList(
            new CausePattern(
                "孤立点检测（行为异常）",
                Arrays.asList("攻击行为", "欺诈操作", "系统异常", "罕见但正常事件"),
                Arrays.asList(
                    "1. 深入分析该数据点的上下文信息",
                    "2. 检查是否有安全攻击特征",
                    "3. 验证业务操作的合理性",
                    "4. 如果是误报，考虑增加训练样本"
                ),
                0.75,
                "isolation_outlier"
            )
        ));

        addTagPattern("environment:prod", Arrays.asList(
            new CausePattern(
                "生产环境异常",
                Arrays.asList("生产流量波动", "真实用户问题", "线上Bug"),
                Arrays.asList(
                    "1. 优先处理，影响用户体验",
                    "2. 检查是否有发布变更",
                    "3. 查看用户反馈和投诉",
                    "4. 考虑回滚或紧急修复"
                ),
                1.2,
                "production_environment"
            )
        ));
    }

    private void addMetricPattern(String metricId, List<CausePattern> patterns) {
        metricPatterns.put(metricId, patterns);
    }

    private void addAlgorithmPattern(String algorithm, List<CausePattern> patterns) {
        algorithmPatterns.put(algorithm, patterns);
    }

    private void addTagPattern(String tag, List<CausePattern> patterns) {
        tagPatterns.put(tag, patterns);
    }

    public List<CausePattern> getPatternsForMetric(String metricId) {
        return metricPatterns.getOrDefault(metricId, Collections.emptyList());
    }

    public List<CausePattern> getPatternsForAlgorithm(String algorithm) {
        return algorithmPatterns.getOrDefault(algorithm, Collections.emptyList());
    }

    public List<CausePattern> getPatternsForTags(Map<String, String> tags) {
        if (tags == null || tags.isEmpty()) {
            return Collections.emptyList();
        }
        List<CausePattern> result = new ArrayList<>();
        for (Map.Entry<String, String> entry : tags.entrySet()) {
            String tagKey = entry.getKey() + ":" + entry.getValue();
            result.addAll(tagPatterns.getOrDefault(tagKey, Collections.emptyList()));
        }
        return result;
    }

    public Set<String> getKnownMetrics() {
        return metricPatterns.keySet();
    }

    @Data
    public static class CausePattern implements Serializable {
        private String patternName;
        private List<String> possibleCauses;
        private List<String> suggestions;
        private double weight;
        private String patternCode;

        public CausePattern(String patternName, List<String> possibleCauses, 
                           List<String> suggestions, double weight, String patternCode) {
            this.patternName = patternName;
            this.possibleCauses = possibleCauses;
            this.suggestions = suggestions;
            this.weight = weight;
            this.patternCode = patternCode;
        }
    }
}
