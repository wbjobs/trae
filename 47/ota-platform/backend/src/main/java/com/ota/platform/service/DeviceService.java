package com.ota.platform.service;

import com.ota.platform.dto.PageResult;
import com.ota.platform.entity.Device;
import com.ota.platform.entity.DeviceGroup;
import com.ota.platform.entity.UpgradeProgress;
import com.ota.platform.repository.DeviceRepository;
import com.ota.platform.repository.DeviceGroupRepository;
import com.ota.platform.repository.UpgradeProgressRepository;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.beans.factory.annotation.Value;
import org.springframework.data.domain.Page;
import org.springframework.data.domain.Pageable;
import org.springframework.scheduling.annotation.Scheduled;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

import java.time.LocalDateTime;
import java.util.List;
import java.util.Optional;
import java.util.UUID;

@Service
public class DeviceService {

    @Autowired
    private DeviceRepository deviceRepository;

    @Autowired
    private DeviceGroupRepository deviceGroupRepository;

    @Autowired
    private UpgradeProgressRepository upgradeProgressRepository;

    @Value("${ota.device.heartbeat-timeout-seconds:120}")
    private int heartbeatTimeoutSeconds;

    @Transactional
    public Device registerDevice(Device device) {
        if (deviceRepository.existsByDeviceId(device.getDeviceId())) {
            throw new RuntimeException("Device ID already exists: " + device.getDeviceId());
        }
        device.setApiKey(generateApiKey());
        device.setStatus("OFFLINE");
        device.setIsActive(true);
        return deviceRepository.save(device);
    }

    @Transactional
    public Device registerDevice(String deviceId, String name, String model, String publicKey) {
        Device device = new Device();
        device.setDeviceId(deviceId);
        device.setName(name);
        device.setModel(model);
        device.setPublicKey(publicKey);
        return registerDevice(device);
    }

    public Device getDeviceById(Long id) {
        return deviceRepository.findById(id)
                .orElseThrow(() -> new RuntimeException("Device not found with id: " + id));
    }

    public Device getDeviceByDeviceId(String deviceId) {
        return deviceRepository.findByDeviceId(deviceId)
                .orElseThrow(() -> new RuntimeException("Device not found with deviceId: " + deviceId));
    }

    public PageResult<Device> getAllDevices(Pageable pageable) {
        return PageResult.from(deviceRepository.findAll(pageable));
    }

    public PageResult<Device> getDevicesByStatus(String status, Pageable pageable) {
        return PageResult.from(deviceRepository.findByStatus(status, pageable));
    }

    public PageResult<Device> getDevicesByGroup(Long groupId, Pageable pageable) {
        return PageResult.from(deviceRepository.findByGroupId(groupId, pageable));
    }

    @Transactional
    public Device updateDevice(Long id, Device deviceDetails) {
        Device device = getDeviceById(id);
        device.setName(deviceDetails.getName());
        device.setDescription(deviceDetails.getDescription());
        device.setModel(deviceDetails.getModel());
        device.setManufacturer(deviceDetails.getManufacturer());
        device.setHardwareVersion(deviceDetails.getHardwareVersion());
        device.setSerialNumber(deviceDetails.getSerialNumber());
        device.setMacAddress(deviceDetails.getMacAddress());
        device.setPublicKey(deviceDetails.getPublicKey());
        device.setIsActive(deviceDetails.getIsActive());
        return deviceRepository.save(device);
    }

    @Transactional
    public void deleteDevice(Long id) {
        Device device = getDeviceById(id);
        if (device.getGroup() != null) {
            DeviceGroup group = device.getGroup();
            group.setDeviceCount(group.getDeviceCount() - 1);
            deviceGroupRepository.save(group);
        }
        deviceRepository.delete(device);
    }

    @Transactional
    public Device heartbeat(String deviceId) {
        Device device = getDeviceByDeviceId(deviceId);
        device.setLastHeartbeat(LocalDateTime.now());
        device.setStatus("ONLINE");
        Device savedDevice = deviceRepository.save(device);

        checkAndRecoverInterruptedUpgrade(device.getId());

        return savedDevice;
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

    public List<UpgradeProgress> getDeviceUpgradeHistory(Long deviceId) {
        return upgradeProgressRepository.findByDeviceId(deviceId);
    }

    @Transactional
    public Device updateFirmwareVersion(String deviceId, String firmwareVersion) {
        Device device = getDeviceByDeviceId(deviceId);
        device.setFirmwareVersion(firmwareVersion);
        return deviceRepository.save(device);
    }

    @Transactional
    public Device assignToGroup(Long deviceId, Long groupId) {
        Device device = getDeviceById(deviceId);
        DeviceGroup newGroup = deviceGroupRepository.findById(groupId)
                .orElseThrow(() -> new RuntimeException("Group not found with id: " + groupId));

        if (device.getGroup() != null) {
            DeviceGroup oldGroup = device.getGroup();
            oldGroup.setDeviceCount(oldGroup.getDeviceCount() - 1);
            deviceGroupRepository.save(oldGroup);
        }

        device.setGroup(newGroup);
        newGroup.setDeviceCount(newGroup.getDeviceCount() + 1);
        deviceGroupRepository.save(newGroup);
        return deviceRepository.save(device);
    }

    @Transactional
    public Device removeFromGroup(Long deviceId) {
        Device device = getDeviceById(deviceId);
        if (device.getGroup() != null) {
            DeviceGroup group = device.getGroup();
            group.setDeviceCount(group.getDeviceCount() - 1);
            deviceGroupRepository.save(group);
        }
        device.setGroup(null);
        return deviceRepository.save(device);
    }

    @Scheduled(fixedRate = 60000)
    @Transactional
    public void checkDeviceStatus() {
        LocalDateTime timeout = LocalDateTime.now().minusSeconds(heartbeatTimeoutSeconds);
        List<Device> devices = deviceRepository.findDevicesWithExpiredHeartbeat(timeout);
        for (Device device : devices) {
            if ("ONLINE".equals(device.getStatus())) {
                device.setStatus("OFFLINE");
                deviceRepository.save(device);
            }
        }
    }

    public boolean validateApiKey(String deviceId, String apiKey) {
        Optional<Device> deviceOpt = deviceRepository.findByDeviceId(deviceId);
        return deviceOpt.map(device -> apiKey.equals(device.getApiKey())).orElse(false);
    }

    private String generateApiKey() {
        return UUID.randomUUID().toString().replace("-", "");
    }

    public long getTotalDeviceCount() {
        return deviceRepository.count();
    }

    public long getOnlineDeviceCount() {
        return deviceRepository.countByStatus("ONLINE");
    }

    public List<Object[]> getDeviceCountByStatus() {
        return deviceRepository.countByStatus();
    }

    public List<Object[]> getDeviceCountByFirmwareVersion() {
        return deviceRepository.countByFirmwareVersion();
    }

    public Device authenticateDevice(String deviceId, String apiKey) {
        Device device = getDeviceByDeviceId(deviceId);
        if (!apiKey.equals(device.getApiKey())) {
            throw new RuntimeException("Invalid API key");
        }
        if (!device.getIsActive()) {
            throw new RuntimeException("Device is not active");
        }
        return device;
    }
}
