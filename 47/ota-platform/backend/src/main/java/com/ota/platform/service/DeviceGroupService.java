package com.ota.platform.service;

import com.ota.platform.entity.DeviceGroup;
import com.ota.platform.repository.DeviceGroupRepository;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

import java.util.List;

@Service
public class DeviceGroupService {

    @Autowired
    private DeviceGroupRepository deviceGroupRepository;

    @Transactional
    public DeviceGroup createGroup(DeviceGroup group) {
        if (deviceGroupRepository.existsByName(group.getName())) {
            throw new RuntimeException("Group name already exists: " + group.getName());
        }
        group.setDeviceCount(0);
        return deviceGroupRepository.save(group);
    }

    public DeviceGroup getGroupById(Long id) {
        return deviceGroupRepository.findById(id)
                .orElseThrow(() -> new RuntimeException("Group not found with id: " + id));
    }

    public List<DeviceGroup> getAllGroups() {
        return deviceGroupRepository.findAll();
    }

    @Transactional
    public DeviceGroup updateGroup(Long id, DeviceGroup groupDetails) {
        DeviceGroup group = getGroupById(id);
        if (!group.getName().equals(groupDetails.getName()) &&
                deviceGroupRepository.existsByName(groupDetails.getName())) {
            throw new RuntimeException("Group name already exists: " + groupDetails.getName());
        }
        group.setName(groupDetails.getName());
        group.setDescription(groupDetails.getDescription());
        return deviceGroupRepository.save(group);
    }

    @Transactional
    public void deleteGroup(Long id) {
        DeviceGroup group = getGroupById(id);
        if (group.getDeviceCount() > 0) {
            throw new RuntimeException("Cannot delete group with devices");
        }
        deviceGroupRepository.delete(group);
    }

    public long getTotalGroupCount() {
        return deviceGroupRepository.count();
    }
}
