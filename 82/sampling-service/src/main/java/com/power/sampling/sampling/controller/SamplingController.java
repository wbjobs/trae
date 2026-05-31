package com.power.sampling.sampling.controller;

import com.alibaba.csp.sentinel.annotation.SentinelResource;
import com.alibaba.csp.sentinel.slots.block.BlockException;
import com.baomidou.mybatisplus.core.metadata.IPage;
import com.power.sampling.sampling.dto.AsyncBatchResult;
import com.power.sampling.sampling.service.AsyncSamplingService;
import com.power.sampling.sampling.service.SamplingService;
import com.power.sampling.common.dto.BatchSamplingQueryDTO;
import com.power.sampling.common.dto.DeviceSamplingDTO;
import com.power.sampling.common.entity.PowerSampling;
import com.power.sampling.common.result.Result;
import com.power.sampling.common.result.ResultCode;
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
@RequestMapping("/sampling")
public class SamplingController {

    @Autowired
    private SamplingService samplingService;

    @Autowired
    private AsyncSamplingService asyncSamplingService;

    @PostMapping("/collect")
    @SentinelResource(value = "sampling-collect", blockHandler = "collectBlockHandler")
    public Result<PowerSampling> collectSampling(@RequestBody DeviceSamplingDTO samplingDTO) {
        return Result.success(samplingService.collectSampling(samplingDTO));
    }

    @PostMapping("/batch/collect")
    @SentinelResource(value = "sampling-batch-collect", blockHandler = "batchCollectBlockHandler")
    public Result<List<PowerSampling>> batchCollectSampling(@RequestBody List<DeviceSamplingDTO> samplingDTOList) {
        return Result.success(samplingService.batchCollectSampling(samplingDTOList));
    }

    @PostMapping("/batch/query")
    @SentinelResource(value = "sampling-batch-query", blockHandler = "batchQueryBlockHandler")
    public Result<List<PowerSampling>> batchQuerySampling(@RequestBody BatchSamplingQueryDTO queryDTO) {
        return Result.success(samplingService.batchQuerySampling(queryDTO));
    }

    @PostMapping("/batch/pull")
    @SentinelResource(value = "sampling-batch-pull", blockHandler = "batchPullBlockHandler")
    public Result<List<PowerSampling>> batchPullSampling(
            @RequestBody BatchSamplingQueryDTO queryDTO) {
        return Result.success(samplingService.batchPullSampling(
                queryDTO.getDeviceIds(), queryDTO.getStartTime(), queryDTO.getEndTime()));
    }

    @GetMapping("/page")
    @SentinelResource(value = "sampling-page", blockHandler = "blockHandler")
    public Result<IPage<PowerSampling>> getSamplingPage(
            @RequestParam(defaultValue = "1") Integer pageNum,
            @RequestParam(defaultValue = "10") Integer pageSize,
            @RequestParam(required = false) Long deviceId,
            @RequestParam(required = false) @DateTimeFormat(pattern = "yyyy-MM-dd HH:mm:ss") LocalDateTime startTime,
            @RequestParam(required = false) @DateTimeFormat(pattern = "yyyy-MM-dd HH:mm:ss") LocalDateTime endTime) {
        return Result.success(samplingService.getSamplingPage(pageNum, pageSize, deviceId, startTime, endTime));
    }

    @PostMapping("/async/batch/collect")
    @SentinelResource(value = "sampling-async-batch-collect", blockHandler = "asyncBatchCollectBlockHandler")
    public Result<Map<String, String>> asyncBatchCollect(@RequestBody List<DeviceSamplingDTO> samplingDTOList) {
        AsyncBatchResult result = asyncSamplingService.asyncBatchCollect(samplingDTOList);
        Map<String, String> response = new HashMap<>();
        response.put("taskId", result.getTaskId());
        response.put("message", "异步批量采样任务已提交");
        return Result.success(response);
    }

    @GetMapping("/async/result/{taskId}")
    @SentinelResource(value = "sampling-async-result", blockHandler = "asyncResultBlockHandler")
    public Result<AsyncBatchResult> getAsyncResult(@PathVariable("taskId") String taskId) {
        AsyncBatchResult result = asyncSamplingService.getAsyncResult(taskId);
        if (result == null) {
            return Result.fail("任务不存在或已过期");
        }
        return Result.success(result);
    }

    @PostMapping("/async/collect")
    @SentinelResource(value = "sampling-async-collect", blockHandler = "asyncCollectBlockHandler")
    public Result<String> asyncCollect(@RequestBody DeviceSamplingDTO samplingDTO) {
        asyncSamplingService.processSamplingAsync(samplingDTO);
        return Result.success("异步采样任务已提交");
    }

    public Result<PowerSampling> collectBlockHandler(DeviceSamplingDTO samplingDTO, BlockException e) {
        log.warn("采样接口限流: deviceCode={}", samplingDTO.getDeviceCode());
        return Result.fail(ResultCode.RATE_LIMIT);
    }

    public Result<List<PowerSampling>> batchCollectBlockHandler(List<DeviceSamplingDTO> samplingDTOList, BlockException e) {
        log.warn("批量采样接口限流: size={}", samplingDTOList.size());
        return Result.fail(ResultCode.RATE_LIMIT);
    }

    public Result<List<PowerSampling>> batchQueryBlockHandler(BatchSamplingQueryDTO queryDTO, BlockException e) {
        log.warn("批量查询接口限流");
        return Result.fail(ResultCode.RATE_LIMIT);
    }

    public Result<List<PowerSampling>> batchPullBlockHandler(BatchSamplingQueryDTO queryDTO, BlockException e) {
        log.warn("批量拉取接口限流");
        return Result.fail(ResultCode.RATE_LIMIT);
    }

    public Result<?> blockHandler(Object param, BlockException e) {
        log.warn("采样接口限流: {}", e.getMessage());
        return Result.fail(ResultCode.RATE_LIMIT);
    }

    public Result<Map<String, String>> asyncBatchCollectBlockHandler(List<DeviceSamplingDTO> samplingDTOList, BlockException e) {
        log.warn("异步批量采样接口限流: size={}", samplingDTOList.size());
        return Result.fail(ResultCode.RATE_LIMIT);
    }

    public Result<AsyncBatchResult> asyncResultBlockHandler(String taskId, BlockException e) {
        log.warn("异步结果查询接口限流: taskId={}", taskId);
        return Result.fail(ResultCode.RATE_LIMIT);
    }

    public Result<String> asyncCollectBlockHandler(DeviceSamplingDTO samplingDTO, BlockException e) {
        log.warn("异步采样接口限流: deviceCode={}", samplingDTO.getDeviceCode());
        return Result.fail(ResultCode.RATE_LIMIT);
    }
}
