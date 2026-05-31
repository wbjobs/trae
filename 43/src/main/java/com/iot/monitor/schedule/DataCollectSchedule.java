package com.iot.monitor.schedule;

import com.baomidou.mybatisplus.core.conditions.query.LambdaQueryWrapper;
import com.iot.monitor.dto.DeviceData;
import com.iot.monitor.entity.Device;
import com.iot.monitor.mapper.DeviceMapper;
import com.iot.monitor.modbus.ModbusDataCollector;
import com.iot.monitor.service.AlarmService;
import com.iot.monitor.service.DataBufferService;
import com.iot.monitor.service.InfluxDBService;
import lombok.RequiredArgsConstructor;
import lombok.extern.slf4j.Slf4j;
import org.springframework.data.redis.core.StringRedisTemplate;
import org.springframework.scheduling.annotation.Async;
import org.springframework.scheduling.annotation.Scheduled;
import org.springframework.stereotype.Component;

import java.time.LocalDateTime;
import java.util.List;
import java.util.Map;
import java.util.concurrent.ConcurrentHashMap;
import java.util.concurrent.TimeUnit;
import java.util.concurrent.locks.ReentrantLock;

@Slf4j
@Component
@RequiredArgsConstructor
public class DataCollectSchedule {

    private final DeviceMapper deviceMapper;
    private final ModbusDataCollector modbusDataCollector;
    private final InfluxDBService influxDBService;
    private final AlarmService alarmService;
    private final StringRedisTemplate redisTemplate;
    private final DataBufferService dataBufferService;

    private final Map<Long, ReentrantLock> deviceCollectLocks = new ConcurrentHashMap<>();
    private final Map<Long, Long> lastCollectSuccessTime = new ConcurrentHashMap<>();

    private static final String COLLECT_LOCK_KEY = "collect:lock:";
    private static final long COLLECT_LOCK_EXPIRE = 30;

    @Scheduled(cron = "${collect.cron:0/5 * * * * ?}")
    public void collectAllDevices() {
        List<Device> devices = deviceMapper.selectList(
                new LambdaQueryWrapper<Device>().eq(Device::getStatus, 1)
        );

        log.debug("Start collecting data for {} devices", devices.size());

        for (Device device : devices) {
            collectDeviceDataAsync(device);
        }
    }

    @Async("collectTaskExecutor")
    public void collectDeviceDataAsync(Device device) {
        Long deviceId = device.getId();
        String lockKey = COLLECT_LOCK_KEY + deviceId;

        Boolean acquired = redisTemplate.opsForValue()
                .setIfAbsent(lockKey, String.valueOf(System.currentTimeMillis()),
                        COLLECT_LOCK_EXPIRE, TimeUnit.SECONDS);

        if (Boolean.FALSE.equals(acquired)) {
            log.debug("Skip collect for device {}, previous collect still running",
                    device.getDeviceCode());
            return;
        }

        ReentrantLock localLock = deviceCollectLocks
                .computeIfAbsent(deviceId, k -> new ReentrantLock());

        if (!localLock.tryLock()) {
            redisTemplate.delete(lockKey);
            return;
        }

        try {
            doCollect(device);
        } finally {
            localLock.unlock();
            redisTemplate.delete(lockKey);
        }
    }

    private void doCollect(Device device) {
        try {
            DeviceData deviceData = modbusDataCollector.collectData(device);

            if (deviceData.isSuccess()) {
                boolean saved = influxDBService.saveDeviceData(deviceData);
                if (saved) {
                    updateDeviceOnlineStatus(device);
                    lastCollectSuccessTime.put(device.getId(), System.currentTimeMillis());
                }
                alarmService.checkThresholdAlarms(device, deviceData);

                long bufferSize = dataBufferService.getBufferSize(device.getId());
                if (bufferSize > 0) {
                    log.info("Device {} reconnected, buffer size: {}, triggering replay",
                            device.getDeviceCode(), bufferSize);
                }
            } else {
                log.warn("Collect data failed for device: {}, error: {}",
                        device.getDeviceCode(), deviceData.getErrorMsg());

                dataBufferService.bufferData(deviceData);
                alarmService.checkOfflineAlarm(device);
            }
        } catch (Exception e) {
            log.error("Collect device data error: {}", device.getDeviceCode(), e);
        }
    }

    private void updateDeviceOnlineStatus(Device device) {
        device.setLastOnlineTime(LocalDateTime.now());
        deviceMapper.updateById(device);
    }

    public Long getLastCollectSuccessTime(Long deviceId) {
        return lastCollectSuccessTime.get(deviceId);
    }
}
