package com.power.sampling.calculation.controller;

import com.alibaba.csp.sentinel.annotation.SentinelResource;
import com.alibaba.csp.sentinel.slots.block.BlockException;
import com.baomidou.mybatisplus.core.metadata.IPage;
import com.power.sampling.calculation.service.CalculationService;
import com.power.sampling.common.dto.PowerCalculationDTO;
import com.power.sampling.common.entity.PowerCalculation;
import com.power.sampling.common.result.Result;
import com.power.sampling.common.result.ResultCode;
import lombok.extern.slf4j.Slf4j;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.format.annotation.DateTimeFormat;
import org.springframework.web.bind.annotation.*;

import java.time.LocalDateTime;

@Slf4j
@RestController
@RequestMapping("/calculation")
public class CalculationController {

    @Autowired
    private CalculationService calculationService;

    @PostMapping("/execute")
    @SentinelResource(value = "calculation-execute", blockHandler = "blockHandler")
    public Result<PowerCalculation> executeCalculation(@RequestBody PowerCalculationDTO calculationDTO) {
        return Result.success(calculationService.executeCalculation(calculationDTO));
    }

    @PostMapping("/batch/execute")
    @SentinelResource(value = "calculation-batch-execute", blockHandler = "blockHandler")
    public Result<Boolean> batchExecuteCalculation(@RequestBody PowerCalculationDTO calculationDTO) {
        return Result.success(calculationService.batchExecuteCalculation(calculationDTO));
    }

    @GetMapping("/{id}")
    @SentinelResource(value = "calculation-get", blockHandler = "blockHandler")
    public Result<PowerCalculation> getById(@PathVariable("id") Long id) {
        return Result.success(calculationService.getById(id));
    }

    @GetMapping("/page")
    @SentinelResource(value = "calculation-page", blockHandler = "blockHandler")
    public Result<IPage<PowerCalculation>> getCalculationPage(
            @RequestParam(defaultValue = "1") Integer pageNum,
            @RequestParam(defaultValue = "10") Integer pageSize,
            @RequestParam(required = false) Long deviceId,
            @RequestParam(required = false) Integer calculationType,
            @RequestParam(required = false) @DateTimeFormat(pattern = "yyyy-MM-dd HH:mm:ss") LocalDateTime startTime,
            @RequestParam(required = false) @DateTimeFormat(pattern = "yyyy-MM-dd HH:mm:ss") LocalDateTime endTime) {
        return Result.success(calculationService.getCalculationPage(
                pageNum, pageSize, deviceId, calculationType, startTime, endTime));
    }

    public Result<?> blockHandler(Object param, BlockException e) {
        log.warn("运算接口限流: {}", e.getMessage());
        return Result.fail(ResultCode.RATE_LIMIT);
    }
}
