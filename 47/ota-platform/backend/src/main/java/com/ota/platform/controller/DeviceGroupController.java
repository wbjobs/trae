package com.ota.platform.controller;

import com.ota.platform.dto.ApiResponse;
import com.ota.platform.entity.DeviceGroup;
import com.ota.platform.service.DeviceGroupService;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.web.bind.annotation.*;

import java.util.List;

@RestController
@RequestMapping("/api/device-groups")
public class DeviceGroupController {

    @Autowired
    private DeviceGroupService deviceGroupService;

    @PostMapping
    public ApiResponse<DeviceGroup> createGroup(@RequestBody DeviceGroup group) {
        DeviceGroup savedGroup = deviceGroupService.createGroup(group);
        return ApiResponse.success("Group created successfully", savedGroup);
    }

    @GetMapping
    public ApiResponse<List<DeviceGroup>> getAllGroups() {
        List<DeviceGroup> groups = deviceGroupService.getAllGroups();
        return ApiResponse.success(groups);
    }

    @GetMapping("/{id}")
    public ApiResponse<DeviceGroup> getGroupById(@PathVariable Long id) {
        DeviceGroup group = deviceGroupService.getGroupById(id);
        return ApiResponse.success(group);
    }

    @PutMapping("/{id}")
    public ApiResponse<DeviceGroup> updateGroup(@PathVariable Long id, @RequestBody DeviceGroup groupDetails) {
        DeviceGroup updatedGroup = deviceGroupService.updateGroup(id, groupDetails);
        return ApiResponse.success("Group updated successfully", updatedGroup);
    }

    @DeleteMapping("/{id}")
    public ApiResponse<Void> deleteGroup(@PathVariable Long id) {
        deviceGroupService.deleteGroup(id);
        return ApiResponse.success("Group deleted successfully", null);
    }
}
