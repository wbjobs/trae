package com.power.sampling.device.service;

import com.baomidou.mybatisplus.core.conditions.query.QueryWrapper;
import com.baomidou.mybatisplus.core.metadata.IPage;
import com.baomidou.mybatisplus.extension.plugins.pagination.Page;
import com.power.sampling.device.mapper.DeviceAbnormalMapper;
import com.power.sampling.common.dto.DeviceAbnormalDTO;
import com.power.sampling.common.entity.DeviceAbnormal;
import lombok.extern.slf4j.Slf4j;
import org.springframework.beans.BeanUtils;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.stereotype.Service;

import java.time.LocalDateTime;

@Slf4j
@Service
public class DeviceAbnormalService {

    @Autowired
    private DeviceAbnormalMapper deviceAbnormalMapper;

    public Boolean addAbnormal(DeviceAbnormalDTO abnormalDTO) {
        DeviceAbnormal abnormal = new DeviceAbnormal();
        BeanUtils.copyProperties(abnormalDTO, abnormal);
        if (abnormal.getReportTime() == null) {
            abnormal.setReportTime(LocalDateTime.now());
        }
        abnormal.setStatus(0);
        abnormal.setCreateTime(LocalDateTime.now());
        int result = deviceAbnormalMapper.insert(abnormal);
        log.info("设备异常上报成功: deviceCode={}, abnormalType={}",
                abnormalDTO.getDeviceCode(), abnormalDTO.getAbnormalType());
        return result > 0;
    }

    public IPage<DeviceAbnormal> getAbnormalPage(Integer pageNum, Integer pageSize,
                                                 String deviceCode, Integer status, Integer severity) {
        Page<DeviceAbnormal> page = new Page<>(pageNum, pageSize);
        QueryWrapper<DeviceAbnormal> wrapper = new QueryWrapper<>();
        if (deviceCode != null) {
            wrapper.eq("device_code", deviceCode);
        }
        if (status != null) {
            wrapper.eq("status", status);
        }
        if (severity != null) {
            wrapper.eq("severity", severity);
        }
        wrapper.orderByDesc("report_time");
        return deviceAbnormalMapper.selectPage(page, wrapper);
    }

    public Boolean handleAbnormal(Long id, String handler, String handleRemark) {
        DeviceAbnormal abnormal = deviceAbnormalMapper.selectById(id);
        if (abnormal == null) {
            return false;
        }
        abnormal.setStatus(1);
        abnormal.setHandler(handler);
        abnormal.setHandleRemark(handleRemark);
        abnormal.setHandleTime(LocalDateTime.now());
        return deviceAbnormalMapper.updateById(abnormal) > 0;
    }
}
