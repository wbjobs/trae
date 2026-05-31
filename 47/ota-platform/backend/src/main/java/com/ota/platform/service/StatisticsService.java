package com.ota.platform.service;

import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.stereotype.Service;

import java.time.LocalDateTime;
import java.util.*;

@Service
public class StatisticsService {

    @Autowired
    private DeviceService deviceService;

    @Autowired
    private FirmwareService firmwareService;

    @Autowired
    private UpgradeTaskService upgradeTaskService;

    @Autowired
    private DeviceGroupService deviceGroupService;

    public Map<String, Object> getDashboardStatistics() {
        Map<String, Object> stats = new HashMap<>();

        stats.put("totalDevices", deviceService.getTotalDeviceCount());
        stats.put("onlineDevices", deviceService.getOnlineDeviceCount());
        stats.put("offlineDevices", deviceService.getTotalDeviceCount() - deviceService.getOnlineDeviceCount());
        stats.put("totalGroups", deviceGroupService.getTotalGroupCount());
        stats.put("totalFirmware", firmwareService.getTotalFirmwareCount());
        stats.put("publishedFirmware", firmwareService.getPublishedFirmwareCount());
        stats.put("totalTasks", upgradeTaskService.getTotalTaskCount());

        Object[] upgradeResult = upgradeTaskService.getTotalUpgradeResult();
        long totalUpgrades = 0;
        long successUpgrades = 0;
        long failedUpgrades = 0;

        if (upgradeResult != null) {
            successUpgrades = upgradeResult[0] != null ? ((Number) upgradeResult[0]).longValue() : 0;
            failedUpgrades = upgradeResult[1] != null ? ((Number) upgradeResult[1]).longValue() : 0;
            totalUpgrades = successUpgrades + failedUpgrades;
        }

        stats.put("totalUpgrades", totalUpgrades);
        stats.put("successUpgrades", successUpgrades);
        stats.put("failedUpgrades", failedUpgrades);
        stats.put("successRate", totalUpgrades > 0 ?
                String.format("%.2f%%", (double) successUpgrades / totalUpgrades * 100) : "0.00%");

        return stats;
    }

    public List<Map<String, Object>> getDeviceStatusDistribution() {
        List<Map<String, Object>> result = new ArrayList<>();
        List<Object[]> data = deviceService.getDeviceCountByStatus();

        for (Object[] row : data) {
            Map<String, Object> item = new HashMap<>();
            item.put("status", row[0]);
            item.put("count", row[1]);
            result.add(item);
        }

        return result;
    }

    public List<Map<String, Object>> getFirmwareVersionDistribution() {
        List<Map<String, Object>> result = new ArrayList<>();
        List<Object[]> data = deviceService.getDeviceCountByFirmwareVersion();

        for (Object[] row : data) {
            Map<String, Object> item = new HashMap<>();
            item.put("version", row[0]);
            item.put("count", row[1]);
            result.add(item);
        }

        return result;
    }

    public List<Map<String, Object>> getUpgradeTaskStatusDistribution() {
        List<Map<String, Object>> result = new ArrayList<>();
        List<Object[]> data = upgradeTaskService.getTaskCountByStatus();

        for (Object[] row : data) {
            Map<String, Object> item = new HashMap<>();
            item.put("status", row[0]);
            item.put("count", row[1]);
            result.add(item);
        }

        return result;
    }

    public List<Map<String, Object>> getFirmwareUpgradeStatistics() {
        List<Map<String, Object>> result = new ArrayList<>();
        List<Object[]> data = firmwareService.getFirmwareUpgradeStats();

        for (Object[] row : data) {
            Map<String, Object> item = new HashMap<>();
            item.put("version", row[0]);
            item.put("successCount", row[1]);
            item.put("failureCount", row[2]);
            long total = ((Number) row[1]).intValue() + ((Number) row[2]).intValue();
            item.put("totalCount", total);
            item.put("successRate", total > 0 ?
                    String.format("%.2f%%", (double) ((Number) row[1]).intValue() / total * 100) : "0.00%");
            result.add(item);
        }

        return result;
    }

    public List<Map<String, Object>> getUpgradeTrend(int days) {
        List<Map<String, Object>> result = new ArrayList<>();
        LocalDateTime startDate = LocalDateTime.now().minusDays(days);
        List<Object[]> data = upgradeTaskService.getTaskCountByDate(startDate);

        for (Object[] row : data) {
            Map<String, Object> item = new HashMap<>();
            item.put("date", row[0].toString());
            item.put("count", row[1]);
            result.add(item);
        }

        return result;
    }
}
