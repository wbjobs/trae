package com.ota.platform.controller;

import com.ota.platform.dto.ApiResponse;
import com.ota.platform.dto.PageResult;
import com.ota.platform.entity.Device;
import com.ota.platform.service.DeviceService;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.data.domain.PageRequest;
import org.springframework.data.domain.Pageable;
import org.springframework.data.domain.Sort;
import org.springframework.web.bind.annotation.*;

import java.util.Map;

@RestController
@RequestMapping("/api/devices")
public class DeviceController {

    @Autowired
    private DeviceService deviceService;

    @PostMapping
    public ApiResponse<Device> createDevice(@RequestBody Device device) {
        Device savedDevice = deviceService.registerDevice(device);
        return ApiResponse.success("Device created successfully", savedDevice);
    }

    @GetMapping
    public ApiResponse<PageResult<Device>> getAllDevices(
            @RequestParam(defaultValue = "0") int page,
            @RequestParam(defaultValue = "20") int size,
            @RequestParam(required = false) String status,
            @RequestParam(required = false) Long groupId) {

        Pageable pageable = PageRequest.of(page, size, Sort.by(Sort.Direction.DESC, "createdAt"));
        PageResult<Device> result;

        if (status != null) {
            result = deviceService.getDevicesByStatus(status, pageable);
        } else if (groupId != null) {
            result = deviceService.getDevicesByGroup(groupId, pageable);
        } else {
            result = deviceService.getAllDevices(pageable);
        }

        return ApiResponse.success(result);
    }

    @GetMapping("/{id}")
    public ApiResponse<Device> getDeviceById(@PathVariable Long id) {
        Device device = deviceService.getDeviceById(id);
        return ApiResponse.success(device);
    }

    @GetMapping("/deviceId/{deviceId}")
    public ApiResponse<Device> getDeviceByDeviceId(@PathVariable String deviceId) {
        Device device = deviceService.getDeviceByDeviceId(deviceId);
        return ApiResponse.success(device);
    }

    @PutMapping("/{id}")
    public ApiResponse<Device> updateDevice(@PathVariable Long id, @RequestBody Device deviceDetails) {
        Device updatedDevice = deviceService.updateDevice(id, deviceDetails);
        return ApiResponse.success("Device updated successfully", updatedDevice);
    }

    @DeleteMapping("/{id}")
    public ApiResponse<Void> deleteDevice(@PathVariable Long id) {
        deviceService.deleteDevice(id);
        return ApiResponse.success("Device deleted successfully", null);
    }

    @PostMapping("/{id}/group/{groupId}")
    public ApiResponse<Device> assignToGroup(@PathVariable Long id, @PathVariable Long groupId) {
        Device device = deviceService.assignToGroup(id, groupId);
        return ApiResponse.success("Device assigned to group successfully", device);
    }

    @DeleteMapping("/{id}/group")
    public ApiResponse<Device> removeFromGroup(@PathVariable Long id) {
        Device device = deviceService.removeFromGroup(id);
        return ApiResponse.success("Device removed from group successfully", device);
    }

    @PostMapping("/heartbeat")
    public ApiResponse<Device> heartbeat(@RequestBody Map<String, String> request) {
        String deviceId = request.get("deviceId");
        Device device = deviceService.heartbeat(deviceId);
        return ApiResponse.success(device);
    }

    @PostMapping("/{deviceId}/firmware-version")
    public ApiResponse<Device> updateFirmwareVersion(@PathVariable String deviceId,
                                                     @RequestBody Map<String, String> request) {
        String firmwareVersion = request.get("firmwareVersion");
        Device device = deviceService.updateFirmwareVersion(deviceId, firmwareVersion);
        return ApiResponse.success("Firmware version updated successfully", device);
    }
}
