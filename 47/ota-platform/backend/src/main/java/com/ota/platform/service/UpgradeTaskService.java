package com.ota.platform.service;

import com.ota.platform.dto.PageResult;
import com.ota.platform.entity.Device;
import com.ota.platform.entity.DeviceGroup;
import com.ota.platform.entity.Firmware;
import com.ota.platform.entity.UpgradeProgress;
import com.ota.platform.entity.UpgradeTask;
import com.ota.platform.repository.DeviceRepository;
import com.ota.platform.repository.UpgradeProgressRepository;
import com.ota.platform.repository.UpgradeTaskRepository;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.data.domain.Pageable;
import org.springframework.scheduling.annotation.Scheduled;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

import java.time.LocalDateTime;
import java.util.ArrayList;
import java.util.Arrays;
import java.util.List;
import java.util.stream.Collectors;

@Service
public class UpgradeTaskService {

    @Autowired
    private UpgradeTaskRepository upgradeTaskRepository;

    @Autowired
    private UpgradeProgressRepository upgradeProgressRepository;

    @Autowired
    private DeviceRepository deviceRepository;

    @Autowired
    private FirmwareService firmwareService;

    @Autowired
    private DeviceGroupService deviceGroupService;

    @Autowired
    private DeviceService deviceService;

    @Transactional
    public UpgradeTask createUpgradeTask(UpgradeTask task, List<Long> deviceIds, Long groupId) {
        Firmware firmware = firmwareService.getFirmwareById(task.getFirmware().getId());

        if (!firmware.getIsPublished()) {
            throw new RuntimeException("Firmware is not published");
        }

        task.setFirmware(firmware);
        task.setStatus("PENDING");

        List<Device> targetDevices = new ArrayList<>();

        if ("GROUP".equals(task.getTargetType()) && groupId != null) {
            DeviceGroup group = deviceGroupService.getGroupById(groupId);
            targetDevices = deviceRepository.findByGroupId(groupId);
            task.setTargetIds(String.valueOf(groupId));
        } else if ("DEVICES".equals(task.getTargetType()) && deviceIds != null && !deviceIds.isEmpty()) {
            for (Long deviceId : deviceIds) {
                deviceRepository.findById(deviceId).ifPresent(targetDevices::add);
            }
            task.setTargetIds(deviceIds.stream().map(String::valueOf).collect(Collectors.joining(",")));
        } else if ("ALL".equals(task.getTargetType())) {
            targetDevices = deviceRepository.findByStatus("ONLINE");
            task.setTargetIds("ALL");
        }

        if (targetDevices.isEmpty()) {
            throw new RuntimeException("No target devices found");
        }

        int totalDevices = targetDevices.size();
        task.setTotalDevices(totalDevices);
        task.setPendingDevices(totalDevices);
        task.setUpgradingDevices(0);
        task.setSuccessDevices(0);
        task.setFailedDevices(0);
        task.setCancelledDevices(0);

        if (task.getIsGrayscale() && task.getGrayscalePercentage() > 0) {
            int grayscaleCount = (int) Math.ceil(totalDevices * task.getGrayscalePercentage() / 100.0);
            task.setGrayscaleDeviceCount(grayscaleCount);
        }

        UpgradeTask savedTask = upgradeTaskRepository.save(task);

        for (Device device : targetDevices) {
            UpgradeProgress progress = new UpgradeProgress();
            progress.setTask(savedTask);
            progress.setDevice(device);
            progress.setStatus("PENDING");
            progress.setProgressPercentage(0);
            progress.setOldVersion(device.getFirmwareVersion());
            progress.setNewVersion(firmware.getVersion());
            upgradeProgressRepository.save(progress);
        }

        if (task.getScheduleTime() == null) {
            executeTask(savedTask.getId());
        }

        return savedTask;
    }

    public UpgradeTask getTaskById(Long id) {
        return upgradeTaskRepository.findById(id)
                .orElseThrow(() -> new RuntimeException("Upgrade task not found with id: " + id));
    }

    public PageResult<UpgradeTask> getAllTasks(Pageable pageable) {
        return PageResult.from(upgradeTaskRepository.findAll(pageable));
    }

    public PageResult<UpgradeTask> getTasksByStatus(String status, Pageable pageable) {
        return PageResult.from(upgradeTaskRepository.findByStatus(status, pageable));
    }

    public PageResult<UpgradeTask> getTasksByFirmware(Long firmwareId, Pageable pageable) {
        return PageResult.from(upgradeTaskRepository.findByFirmwareId(firmwareId, pageable));
    }

    public PageResult<UpgradeProgress> getTaskProgress(Long taskId, Pageable pageable) {
        return PageResult.from(upgradeProgressRepository.findByTaskId(taskId, pageable));
    }

    public List<UpgradeProgress> getTaskProgressList(Long taskId) {
        return upgradeProgressRepository.findByTaskId(taskId);
    }

    @Transactional
    public UpgradeTask executeTask(Long taskId) {
        UpgradeTask task = getTaskById(taskId);

        if (!"PENDING".equals(task.getStatus()) && !"SCHEDULED".equals(task.getStatus())) {
            throw new RuntimeException("Task cannot be executed. Current status: " + task.getStatus());
        }

        task.setStatus("RUNNING");
        task.setStartTime(LocalDateTime.now());

        List<UpgradeProgress> progresses = upgradeProgressRepository.findByTaskId(taskId);

        int devicesToUpgrade = task.getTotalDevices();
        if (task.getIsGrayscale() && task.getGrayscaleDeviceCount() > 0) {
            devicesToUpgrade = Math.min(task.getGrayscaleDeviceCount(), progresses.size());
        }

        for (int i = 0; i < devicesToUpgrade; i++) {
            UpgradeProgress progress = progresses.get(i);
            progress.setStatus("UPGRADING");
            progress.setStartTime(LocalDateTime.now());
            progress.setCurrentStage("DOWNLOADING");
            upgradeProgressRepository.save(progress);
        }

        task.setPendingDevices(task.getTotalDevices() - devicesToUpgrade);
        task.setUpgradingDevices(devicesToUpgrade);

        return upgradeTaskRepository.save(task);
    }

    @Transactional
    public UpgradeProgress updateProgress(Long progressId, String status, Integer progressPercentage,
                                          String currentStage, Long downloadedSize, String errorMessage, String errorCode) {
        UpgradeProgress progress = upgradeProgressRepository.findById(progressId)
                .orElseThrow(() -> new RuntimeException("Upgrade progress not found with id: " + progressId));

        if (status != null) {
            progress.setStatus(status);
        }
        if (progressPercentage != null) {
            progress.setProgressPercentage(progressPercentage);
        }
        if (currentStage != null) {
            progress.setCurrentStage(currentStage);
        }
        if (downloadedSize != null) {
            progress.setDownloadedSize(downloadedSize);
        }
        if (errorMessage != null) {
            progress.setErrorMessage(errorMessage);
        }
        if (errorCode != null) {
            progress.setErrorCode(errorCode);
        }

        progress.setLastProgressUpdate(LocalDateTime.now());

        if ("DOWNLOADING".equals(currentStage) && progress.getBackupVersion() == null) {
            progress.setBackupVersion(progress.getDevice().getFirmwareVersion());
            progress.setCanResume(true);
        }

        if ("SUCCESS".equals(status) || "FAILED".equals(status)) {
            progress.setEndTime(LocalDateTime.now());
            if (progress.getStartTime() != null) {
                progress.setDurationSeconds(java.time.Duration.between(progress.getStartTime(), progress.getEndTime()).getSeconds());
            }

            UpgradeTask task = progress.getTask();
            task.setUpgradingDevices(task.getUpgradingDevices() - 1);

            if ("SUCCESS".equals(status)) {
                task.setSuccessDevices(task.getSuccessDevices() + 1);
                deviceService.updateFirmwareVersion(progress.getDevice().getDeviceId(), progress.getNewVersion());
                firmwareService.incrementUpgradeCount(task.getFirmware().getId(), true);
                progress.setIsRollbackNeeded(false);
                progress.setCanResume(false);
            } else if ("FAILED".equals(status)) {
                task.setFailedDevices(task.getFailedDevices() + 1);
                firmwareService.incrementUpgradeCount(task.getFirmware().getId(), false);
                progress.setIsRollbackNeeded(true);
            }

            if (task.getUpgradingDevices() == 0 && task.getPendingDevices() == 0) {
                task.setStatus("COMPLETED");
                task.setEndTime(LocalDateTime.now());
            }

            upgradeTaskRepository.save(task);
        }

        return upgradeProgressRepository.save(progress);
    }

    @Transactional
    public UpgradeProgress checkAndRecoverInterruptedUpgrade(Long deviceId) {
        List<UpgradeProgress> activeProgresses = upgradeProgressRepository.findActiveUpgradeByDevice(deviceId);
        if (activeProgresses.isEmpty()) {
            return null;
        }

        UpgradeProgress progress = activeProgresses.get(0);

        if ("UPGRADING".equals(progress.getStatus())) {
            progress.setWasInterrupted(true);
            progress.setInterruptionStage(progress.getCurrentStage());
            progress.setIsRollbackNeeded(true);
            progress.setLastProgressUpdate(LocalDateTime.now());
            return upgradeProgressRepository.save(progress);
        }

        return null;
    }

    @Transactional
    public UpgradeProgress initiateRollback(Long progressId) {
        UpgradeProgress progress = upgradeProgressRepository.findById(progressId)
                .orElseThrow(() -> new RuntimeException("Upgrade progress not found with id: " + progressId));

        if (!progress.getIsRollbackNeeded()) {
            throw new RuntimeException("No rollback needed for this progress");
        }

        if (progress.getBackupVersion() == null) {
            progress.setIsRollbackNeeded(false);
            progress.setStatus("FAILED");
            progress.setErrorMessage("No backup version available for rollback");
            return upgradeProgressRepository.save(progress);
        }

        progress.setIsRollbackInProgress(true);
        progress.setRollbackStage("INITIATED");
        progress.setLastProgressUpdate(LocalDateTime.now());

        return upgradeProgressRepository.save(progress);
    }

    @Transactional
    public UpgradeProgress updateRollbackProgress(Long progressId, String rollbackStage, String errorMessage, Boolean isSuccess) {
        UpgradeProgress progress = upgradeProgressRepository.findById(progressId)
                .orElseThrow(() -> new RuntimeException("Upgrade progress not found with id: " + progressId));

        progress.setRollbackStage(rollbackStage);
        progress.setLastProgressUpdate(LocalDateTime.now());

        if (errorMessage != null) {
            progress.setRollbackErrorMessage(errorMessage);
        }

        if (isSuccess != null && isSuccess) {
            progress.setIsRollbackInProgress(false);
            progress.setIsRollbackNeeded(false);
            progress.setStatus("ROLLED_BACK");
            progress.setEndTime(LocalDateTime.now());
            if (progress.getStartTime() != null) {
                progress.setDurationSeconds(java.time.Duration.between(progress.getStartTime(), progress.getEndTime()).getSeconds());
            }
            deviceService.updateFirmwareVersion(progress.getDevice().getDeviceId(), progress.getBackupVersion());

            UpgradeTask task = progress.getTask();
            task.setUpgradingDevices(task.getUpgradingDevices() - 1);
            task.setFailedDevices(task.getFailedDevices() + 1);
            if (task.getUpgradingDevices() == 0 && task.getPendingDevices() == 0) {
                task.setStatus("COMPLETED");
                task.setEndTime(LocalDateTime.now());
            }
            upgradeTaskRepository.save(task);
        } else if (isSuccess != null && !isSuccess) {
            progress.setIsRollbackInProgress(false);
            progress.setStatus("ROLLBACK_FAILED");
            progress.setEndTime(LocalDateTime.now());
        }

        return upgradeProgressRepository.save(progress);
    }

    @Transactional
    public UpgradeProgress resumeUpgrade(Long progressId) {
        UpgradeProgress progress = upgradeProgressRepository.findById(progressId)
                .orElseThrow(() -> new RuntimeException("Upgrade progress not found with id: " + progressId));

        if (!progress.getCanResume()) {
            throw new RuntimeException("This upgrade cannot be resumed");
        }

        if (progress.getResumeCount() >= progress.getMaxResumeAttempts()) {
            progress.setIsRollbackNeeded(true);
            progress.setCanResume(false);
            progress.setErrorMessage("Max resume attempts reached");
            upgradeProgressRepository.save(progress);
            return initiateRollback(progressId);
        }

        progress.setResumeCount(progress.getResumeCount() + 1);
        progress.setStatus("UPGRADING");
        progress.setWasInterrupted(false);
        progress.setInterruptionStage(null);
        progress.setCurrentStage("RESUMING");
        progress.setLastProgressUpdate(LocalDateTime.now());

        return upgradeProgressRepository.save(progress);
    }

    @Transactional
    public UpgradeProgress retryUpgrade(Long progressId) {
        UpgradeProgress progress = upgradeProgressRepository.findById(progressId)
                .orElseThrow(() -> new RuntimeException("Upgrade progress not found with id: " + progressId));

        if (progress.getRetryCount() >= 3) {
            progress.setIsRollbackNeeded(true);
            progress.setErrorMessage("Max retry attempts reached");
            upgradeProgressRepository.save(progress);
            return initiateRollback(progressId);
        }

        progress.setRetryCount(progress.getRetryCount() + 1);
        progress.setStatus("UPGRADING");
        progress.setProgressPercentage(0);
        progress.setCurrentStage("DOWNLOADING");
        progress.setDownloadedSize(0L);
        progress.setErrorMessage(null);
        progress.setErrorCode(null);
        progress.setStartTime(LocalDateTime.now());
        progress.setEndTime(null);
        progress.setDurationSeconds(null);
        progress.setCanResume(true);
        progress.setLastProgressUpdate(LocalDateTime.now());

        if (progress.getBackupVersion() == null) {
            progress.setBackupVersion(progress.getOldVersion());
        }

        return upgradeProgressRepository.save(progress);
    }

    @Scheduled(fixedRate = 120000)
    @Transactional
    public void checkStuckUpgrades() {
        LocalDateTime timeout = LocalDateTime.now().minusMinutes(10);
        List<UpgradeProgress> stuckProgresses = upgradeProgressRepository.findStuckUpgradingProgress(timeout);

        for (UpgradeProgress progress : stuckProgresses) {
            if (progress.getCanResume() && progress.getResumeCount() < progress.getMaxResumeAttempts()) {
                resumeUpgrade(progress.getId());
            } else {
                progress.setWasInterrupted(true);
                progress.setInterruptionStage(progress.getCurrentStage());
                progress.setIsRollbackNeeded(true);
                progress.setStatus("FAILED");
                progress.setErrorMessage("Upgrade timed out - no progress update for 10 minutes");
                upgradeProgressRepository.save(progress);
                initiateRollback(progress.getId());
            }
        }
    }

    public List<UpgradeProgress> getDeviceUpgradeHistory(Long deviceId) {
        return upgradeProgressRepository.findByDeviceId(deviceId);
    }

    @Transactional
    public UpgradeTask cancelTask(Long taskId) {
        UpgradeTask task = getTaskById(taskId);

        if ("COMPLETED".equals(task.getStatus()) || "CANCELLED".equals(task.getStatus())) {
            throw new RuntimeException("Task cannot be cancelled. Current status: " + task.getStatus());
        }

        task.setStatus("CANCELLED");
        task.setEndTime(LocalDateTime.now());

        List<UpgradeProgress> progresses = upgradeProgressRepository.findByTaskIdAndStatus(taskId, "UPGRADING");
        for (UpgradeProgress progress : progresses) {
            progress.setStatus("CANCELLED");
            progress.setEndTime(LocalDateTime.now());
            progress.setErrorMessage("Task cancelled by user");
            upgradeProgressRepository.save(progress);
        }

        task.setCancelledDevices((int) upgradeProgressRepository.countByTaskIdAndStatus(taskId, "CANCELLED"));

        return upgradeTaskRepository.save(task);
    }

    @Scheduled(fixedRate = 60000)
    @Transactional
    public void checkScheduledTasks() {
        List<UpgradeTask> tasks = upgradeTaskRepository.findScheduledTasksToExecute(LocalDateTime.now());
        for (UpgradeTask task : tasks) {
            try {
                executeTask(task.getId());
            } catch (Exception e) {
                task.setStatus("FAILED");
                task.setEndTime(LocalDateTime.now());
                upgradeTaskRepository.save(task);
            }
        }
    }

    @Transactional
    public UpgradeTask continueGrayscaleTask(Long taskId) {
        UpgradeTask task = getTaskById(taskId);

        if (!"RUNNING".equals(task.getStatus()) || !task.getIsGrayscale()) {
            throw new RuntimeException("Task is not a running grayscale task");
        }

        if (task.getPendingDevices() == 0) {
            throw new RuntimeException("No more devices to upgrade");
        }

        List<UpgradeProgress> pendingProgresses = upgradeProgressRepository.findByTaskIdAndStatus(taskId, "PENDING");
        int count = Math.min(task.getGrayscaleDeviceCount(), pendingProgresses.size());

        for (int i = 0; i < count; i++) {
            UpgradeProgress progress = pendingProgresses.get(i);
            progress.setStatus("UPGRADING");
            progress.setStartTime(LocalDateTime.now());
            progress.setCurrentStage("DOWNLOADING");
            upgradeProgressRepository.save(progress);
        }

        task.setPendingDevices(task.getPendingDevices() - count);
        task.setUpgradingDevices(task.getUpgradingDevices() + count);

        return upgradeTaskRepository.save(task);
    }

    public long getTotalTaskCount() {
        return upgradeTaskRepository.count();
    }

    public List<Object[]> getTaskCountByStatus() {
        return upgradeTaskRepository.countByStatus();
    }

    public Object[] getTotalUpgradeResult() {
        return upgradeTaskRepository.getTotalUpgradeResult();
    }

    public List<Object[]> getTaskCountByDate(LocalDateTime startDate) {
        return upgradeTaskRepository.getTaskCountByDate(startDate);
    }
}
