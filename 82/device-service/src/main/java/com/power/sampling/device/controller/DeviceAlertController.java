package com.power.sampling.device.controller;

import com.alibaba.csp.sentinel.annotation.SentinelResource;
import com.alibaba.csp.sentinel.slots.block.BlockException;
import com.baomidou.mybatisplus.core.metadata.IPage;
import com.power.sampling.device.service.DeviceThresholdService;
import com.power.sampling.common.dto.ThresholdCheckDTO;
import com.power.sampling.common.entity.DeviceAlert;
import com.power.sampling.common.entity.DeviceThreshold;
import com.power.sampling.common.result.Result;
import com.power.sampling.common.result.ResultCode;
import lombok.extern.slf4j.Slf4j;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.web.bind.annotation.*;

import java.util.List;

@Slf4j
@RestController
@RequestMapping("/device/alert")
public class DeviceAlertController {

    @Autowired
    private DeviceThresholdService deviceThresholdService;

    @GetMapping("/threshold/device/{deviceId}")
    @SentinelResource(value = "alert-threshold-get", blockHandler = "blockHandler")
    public Result<DeviceThreshold> getThresholdByDeviceId(@PathVariable("deviceId") Long deviceId) {
        return Result.success(deviceThresholdService.getByDeviceId(deviceId));
    }

    @GetMapping("/threshold/code/{deviceCode}")
    @SentinelResource(value = "alert-threshold-code", blockHandler = "blockHandler")
    public Result<DeviceThreshold> getThresholdByDeviceCode(@PathVariable("deviceCode") String deviceCode) {
        return Result.success(deviceThresholdService.getByDeviceCode(deviceCode));
    }

    @GetMapping("/threshold/page")
    @SentinelResource(value = "alert-threshold-page", blockHandler = "blockHandler")
    public Result<IPage<DeviceThreshold>> getThresholdPage(
            @RequestParam(defaultValue = "1") Integer pageNum,
            @RequestParam(defaultValue = "10") Integer pageSize,
            @RequestParam(required = false) Long deviceId,
            @RequestParam(required = false) Integer enableStatus,
            @RequestParam(required = false) Integer alertLevel) {
        return Result.success(deviceThresholdService.getThresholdPage(pageNum, pageSize, deviceId, enableStatus, alertLevel));
    }

    @PostMapping("/threshold/save")
    @SentinelResource(value = "alert-threshold-save", blockHandler = "blockHandler")
    public Result<Boolean> saveThreshold(@RequestBody DeviceThreshold threshold) {
        return Result.success(deviceThresholdService.saveThreshold(threshold));
    }

    @PostMapping("/threshold/update")
    @SentinelResource(value = "alert-threshold-update", blockHandler = "blockHandler")
    public Result<Boolean> updateThreshold(@RequestBody DeviceThreshold threshold) {
        return Result.success(deviceThresholdService.updateThreshold(threshold));
    }

    @PostMapping("/threshold/delete/{id}")
    @SentinelResource(value = "alert-threshold-delete", blockHandler = "blockHandler")
    public Result<Boolean> deleteThreshold(@PathVariable("id") Long id) {
        return Result.success(deviceThresholdService.deleteThreshold(id));
    }

    @PostMapping("/check")
    @SentinelResource(value = "alert-check", blockHandler = "blockHandler")
    public Result<List<DeviceAlert>> checkThreshold(@RequestBody ThresholdCheckDTO checkDTO) {
        return Result.success(deviceThresholdService.checkThreshold(checkDTO));
    }

    @PostMapping("/batch/check")
    @SentinelResource(value = "alert-batch-check", blockHandler = "blockHandler")
    public Result<List<DeviceAlert>> batchCheckThreshold(@RequestBody List<ThresholdCheckDTO> checkDTOList) {
        return Result.success(deviceThresholdService.batchCheckThreshold(checkDTOList));
    }

    @GetMapping("/page")
    @SentinelResource(value = "alert-page", blockHandler = "blockHandler")
    public Result<IPage<DeviceAlert>> getAlertPage(
            @RequestParam(defaultValue = "1") Integer pageNum,
            @RequestParam(defaultValue = "10") Integer pageSize,
            @RequestParam(required = false) Long deviceId,
            @RequestParam(required = false) Integer status,
            @RequestParam(required = false) Integer alertLevel,
            @RequestParam(required = false) Integer alertType) {
        return Result.success(deviceThresholdService.getAlertPage(pageNum, pageSize, deviceId, status, alertLevel, alertType));
    }

    @PostMapping("/resolve/{id}")
    @SentinelResource(value = "alert-resolve", blockHandler = "blockHandler")
    public Result<Boolean> resolveAlert(@PathVariable("id") Long id,
                                        @RequestParam String resolver,
                                        @RequestParam(required = false) String resolveRemark) {
        return Result.success(deviceThresholdService.resolveAlert(id, resolver, resolveRemark));
    }

    public Result<?> blockHandler(Object param, BlockException e) {
        log.warn("告警接口限流: {}", e.getMessage());
        return Result.fail(ResultCode.RATE_LIMIT);
    }
}
