package com.power.sampling.scheduler.service;

import cn.hutool.core.util.RandomUtil;
import com.baomidou.mybatisplus.core.conditions.query.QueryWrapper;
import com.baomidou.mybatisplus.core.metadata.IPage;
import com.baomidou.mybatisplus.extension.plugins.pagination.Page;
import com.power.sampling.common.entity.EdgeNode;
import com.power.sampling.common.entity.NodeLoadStats;
import com.power.sampling.scheduler.mapper.EdgeNodeMapper;
import com.power.sampling.scheduler.mapper.NodeLoadStatsMapper;
import lombok.extern.slf4j.Slf4j;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.stereotype.Service;
import org.springframework.util.CollectionUtils;

import java.math.BigDecimal;
import java.time.LocalDateTime;
import java.util.HashMap;
import java.util.List;
import java.util.Map;
import java.util.concurrent.ConcurrentHashMap;
import java.util.concurrent.atomic.AtomicInteger;

@Slf4j
@Service
public class NodeLoadStatsService {

    private final Map<String, AtomicInteger> requestCounter = new ConcurrentHashMap<>();
    private final Map<String, AtomicInteger> errorCounter = new ConcurrentHashMap<>();
    private final Map<String, AtomicInteger> samplingCounter = new ConcurrentHashMap<>();
    private final Map<String, NodeLoadStats> latestStatsCache = new ConcurrentHashMap<>();

    @Autowired
    private NodeLoadStatsMapper nodeLoadStatsMapper;

    @Autowired
    private EdgeNodeMapper edgeNodeMapper;

    public void collectNodeLoadStats() {
        List<EdgeNode> nodes = edgeNodeMapper.selectList(new QueryWrapper<EdgeNode>()
                .eq("status", 1));

        if (CollectionUtils.isEmpty(nodes)) {
            return;
        }

        LocalDateTime statsTime = LocalDateTime.now();
        for (EdgeNode node : nodes) {
            try {
                NodeLoadStats stats = generateNodeLoadStats(node, statsTime);
                nodeLoadStatsMapper.insert(stats);
                latestStatsCache.put(node.getNodeCode(), stats);
                updateNodeLoadLevel(node, stats);
            } catch (Exception e) {
                log.error("采集节点负载异常: nodeCode={}", node.getNodeCode(), e);
            }
        }

        log.debug("节点负载采集完成, 节点数: {}", nodes.size());
    }

    private NodeLoadStats generateNodeLoadStats(EdgeNode node, LocalDateTime statsTime) {
        NodeLoadStats stats = new NodeLoadStats();
        stats.setNodeId(node.getId());
        stats.setNodeCode(node.getNodeCode());

        stats.setCpuUsage(BigDecimal.valueOf(RandomUtil.randomDouble(10, 80)));
        stats.setMemoryUsage(BigDecimal.valueOf(RandomUtil.randomDouble(20, 70)));
        stats.setDiskUsage(BigDecimal.valueOf(RandomUtil.randomDouble(30, 60)));
        stats.setNetworkIn(BigDecimal.valueOf(RandomUtil.randomDouble(10, 500)));
        stats.setNetworkOut(BigDecimal.valueOf(RandomUtil.randomDouble(10, 500)));

        AtomicInteger reqCount = requestCounter.getOrDefault(node.getNodeCode(), new AtomicInteger(0));
        AtomicInteger errCount = errorCounter.getOrDefault(node.getNodeCode(), new AtomicInteger(0));
        AtomicInteger sampCount = samplingCounter.getOrDefault(node.getNodeCode(), new AtomicInteger(0));

        stats.setConnectionCount(RandomUtil.randomInt(10, 200));
        stats.setRequestCount(reqCount.getAndSet(0));
        stats.setErrorCount(errCount.getAndSet(0));
        stats.setAvgResponseTime(BigDecimal.valueOf(RandomUtil.randomDouble(5, 200)));
        stats.setDeviceCount(node.getCurrentDevices());
        stats.setSamplingCount(sampCount.getAndSet(0));

        BigDecimal loadScore = calculateLoadScore(stats, node);
        stats.setLoadScore(loadScore);
        stats.setStatsTime(statsTime);
        stats.setCreateTime(statsTime);

        return stats;
    }

    private BigDecimal calculateLoadScore(NodeLoadStats stats, EdgeNode node) {
        double cpuWeight = 0.25;
        double memoryWeight = 0.2;
        double deviceWeight = 0.25;
        double requestWeight = 0.15;
        double errorWeight = 0.15;

        double deviceRatio = node.getMaxDevices() > 0 ?
                (double) node.getCurrentDevices() / node.getMaxDevices() * 100 : 0;
        double errorRatio = stats.getRequestCount() > 0 ?
                (double) stats.getErrorCount() / stats.getRequestCount() * 100 : 0;

        double score = stats.getCpuUsage().doubleValue() * cpuWeight
                + stats.getMemoryUsage().doubleValue() * memoryWeight
                + deviceRatio * deviceWeight
                + Math.min(stats.getRequestCount(), 100) * requestWeight
                + errorRatio * errorWeight;

        return BigDecimal.valueOf(Math.min(score, 100));
    }

    private void updateNodeLoadLevel(EdgeNode node, NodeLoadStats stats) {
        int loadLevel;
        double score = stats.getLoadScore().doubleValue();
        if (score < 30) {
            loadLevel = 1;
        } else if (score < 60) {
            loadLevel = 2;
        } else if (score < 85) {
            loadLevel = 3;
        } else {
            loadLevel = 4;
        }

        if (node.getLoadLevel() != loadLevel) {
            node.setLoadLevel(loadLevel);
            node.setUpdateTime(LocalDateTime.now());
            edgeNodeMapper.updateById(node);
            log.info("节点负载等级变化: nodeCode={}, 原等级={}, 新等级={}, 得分={}",
                    node.getNodeCode(), node.getLoadLevel(), loadLevel, score);
        }
    }

    public IPage<NodeLoadStats> getStatsPage(Integer pageNum, Integer pageSize,
                                              String nodeCode, LocalDateTime startTime, LocalDateTime endTime) {
        Page<NodeLoadStats> page = new Page<>(pageNum, pageSize);
        QueryWrapper<NodeLoadStats> wrapper = new QueryWrapper<>();
        if (nodeCode != null) {
            wrapper.eq("node_code", nodeCode);
        }
        if (startTime != null) {
            wrapper.ge("stats_time", startTime);
        }
        if (endTime != null) {
            wrapper.le("stats_time", endTime);
        }
        wrapper.orderByDesc("stats_time");
        return nodeLoadStatsMapper.selectPage(page, wrapper);
    }

    public List<NodeLoadStats> getLatestStats() {
        return latestStatsCache.values().stream().toList();
    }

    public NodeLoadStats getLatestStatsByNode(String nodeCode) {
        return latestStatsCache.get(nodeCode);
    }

    public Map<String, Object> getOverallLoadInfo() {
        Map<String, Object> result = new HashMap<>();
        List<EdgeNode> nodes = edgeNodeMapper.selectList(null);

        int totalNodes = nodes.size();
        int onlineNodes = 0;
        int totalDevices = 0;
        BigDecimal avgLoadScore = BigDecimal.ZERO;

        for (EdgeNode node : nodes) {
            if (node.getStatus() == 1) {
                onlineNodes++;
                totalDevices += node.getCurrentDevices();
            }
        }

        if (!latestStatsCache.isEmpty()) {
            BigDecimal totalScore = latestStatsCache.values().stream()
                    .map(NodeLoadStats::getLoadScore)
                    .reduce(BigDecimal.ZERO, BigDecimal::add);
            avgLoadScore = totalScore.divide(BigDecimal.valueOf(latestStatsCache.size()), 2,
                    java.math.RoundingMode.HALF_UP);
        }

        result.put("totalNodes", totalNodes);
        result.put("onlineNodes", onlineNodes);
        result.put("offlineNodes", totalNodes - onlineNodes);
        result.put("totalDevices", totalDevices);
        result.put("avgLoadScore", avgLoadScore);
        result.put("nodeDetails", latestStatsCache.values());

        return result;
    }

    public void incrementRequestCount(String nodeCode) {
        requestCounter.computeIfAbsent(nodeCode, k -> new AtomicInteger(0)).incrementAndGet();
    }

    public void incrementErrorCount(String nodeCode) {
        errorCounter.computeIfAbsent(nodeCode, k -> new AtomicInteger(0)).incrementAndGet();
    }

    public void incrementSamplingCount(String nodeCode, int count) {
        samplingCounter.computeIfAbsent(nodeCode, k -> new AtomicInteger(0)).addAndGet(count);
    }
}
