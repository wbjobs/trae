package com.power.sampling.scheduler.controller;

import com.alibaba.csp.sentinel.annotation.SentinelResource;
import com.alibaba.csp.sentinel.slots.block.BlockException;
import com.baomidou.mybatisplus.core.metadata.IPage;
import com.power.sampling.common.entity.NodeLoadStats;
import com.power.sampling.common.result.Result;
import com.power.sampling.common.result.ResultCode;
import com.power.sampling.scheduler.service.NodeLoadStatsService;
import lombok.extern.slf4j.Slf4j;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.format.annotation.DateTimeFormat;
import org.springframework.web.bind.annotation.*;

import java.time.LocalDateTime;
import java.util.List;
import java.util.Map;

@Slf4j
@RestController
@RequestMapping("/scheduler/load")
public class NodeLoadStatsController {

    @Autowired
    private NodeLoadStatsService nodeLoadStatsService;

    @GetMapping("/stats/page")
    @SentinelResource(value = "load-stats-page", blockHandler = "blockHandler")
    public Result<IPage<NodeLoadStats>> getStatsPage(
            @RequestParam(defaultValue = "1") Integer pageNum,
            @RequestParam(defaultValue = "10") Integer pageSize,
            @RequestParam(required = false) String nodeCode,
            @RequestParam(required = false) @DateTimeFormat(pattern = "yyyy-MM-dd HH:mm:ss") LocalDateTime startTime,
            @RequestParam(required = false) @DateTimeFormat(pattern = "yyyy-MM-dd HH:mm:ss") LocalDateTime endTime) {
        return Result.success(nodeLoadStatsService.getStatsPage(pageNum, pageSize, nodeCode, startTime, endTime));
    }

    @GetMapping("/stats/latest")
    @SentinelResource(value = "load-stats-latest", blockHandler = "blockHandler")
    public Result<List<NodeLoadStats>> getLatestStats() {
        return Result.success(nodeLoadStatsService.getLatestStats());
    }

    @GetMapping("/stats/node/{nodeCode}")
    @SentinelResource(value = "load-stats-node", blockHandler = "blockHandler")
    public Result<NodeLoadStats> getLatestStatsByNode(@PathVariable("nodeCode") String nodeCode) {
        return Result.success(nodeLoadStatsService.getLatestStatsByNode(nodeCode));
    }

    @GetMapping("/stats/overview")
    @SentinelResource(value = "load-stats-overview", blockHandler = "blockHandler")
    public Result<Map<String, Object>> getOverallLoadInfo() {
        return Result.success(nodeLoadStatsService.getOverallLoadInfo());
    }

    public Result<?> blockHandler(Object param, BlockException e) {
        log.warn("负载统计接口限流: {}", e.getMessage());
        return Result.fail(ResultCode.RATE_LIMIT);
    }
}
