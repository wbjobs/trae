package com.ota.platform.controller;

import com.ota.platform.dto.ApiResponse;
import com.ota.platform.service.StatisticsService;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.web.bind.annotation.*;

import java.util.List;
import java.util.Map;

@RestController
@RequestMapping("/api/statistics")
public class StatisticsController {

    @Autowired
    private StatisticsService statisticsService;

    @GetMapping("/dashboard")
    public ApiResponse<Map<String, Object>> getDashboardStatistics() {
        Map<String, Object> stats = statisticsService.getDashboardStatistics();
        return ApiResponse.success(stats);
    }

    @GetMapping("/device-status")
    public ApiResponse<List<Map<String, Object>>> getDeviceStatusDistribution() {
        List<Map<String, Object>> data = statisticsService.getDeviceStatusDistribution();
        return ApiResponse.success(data);
    }

    @GetMapping("/firmware-version")
    public ApiResponse<List<Map<String, Object>>> getFirmwareVersionDistribution() {
        List<Map<String, Object>> data = statisticsService.getFirmwareVersionDistribution();
        return ApiResponse.success(data);
    }

    @GetMapping("/task-status")
    public ApiResponse<List<Map<String, Object>>> getUpgradeTaskStatusDistribution() {
        List<Map<String, Object>> data = statisticsService.getUpgradeTaskStatusDistribution();
        return ApiResponse.success(data);
    }

    @GetMapping("/firmware-upgrade")
    public ApiResponse<List<Map<String, Object>>> getFirmwareUpgradeStatistics() {
        List<Map<String, Object>> data = statisticsService.getFirmwareUpgradeStatistics();
        return ApiResponse.success(data);
    }

    @GetMapping("/upgrade-trend")
    public ApiResponse<List<Map<String, Object>>> getUpgradeTrend(@RequestParam(defaultValue = "7") int days) {
        List<Map<String, Object>> data = statisticsService.getUpgradeTrend(days);
        return ApiResponse.success(data);
    }
}
