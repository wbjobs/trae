package com.ota.platform.controller;

import com.ota.platform.dto.ApiResponse;
import com.ota.platform.dto.PageResult;
import com.ota.platform.entity.UpgradeProgress;
import com.ota.platform.entity.UpgradeTask;
import com.ota.platform.service.UpgradeTaskService;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.data.domain.PageRequest;
import org.springframework.data.domain.Pageable;
import org.springframework.data.domain.Sort;
import org.springframework.web.bind.annotation.*;

import java.util.List;
import java.util.Map;

@RestController
@RequestMapping("/api/upgrade-tasks")
public class UpgradeTaskController {

    @Autowired
    private UpgradeTaskService upgradeTaskService;

    @PostMapping
    public ApiResponse<UpgradeTask> createTask(@RequestBody Map<String, Object> request) {
        UpgradeTask task = new UpgradeTask();
        task.setName((String) request.get("name"));
        task.setDescription((String) request.get("description"));

        Map<String, Object> firmwareMap = (Map<String, Object>) request.get("firmware");
        if (firmwareMap != null && firmwareMap.get("id") != null) {
            com.ota.platform.entity.Firmware firmware = new com.ota.platform.entity.Firmware();
            firmware.setId(((Number) firmwareMap.get("id")).longValue());
            task.setFirmware(firmware);
        }

        task.setTaskType((String) request.getOrDefault("taskType", "MANUAL"));
        task.setTargetType((String) request.getOrDefault("targetType", "DEVICES"));
        task.setIsGrayscale((Boolean) request.getOrDefault("isGrayscale", false));
        task.setGrayscalePercentage((Integer) request.getOrDefault("grayscalePercentage", 0));
        task.setTimeoutSeconds((Integer) request.getOrDefault("timeoutSeconds", 3600));
        task.setMaxRetryCount((Integer) request.getOrDefault("maxRetryCount", 3));
        task.setIsForceUpgrade((Boolean) request.getOrDefault("isForceUpgrade", false));
        task.setRemarks((String) request.get("remarks"));

        if (request.get("scheduleTime") != null) {
            task.setScheduleTime(java.time.LocalDateTime.parse((String) request.get("scheduleTime")));
        }

        List<Long> deviceIds = null;
        if (request.get("deviceIds") != null) {
            deviceIds = (List<Long>) request.get("deviceIds");
        }

        Long groupId = null;
        if (request.get("groupId") != null) {
            groupId = ((Number) request.get("groupId")).longValue();
        }

        UpgradeTask savedTask = upgradeTaskService.createUpgradeTask(task, deviceIds, groupId);
        return ApiResponse.success("Upgrade task created successfully", savedTask);
    }

    @GetMapping
    public ApiResponse<PageResult<UpgradeTask>> getAllTasks(
            @RequestParam(defaultValue = "0") int page,
            @RequestParam(defaultValue = "20") int size,
            @RequestParam(required = false) String status,
            @RequestParam(required = false) Long firmwareId) {

        Pageable pageable = PageRequest.of(page, size, Sort.by(Sort.Direction.DESC, "createdAt"));
        PageResult<UpgradeTask> result;

        if (status != null) {
            result = upgradeTaskService.getTasksByStatus(status, pageable);
        } else if (firmwareId != null) {
            result = upgradeTaskService.getTasksByFirmware(firmwareId, pageable);
        } else {
            result = upgradeTaskService.getAllTasks(pageable);
        }

        return ApiResponse.success(result);
    }

    @GetMapping("/{id}")
    public ApiResponse<UpgradeTask> getTaskById(@PathVariable Long id) {
        UpgradeTask task = upgradeTaskService.getTaskById(id);
        return ApiResponse.success(task);
    }

    @GetMapping("/{id}/progress")
    public ApiResponse<PageResult<UpgradeProgress>> getTaskProgress(
            @PathVariable Long id,
            @RequestParam(defaultValue = "0") int page,
            @RequestParam(defaultValue = "50") int size) {

        Pageable pageable = PageRequest.of(page, size, Sort.by(Sort.Direction.DESC, "createdAt"));
        PageResult<UpgradeProgress> result = upgradeTaskService.getTaskProgress(id, pageable);
        return ApiResponse.success(result);
    }

    @GetMapping("/{id}/progress/list")
    public ApiResponse<List<UpgradeProgress>> getTaskProgressList(@PathVariable Long id) {
        List<UpgradeProgress> result = upgradeTaskService.getTaskProgressList(id);
        return ApiResponse.success(result);
    }

    @PostMapping("/{id}/execute")
    public ApiResponse<UpgradeTask> executeTask(@PathVariable Long id) {
        UpgradeTask task = upgradeTaskService.executeTask(id);
        return ApiResponse.success("Task execution started", task);
    }

    @PostMapping("/{id}/cancel")
    public ApiResponse<UpgradeTask> cancelTask(@PathVariable Long id) {
        UpgradeTask task = upgradeTaskService.cancelTask(id);
        return ApiResponse.success("Task cancelled successfully", task);
    }

    @PostMapping("/{id}/continue-grayscale")
    public ApiResponse<UpgradeTask> continueGrayscaleTask(@PathVariable Long id) {
        UpgradeTask task = upgradeTaskService.continueGrayscaleTask(id);
        return ApiResponse.success("Grayscale task continued", task);
    }

    @PostMapping("/progress/{progressId}/update")
    public ApiResponse<UpgradeProgress> updateProgress(
            @PathVariable Long progressId,
            @RequestBody Map<String, Object> request) {

        String status = (String) request.get("status");
        Integer progressPercentage = request.get("progressPercentage") != null ?
                ((Number) request.get("progressPercentage")).intValue() : null;
        String currentStage = (String) request.get("currentStage");
        Long downloadedSize = request.get("downloadedSize") != null ?
                ((Number) request.get("downloadedSize")).longValue() : null;
        String errorMessage = (String) request.get("errorMessage");
        String errorCode = (String) request.get("errorCode");

        UpgradeProgress progress = upgradeTaskService.updateProgress(
                progressId, status, progressPercentage, currentStage,
                downloadedSize, errorMessage, errorCode);

        return ApiResponse.success("Progress updated", progress);
    }

    @PostMapping("/progress/{progressId}/resume")
    public ApiResponse<UpgradeProgress> resumeUpgrade(@PathVariable Long progressId) {
        UpgradeProgress progress = upgradeTaskService.resumeUpgrade(progressId);
        return ApiResponse.success("Upgrade resumed", progress);
    }

    @PostMapping("/progress/{progressId}/retry")
    public ApiResponse<UpgradeProgress> retryUpgrade(@PathVariable Long progressId) {
        UpgradeProgress progress = upgradeTaskService.retryUpgrade(progressId);
        return ApiResponse.success("Upgrade retried", progress);
    }

    @PostMapping("/progress/{progressId}/rollback")
    public ApiResponse<UpgradeProgress> initiateRollback(@PathVariable Long progressId) {
        UpgradeProgress progress = upgradeTaskService.initiateRollback(progressId);
        return ApiResponse.success("Rollback initiated", progress);
    }

    @PostMapping("/progress/{progressId}/rollback/update")
    public ApiResponse<UpgradeProgress> updateRollbackProgress(
            @PathVariable Long progressId,
            @RequestBody Map<String, Object> request) {

        String rollbackStage = (String) request.get("rollbackStage");
        String errorMessage = (String) request.get("errorMessage");
        Boolean isSuccess = request.get("isSuccess") != null ?
                (Boolean) request.get("isSuccess") : null;

        UpgradeProgress progress = upgradeTaskService.updateRollbackProgress(
                progressId, rollbackStage, errorMessage, isSuccess);

        return ApiResponse.success("Rollback progress updated", progress);
    }

    @GetMapping("/progress/device/{deviceId}")
    public ApiResponse<List<UpgradeProgress>> getDeviceUpgradeHistory(@PathVariable Long deviceId) {
        List<UpgradeProgress> history = upgradeTaskService.getDeviceUpgradeHistory(deviceId);
        return ApiResponse.success(history);
    }
}
