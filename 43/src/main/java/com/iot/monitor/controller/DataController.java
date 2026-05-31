package com.iot.monitor.controller;

import com.iot.monitor.common.Result;
import com.iot.monitor.service.DataBufferService;
import com.iot.monitor.service.DataQueryService;
import lombok.RequiredArgsConstructor;
import org.springframework.web.bind.annotation.*;

import java.util.HashMap;
import java.util.List;
import java.util.Map;

@RestController
@RequestMapping("/api/data")
@RequiredArgsConstructor
public class DataController {

    private final DataQueryService dataQueryService;
    private final DataBufferService dataBufferService;

    @GetMapping("/device/{deviceId}/latest")
    public Result<Map<String, Object>> getLatestData(@PathVariable Long deviceId) {
        Map<String, Object> data = dataQueryService.getLatestData(deviceId);
        return Result.success(data);
    }

    @GetMapping("/device/{deviceId}/history")
    public Result<List<Map<String, Object>>> getHistoryData(
            @PathVariable Long deviceId,
            @RequestParam String pointCode,
            @RequestParam(defaultValue = "60") int minutes) {
        List<Map<String, Object>> data = dataQueryService.queryDeviceData(deviceId, pointCode, minutes);
        return Result.success(data);
    }

    @GetMapping("/device/{deviceId}/buffer")
    public Result<Map<String, Object>> getBufferStatus(@PathVariable Long deviceId) {
        Map<String, Object> result = new HashMap<>();
        result.put("deviceId", deviceId);
        result.put("bufferSize", dataBufferService.getBufferSize(deviceId));
        return Result.success(result);
    }

    @PostMapping("/device/{deviceId}/buffer/replay")
    public Result<Void> triggerReplay(@PathVariable Long deviceId) {
        dataBufferService.replayBufferedData();
        return Result.success();
    }
}
