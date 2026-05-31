package com.power.sampling.device.service;

import com.baomidou.mybatisplus.core.conditions.query.QueryWrapper;
import com.baomidou.mybatisplus.core.metadata.IPage;
import com.baomidou.mybatisplus.extension.plugins.pagination.Page;
import com.power.sampling.device.mapper.DeviceAlertMapper;
import com.power.sampling.device.mapper.DeviceThresholdMapper;
import com.power.sampling.common.dto.ThresholdCheckDTO;
import com.power.sampling.common.entity.DeviceAlert;
import com.power.sampling.common.entity.DeviceThreshold;
import lombok.extern.slf4j.Slf4j;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.stereotype.Service;
import org.springframework.util.CollectionUtils;

import java.math.BigDecimal;
import java.time.LocalDateTime;
import java.util.ArrayList;
import java.util.List;

@Slf4j
@Service
public class DeviceThresholdService {

    @Autowired
    private DeviceThresholdMapper deviceThresholdMapper;

    @Autowired
    private DeviceAlertMapper deviceAlertMapper;

    public DeviceThreshold getByDeviceId(Long deviceId) {
        return deviceThresholdMapper.selectOne(new QueryWrapper<DeviceThreshold>()
                .eq("device_id", deviceId)
                .eq("enable_status", 1));
    }

    public DeviceThreshold getByDeviceCode(String deviceCode) {
        return deviceThresholdMapper.selectOne(new QueryWrapper<DeviceThreshold>()
                .eq("device_code", deviceCode)
                .eq("enable_status", 1));
    }

    public IPage<DeviceThreshold> getThresholdPage(Integer pageNum, Integer pageSize,
                                                   Long deviceId, Integer enableStatus, Integer alertLevel) {
        Page<DeviceThreshold> page = new Page<>(pageNum, pageSize);
        QueryWrapper<DeviceThreshold> wrapper = new QueryWrapper<>();
        if (deviceId != null) {
            wrapper.eq("device_id", deviceId);
        }
        if (enableStatus != null) {
            wrapper.eq("enable_status", enableStatus);
        }
        if (alertLevel != null) {
            wrapper.eq("alert_level", alertLevel);
        }
        wrapper.orderByDesc("create_time");
        return deviceThresholdMapper.selectPage(page, wrapper);
    }

    public Boolean saveThreshold(DeviceThreshold threshold) {
        DeviceThreshold existThreshold = deviceThresholdMapper.selectOne(new QueryWrapper<DeviceThreshold>()
                .eq("device_id", threshold.getDeviceId()));
        if (existThreshold != null) {
            threshold.setId(existThreshold.getId());
            threshold.setUpdateTime(LocalDateTime.now());
            return deviceThresholdMapper.updateById(threshold) > 0;
        } else {
            threshold.setCreateTime(LocalDateTime.now());
            threshold.setUpdateTime(LocalDateTime.now());
            return deviceThresholdMapper.insert(threshold) > 0;
        }
    }

    public Boolean updateThreshold(DeviceThreshold threshold) {
        threshold.setUpdateTime(LocalDateTime.now());
        return deviceThresholdMapper.updateById(threshold) > 0;
    }

    public Boolean deleteThreshold(Long id) {
        return deviceThresholdMapper.deleteById(id) > 0;
    }

    public List<DeviceAlert> checkThreshold(ThresholdCheckDTO checkDTO) {
        List<DeviceAlert> alerts = new ArrayList<>();
        DeviceThreshold threshold = getByDeviceId(checkDTO.getDeviceId());
        if (threshold == null) {
            threshold = getByDeviceCode(checkDTO.getDeviceCode());
        }
        if (threshold == null) {
            return alerts;
        }

        if (checkDTO.getVoltage() != null) {
            if (threshold.getMaxVoltage() != null && checkDTO.getVoltage().compareTo(threshold.getMaxVoltage()) > 0) {
                alerts.add(createAlert(checkDTO.getDeviceId(), checkDTO.getDeviceCode(),
                        1, threshold.getAlertLevel(), "电压过高",
                        "实际电压 " + checkDTO.getVoltage() + "V 超过阈值 " + threshold.getMaxVoltage() + "V",
                        threshold.getMaxVoltage(), checkDTO.getVoltage()));
            }
            if (threshold.getMinVoltage() != null && checkDTO.getVoltage().compareTo(threshold.getMinVoltage()) < 0) {
                alerts.add(createAlert(checkDTO.getDeviceId(), checkDTO.getDeviceCode(),
                        1, threshold.getAlertLevel(), "电压过低",
                        "实际电压 " + checkDTO.getVoltage() + "V 低于阈值 " + threshold.getMinVoltage() + "V",
                        threshold.getMinVoltage(), checkDTO.getVoltage()));
            }
        }

        if (checkDTO.getCurrent() != null) {
            if (threshold.getMaxCurrent() != null && checkDTO.getCurrent().compareTo(threshold.getMaxCurrent()) > 0) {
                alerts.add(createAlert(checkDTO.getDeviceId(), checkDTO.getDeviceCode(),
                        2, threshold.getAlertLevel(), "电流过高",
                        "实际电流 " + checkDTO.getCurrent() + "A 超过阈值 " + threshold.getMaxCurrent() + "A",
                        threshold.getMaxCurrent(), checkDTO.getCurrent()));
            }
            if (threshold.getMinCurrent() != null && checkDTO.getCurrent().compareTo(threshold.getMinCurrent()) < 0) {
                alerts.add(createAlert(checkDTO.getDeviceId(), checkDTO.getDeviceCode(),
                        2, threshold.getAlertLevel(), "电流过低",
                        "实际电流 " + checkDTO.getCurrent() + "A 低于阈值 " + threshold.getMinCurrent() + "A",
                        threshold.getMinCurrent(), checkDTO.getCurrent()));
            }
        }

        if (checkDTO.getPower() != null) {
            if (threshold.getMaxPower() != null && checkDTO.getPower().compareTo(threshold.getMaxPower()) > 0) {
                alerts.add(createAlert(checkDTO.getDeviceId(), checkDTO.getDeviceCode(),
                        3, threshold.getAlertLevel(), "功率过高",
                        "实际功率 " + checkDTO.getPower() + "W 超过阈值 " + threshold.getMaxPower() + "W",
                        threshold.getMaxPower(), checkDTO.getPower()));
            }
            if (threshold.getMinPower() != null && checkDTO.getPower().compareTo(threshold.getMinPower()) < 0) {
                alerts.add(createAlert(checkDTO.getDeviceId(), checkDTO.getDeviceCode(),
                        3, threshold.getAlertLevel(), "功率过低",
                        "实际功率 " + checkDTO.getPower() + "W 低于阈值 " + threshold.getMinPower() + "W",
                        threshold.getMinPower(), checkDTO.getPower()));
            }
        }

        if (checkDTO.getTemperature() != null && threshold.getMaxTemperature() != null
                && checkDTO.getTemperature().compareTo(threshold.getMaxTemperature()) > 0) {
            alerts.add(createAlert(checkDTO.getDeviceId(), checkDTO.getDeviceCode(),
                    4, threshold.getAlertLevel(), "温度过高",
                    "实际温度 " + checkDTO.getTemperature() + "°C 超过阈值 " + threshold.getMaxTemperature() + "°C",
                    threshold.getMaxTemperature(), checkDTO.getTemperature()));
        }

        if (checkDTO.getHumidity() != null && threshold.getMaxHumidity() != null
                && checkDTO.getHumidity().compareTo(threshold.getMaxHumidity()) > 0) {
            alerts.add(createAlert(checkDTO.getDeviceId(), checkDTO.getDeviceCode(),
                    5, threshold.getAlertLevel(), "湿度过高",
                    "实际湿度 " + checkDTO.getHumidity() + "% 超过阈值 " + threshold.getMaxHumidity() + "%",
                    threshold.getMaxHumidity(), checkDTO.getHumidity()));
        }

        if (!CollectionUtils.isEmpty(alerts)) {
            for (DeviceAlert alert : alerts) {
                deviceAlertMapper.insert(alert);
                log.warn("设备阈值告警: deviceCode={}, alertType={}, level={}, message={}",
                        alert.getDeviceCode(), alert.getAlertType(), alert.getAlertLevel(), alert.getAlertMessage());
            }
        }

        return alerts;
    }

    private DeviceAlert createAlert(Long deviceId, String deviceCode, Integer alertType, Integer alertLevel,
                                    String title, String message, BigDecimal thresholdValue, BigDecimal actualValue) {
        DeviceAlert alert = new DeviceAlert();
        alert.setDeviceId(deviceId);
        alert.setDeviceCode(deviceCode);
        alert.setAlertType(alertType);
        alert.setAlertLevel(alertLevel);
        alert.setAlertTitle(title);
        alert.setAlertMessage(message);
        alert.setThresholdValue(thresholdValue);
        alert.setActualValue(actualValue);
        alert.setStatus(0);
        alert.setAlertTime(LocalDateTime.now());
        alert.setCreateTime(LocalDateTime.now());
        return alert;
    }

    public IPage<DeviceAlert> getAlertPage(Integer pageNum, Integer pageSize,
                                           Long deviceId, Integer status, Integer alertLevel, Integer alertType) {
        Page<DeviceAlert> page = new Page<>(pageNum, pageSize);
        QueryWrapper<DeviceAlert> wrapper = new QueryWrapper<>();
        if (deviceId != null) {
            wrapper.eq("device_id", deviceId);
        }
        if (status != null) {
            wrapper.eq("status", status);
        }
        if (alertLevel != null) {
            wrapper.eq("alert_level", alertLevel);
        }
        if (alertType != null) {
            wrapper.eq("alert_type", alertType);
        }
        wrapper.orderByDesc("alert_time");
        return deviceAlertMapper.selectPage(page, wrapper);
    }

    public Boolean resolveAlert(Long id, String resolver, String resolveRemark) {
        DeviceAlert alert = deviceAlertMapper.selectById(id);
        if (alert == null) {
            return false;
        }
        alert.setStatus(1);
        alert.setResolver(resolver);
        alert.setResolveRemark(resolveRemark);
        alert.setResolveTime(LocalDateTime.now());
        return deviceAlertMapper.updateById(alert) > 0;
    }

    public List<DeviceAlert> batchCheckThreshold(List<ThresholdCheckDTO> checkDTOList) {
        List<DeviceAlert> allAlerts = new ArrayList<>();
        for (ThresholdCheckDTO checkDTO : checkDTOList) {
            try {
                List<DeviceAlert> alerts = checkThreshold(checkDTO);
                if (!CollectionUtils.isEmpty(alerts)) {
                    allAlerts.addAll(alerts);
                }
            } catch (Exception e) {
                log.error("批量阈值检查异常: deviceCode={}", checkDTO.getDeviceCode(), e);
            }
        }
        return allAlerts;
    }
}
