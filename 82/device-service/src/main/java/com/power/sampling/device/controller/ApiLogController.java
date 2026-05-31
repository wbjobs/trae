package com.power.sampling.device.controller;

import com.alibaba.csp.sentinel.annotation.SentinelResource;
import com.alibaba.csp.sentinel.slots.block.BlockException;
import com.baomidou.mybatisplus.core.metadata.IPage;
import com.power.sampling.common.entity.ApiRequestLog;
import com.power.sampling.common.result.Result;
import com.power.sampling.common.result.ResultCode;
import com.power.sampling.device.service.ApiLogService;
import lombok.extern.slf4j.Slf4j;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.format.annotation.DateTimeFormat;
import org.springframework.web.bind.annotation.*;

import java.time.LocalDateTime;
import java.util.HashMap;
import java.util.List;
import java.util.Map;

@Slf4j
@RestController
@RequestMapping("/device/log")
public class ApiLogController {

    @Autowired
    private ApiLogService apiLogService;

    @GetMapping("/page")
    @SentinelResource(value = "log-page", blockHandler = "blockHandler")
    public Result<IPage<ApiRequestLog>> getLogPage(
            @RequestParam(defaultValue = "1") Integer pageNum,
            @RequestParam(defaultValue = "20") Integer pageSize,
            @RequestParam(required = false) String serviceName,
            @RequestParam(required = false) Integer logLevel,
            @RequestParam(required = false) Integer responseStatus,
            @RequestParam(required = false) @DateTimeFormat(pattern = "yyyy-MM-dd HH:mm:ss") LocalDateTime startTime,
            @RequestParam(required = false) @DateTimeFormat(pattern = "yyyy-MM-dd HH:mm:ss") LocalDateTime endTime) {
        return Result.success(apiLogService.getLogPage(pageNum, pageSize, serviceName, logLevel, responseStatus, startTime, endTime));
    }

    @GetMapping("/errors")
    @SentinelResource(value = "log-errors", blockHandler = "blockHandler")
    public Result<List<ApiRequestLog>> getErrorLogs(
            @RequestParam(required = false) @DateTimeFormat(pattern = "yyyy-MM-dd HH:mm:ss") LocalDateTime startTime,
            @RequestParam(required = false) @DateTimeFormat(pattern = "yyyy-MM-dd HH:mm:ss") LocalDateTime endTime) {
        return Result.success(apiLogService.getErrorLogs(startTime, endTime));
    }

    @GetMapping("/stats")
    @SentinelResource(value = "log-stats", blockHandler = "blockHandler")
    public Result<Map<String, Object>> getLogStats(
            @RequestParam(required = false) String serviceName,
            @RequestParam(required = false) @DateTimeFormat(pattern = "yyyy-MM-dd HH:mm:ss") LocalDateTime startTime,
            @RequestParam(required = false) @DateTimeFormat(pattern = "yyyy-MM-dd HH:mm:ss") LocalDateTime endTime) {
        Map<String, Object> result = new HashMap<>();
        result.put("totalCount", apiLogService.getSlowApiRequestCount(serviceName, startTime, endTime));
        result.put("startTime", startTime);
        result.put("endTime", endTime);
        result.put("serviceName", serviceName);
        return Result.success(result);
    }

    public Result<?> blockHandler(Object param, BlockException e) {
        log.warn("日志接口限流: {}", e.getMessage());
        return Result.fail(ResultCode.RATE_LIMIT);
    }
}
