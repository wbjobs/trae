package com.ota.platform.controller;

import com.ota.platform.dto.ApiResponse;
import com.ota.platform.entity.Device;
import com.ota.platform.entity.Firmware;
import com.ota.platform.entity.FirmwareDelta;
import com.ota.platform.entity.UpgradeProgress;
import com.ota.platform.service.DeviceService;
import com.ota.platform.service.FirmwareDeltaService;
import com.ota.platform.service.FirmwareService;
import com.ota.platform.service.UpgradeTaskService;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.web.bind.annotation.*;

import java.util.HashMap;
import java.util.List;
import java.util.Map;

@RestController
@RequestMapping("/api/device")
public class DeviceApiController {

    @Autowired
    private DeviceService deviceService;

    @Autowired
    private FirmwareService firmwareService;

    @Autowired
    private FirmwareDeltaService firmwareDeltaService;

    @Autowired
    private UpgradeTaskService upgradeTaskService;

    @PostMapping("/auth/login")
    public ApiResponse<Map<String, Object>> deviceLogin(@RequestBody Map<String, String> request) {
        String deviceId = request.get("deviceId");
        String apiKey = request.get("apiKey");

        Device device = deviceService.authenticateDevice(deviceId, apiKey);

        Map<String, Object> result = new HashMap<>();
        result.put("deviceId", device.getDeviceId());
        result.put("name", device.getName());
        result.put("firmwareVersion", device.getFirmwareVersion());
        result.put("model", device.getModel());

        return ApiResponse.success(result);
    }

    @PostMapping("/heartbeat")
    public ApiResponse<Map<String, Object>> deviceHeartbeat(@RequestBody Map<String, String> request) {
        String deviceId = request.get("deviceId");
        String firmwareVersion = request.get("firmwareVersion");
        String ipAddress = request.get("ipAddress");

        Device device = deviceService.heartbeat(deviceId);

        if (firmwareVersion != null && !firmwareVersion.equals(device.getFirmwareVersion())) {
            deviceService.updateFirmwareVersion(deviceId, firmwareVersion);
        }

        Map<String, Object> result = new HashMap<>();
        result.put("status", "OK");
        result.put("serverTime", java.time.LocalDateTime.now().toString());
        result.put("upgradeAvailable", false);

        UpgradeProgress interruptedProgress = deviceService.checkAndRecoverInterruptedUpgrade(device.getId());
        if (interruptedProgress != null) {
            result.put("interruptedUpgrade", true);
            Map<String, Object> upgradeInfo = new HashMap<>();
            upgradeInfo.put("progressId", interruptedProgress.getId());
            upgradeInfo.put("taskId", interruptedProgress.getTask().getId());
            upgradeInfo.put("interruptionStage", interruptedProgress.getInterruptionStage());
            upgradeInfo.put("currentProgress", interruptedProgress.getProgressPercentage());
            upgradeInfo.put("targetVersion", interruptedProgress.getNewVersion());
            upgradeInfo.put("backupVersion", interruptedProgress.getBackupVersion());
            upgradeInfo.put("canResume", interruptedProgress.getCanResume());
            upgradeInfo.put("isRollbackNeeded", interruptedProgress.getIsRollbackNeeded());
            upgradeInfo.put("resumeCount", interruptedProgress.getResumeCount());
            upgradeInfo.put("maxResumeAttempts", interruptedProgress.getMaxResumeAttempts());
            result.put("interruptedUpgradeInfo", upgradeInfo);
        }

        return ApiResponse.success(result);
    }

    @PostMapping("/{deviceId}/upgrade/{progressId}/resume")
    public ApiResponse<UpgradeProgress> resumeInterruptedUpgrade(
            @PathVariable String deviceId,
            @PathVariable Long progressId) {
        Device device = deviceService.getDeviceByDeviceId(deviceId);
        UpgradeProgress progress = upgradeTaskService.resumeUpgrade(progressId);
        return ApiResponse.success("Upgrade resumed", progress);
    }

    @PostMapping("/{deviceId}/upgrade/{progressId}/rollback")
    public ApiResponse<UpgradeProgress> rollbackUpgrade(
            @PathVariable String deviceId,
            @PathVariable Long progressId) {
        Device device = deviceService.getDeviceByDeviceId(deviceId);
        UpgradeProgress progress = upgradeTaskService.initiateRollback(progressId);
        return ApiResponse.success("Rollback initiated", progress);
    }

    @PostMapping("/{deviceId}/upgrade/{progressId}/rollback/update")
    public ApiResponse<UpgradeProgress> updateRollbackProgress(
            @PathVariable String deviceId,
            @PathVariable Long progressId,
            @RequestBody Map<String, Object> request) {
        Device device = deviceService.getDeviceByDeviceId(deviceId);
        String rollbackStage = (String) request.get("rollbackStage");
        String errorMessage = (String) request.get("errorMessage");
        Boolean isSuccess = request.get("isSuccess") != null ? (Boolean) request.get("isSuccess") : null;

        UpgradeProgress progress = upgradeTaskService.updateRollbackProgress(
                progressId, rollbackStage, errorMessage, isSuccess);
        return ApiResponse.success("Rollback progress updated", progress);
    }

    @GetMapping("/{deviceId}/firmware/latest")
    public ApiResponse<Map<String, Object>> getLatestFirmware(@PathVariable String deviceId) {
        Device device = deviceService.getDeviceByDeviceId(deviceId);
        List<Firmware> firmwareList = firmwareService.getCompatibleFirmware(
                device.getModel(), device.getHardwareVersion());

        if (firmwareList.isEmpty()) {
            return ApiResponse.success("No firmware available", null);
        }

        Firmware latestFirmware = firmwareList.get(0);
        Map<String, Object> result = new HashMap<>();
        result.put("id", latestFirmware.getId());
        result.put("name", latestFirmware.getName());
        result.put("version", latestFirmware.getVersion());
        result.put("description", latestFirmware.getDescription());
        result.put("fileSize", latestFirmware.getFileSize());
        result.put("fileHash", latestFirmware.getFileHash());
        result.put("signature", latestFirmware.getSignature());
        result.put("isEncrypted", latestFirmware.getIsEncrypted());
        result.put("downloadUrl", "/api/firmware/" + latestFirmware.getId() + "/download");
        result.put("releaseNotes", latestFirmware.getReleaseNotes());

        return ApiResponse.success(result);
    }

    @PostMapping("/{deviceId}/firmware/{firmwareId}/verify")
    public ApiResponse<Boolean> verifyFirmwareSignature(
            @PathVariable String deviceId,
            @PathVariable Long firmwareId,
            @RequestBody Map<String, String> request) {

        String fileHash = request.get("fileHash");
        Firmware firmware = firmwareService.getFirmwareById(firmwareId);

        boolean valid = firmware.getFileHash().equalsIgnoreCase(fileHash);
        return ApiResponse.success(valid);
    }

    @GetMapping("/{deviceId}/firmware/{targetFirmwareId}/delta")
    public ApiResponse<Map<String, Object>> getDeltaInfo(
            @PathVariable String deviceId,
            @PathVariable Long targetFirmwareId) {

        Device device = deviceService.getDeviceByDeviceId(deviceId);
        String currentVersion = device.getFirmwareVersion();
        Firmware targetFirmware = firmwareService.getFirmwareById(targetFirmwareId);

        Map<String, Object> result = new HashMap<>();
        result.put("currentVersion", currentVersion);
        result.put("targetVersion", targetFirmware.getVersion());
        result.put("targetFirmwareSize", targetFirmware.getFileSize());
        result.put("useFullUpgrade", true);

        if (currentVersion != null) {
            FirmwareDelta delta = firmwareDeltaService.getBestDeltaForDevice(
                    currentVersion, targetFirmware.getVersion(), device.getModel());
            if (delta != null && delta.getIsGenerated()) {
                result.put("useFullUpgrade", false);
                result.put("deltaId", delta.getId());
                result.put("deltaSize", delta.getFileSize());
                result.put("deltaHash", delta.getFileHash());
                result.put("deltaSignature", delta.getSignature());
                result.put("deltaAlgorithm", delta.getDeltaAlgorithm());
                result.put("isEncrypted", delta.getIsEncrypted());
                result.put("compressionRatio", delta.getCompressionRatio());
                result.put("downloadUrl", "/api/firmware-deltas/" + delta.getId() + "/download");
            }
        }

        return ApiResponse.success(result);
    }

    @PostMapping("/{deviceId}/delta/{deltaId}/apply-success")
    public ApiResponse<String> markDeltaApplySuccess(
            @PathVariable String deviceId,
            @PathVariable Long deltaId) {
        Device device = deviceService.getDeviceByDeviceId(deviceId);
        firmwareDeltaService.incrementApplyCount(deltaId, true);
        return ApiResponse.success("Delta apply success recorded");
    }

    @PostMapping("/{deviceId}/delta/{deltaId}/apply-failure")
    public ApiResponse<String> markDeltaApplyFailure(
            @PathVariable String deviceId,
            @PathVariable Long deltaId) {
        Device device = deviceService.getDeviceByDeviceId(deviceId);
        firmwareDeltaService.incrementApplyCount(deltaId, false);
        return ApiResponse.success("Delta apply failure recorded");
    }
}
