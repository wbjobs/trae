package com.power.sampling.device.service;

import com.baomidou.mybatisplus.core.conditions.query.QueryWrapper;
import com.baomidou.mybatisplus.core.metadata.IPage;
import com.baomidou.mybatisplus.extension.plugins.pagination.Page;
import com.power.sampling.device.mapper.DeviceMapper;
import com.power.sampling.common.dto.DeviceAbnormalDTO;
import com.power.sampling.common.entity.Device;
import com.power.sampling.common.exception.BusinessException;
import com.power.sampling.common.result.ResultCode;
import lombok.extern.slf4j.Slf4j;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.stereotype.Service;
import org.springframework.util.CollectionUtils;

import java.time.LocalDateTime;
import java.util.List;

@Slf4j
@Service
public class DeviceService {

    @Autowired
    private DeviceMapper deviceMapper;

    @Autowired
    private DeviceAbnormalService deviceAbnormalService;

    public Device getDeviceById(Long id) {
        Device device = deviceMapper.selectById(id);
        if (device == null) {
            throw new BusinessException(ResultCode.DEVICE_NOT_EXIST);
        }
        return device;
    }

    public Device getDeviceByCode(String deviceCode) {
        Device device = deviceMapper.selectOne(new QueryWrapper<Device>()
                .eq("device_code", deviceCode));
        if (device == null) {
            throw new BusinessException(ResultCode.DEVICE_NOT_EXIST);
        }
        return device;
    }

    public List<Device> getAllDevices() {
        return deviceMapper.selectList(null);
    }

    public List<Device> getOnlineDevices() {
        return deviceMapper.selectList(new QueryWrapper<Device>()
                .eq("status", 1));
    }

    public List<Device> getDeviceByIds(List<Long> deviceIds) {
        if (CollectionUtils.isEmpty(deviceIds)) {
            throw new BusinessException(ResultCode.BAD_REQUEST);
        }
        return deviceMapper.selectBatchIds(deviceIds);
    }

    public IPage<Device> getDevicePage(Integer pageNum, Integer pageSize, String deviceName, Integer status) {
        Page<Device> page = new Page<>(pageNum, pageSize);
        QueryWrapper<Device> wrapper = new QueryWrapper<>();
        if (deviceName != null) {
            wrapper.like("device_name", deviceName);
        }
        if (status != null) {
            wrapper.eq("status", status);
        }
        wrapper.orderByDesc("create_time");
        return deviceMapper.selectPage(page, wrapper);
    }

    public Boolean addDevice(Device device) {
        Device existDevice = deviceMapper.selectOne(new QueryWrapper<Device>()
                .eq("device_code", device.getDeviceCode()));
        if (existDevice != null) {
            throw new BusinessException(ResultCode.DEVICE_ALREADY_EXIST);
        }
        device.setCreateTime(LocalDateTime.now());
        device.setUpdateTime(LocalDateTime.now());
        device.setStatus(1);
        return deviceMapper.insert(device) > 0;
    }

    public Boolean updateDevice(Device device) {
        Device existDevice = deviceMapper.selectById(device.getId());
        if (existDevice == null) {
            throw new BusinessException(ResultCode.DEVICE_NOT_EXIST);
        }
        device.setUpdateTime(LocalDateTime.now());
        return deviceMapper.updateById(device) > 0;
    }

    public Boolean deleteDevice(Long id) {
        Device existDevice = deviceMapper.selectById(id);
        if (existDevice == null) {
            throw new BusinessException(ResultCode.DEVICE_NOT_EXIST);
        }
        return deviceMapper.deleteById(id) > 0;
    }

    public Boolean deviceHeartbeat(String deviceCode) {
        Device device = deviceMapper.selectOne(new QueryWrapper<Device>()
                .eq("device_code", deviceCode));
        if (device == null) {
            log.warn("心跳设备不存在: {}", deviceCode);
            return false;
        }
        device.setLastHeartbeat(LocalDateTime.now());
        if (device.getStatus() != 1) {
            device.setStatus(1);
            log.info("设备重新上线: {}", deviceCode);
        }
        device.setUpdateTime(LocalDateTime.now());
        return deviceMapper.updateById(device) > 0;
    }

    public Boolean updateDeviceStatus(String deviceCode, Integer status) {
        Device device = deviceMapper.selectOne(new QueryWrapper<Device>()
                .eq("device_code", deviceCode));
        if (device == null) {
            throw new BusinessException(ResultCode.DEVICE_NOT_EXIST);
        }
        device.setStatus(status);
        device.setUpdateTime(LocalDateTime.now());
        return deviceMapper.updateById(device) > 0;
    }

    public Boolean reportAbnormal(DeviceAbnormalDTO abnormalDTO) {
        Device device = deviceMapper.selectOne(new QueryWrapper<Device>()
                .eq("device_code", abnormalDTO.getDeviceCode()));
        if (device != null) {
            device.setStatus(2);
            device.setUpdateTime(LocalDateTime.now());
            deviceMapper.updateById(device);
            abnormalDTO.setDeviceId(device.getId());
        }
        return deviceAbnormalService.addAbnormal(abnormalDTO);
    }

    public List<Device> getDevicesByEdgeNode(String edgeNode) {
        return deviceMapper.selectList(new QueryWrapper<Device>()
                .eq("edge_node", edgeNode)
                .eq("status", 1));
    }
}
