package com.power.sampling.device.task;

import com.baomidou.mybatisplus.core.conditions.query.QueryWrapper;
import com.power.sampling.device.mapper.DeviceMapper;
import com.power.sampling.common.entity.Device;
import lombok.extern.slf4j.Slf4j;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.scheduling.annotation.Scheduled;
import org.springframework.stereotype.Component;

import java.time.LocalDateTime;
import java.util.List;

@Slf4j
@Component
public class DeviceStatusCheckTask {

    @Autowired
    private DeviceMapper deviceMapper;

    @Scheduled(cron = "0 */5 * * * ?")
    public void checkDeviceStatus() {
        log.info("开始检查设备在线状态...");

        LocalDateTime timeoutTime = LocalDateTime.now().minusMinutes(10);
        List<Device> onlineDevices = deviceMapper.selectList(new QueryWrapper<Device>()
                .eq("status", 1));

        int offlineCount = 0;
        for (Device device : onlineDevices) {
            if (device.getLastHeartbeat() == null || device.getLastHeartbeat().isBefore(timeoutTime)) {
                device.setStatus(0);
                device.setUpdateTime(LocalDateTime.now());
                deviceMapper.updateById(device);
                offlineCount++;
                log.warn("设备超时离线: deviceCode={}, lastHeartbeat={}",
                        device.getDeviceCode(), device.getLastHeartbeat());
            }
        }

        log.info("设备状态检查完成, 离线设备数: {}", offlineCount);
    }
}
