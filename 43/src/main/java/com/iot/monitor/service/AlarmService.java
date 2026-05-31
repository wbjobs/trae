package com.iot.monitor.service;

import com.baomidou.mybatisplus.core.conditions.query.LambdaQueryWrapper;
import com.iot.monitor.dto.DeviceData;
import com.iot.monitor.entity.AlarmConfig;
import com.iot.monitor.entity.AlarmRecord;
import com.iot.monitor.entity.Device;
import com.iot.monitor.entity.DevicePoint;
import com.iot.monitor.enums.AlarmLevel;
import com.iot.monitor.mapper.AlarmConfigMapper;
import com.iot.monitor.mapper.AlarmRecordMapper;
import com.iot.monitor.mapper.DevicePointMapper;
import lombok.RequiredArgsConstructor;
import lombok.extern.slf4j.Slf4j;
import org.springframework.beans.factory.annotation.Value;
import org.springframework.data.redis.core.StringRedisTemplate;
import org.springframework.scheduling.annotation.Async;
import org.springframework.scheduling.annotation.Scheduled;
import org.springframework.stereotype.Service;

import java.math.BigDecimal;
import java.time.Duration;
import java.time.LocalDateTime;
import java.util.List;
import java.util.Map;
import java.util.concurrent.ConcurrentHashMap;
import java.util.concurrent.TimeUnit;

@Slf4j
@Service
@RequiredArgsConstructor
public class AlarmService {

    private final AlarmConfigMapper alarmConfigMapper;
    private final AlarmRecordMapper alarmRecordMapper;
    private final NotificationService notificationService;
    private final StringRedisTemplate redisTemplate;
    private final DevicePointMapper devicePointMapper;

    @Value("${alarm.offline-threshold:60000}")
    private long offlineThreshold;

    @Value("${alarm.notify-interval:300000}")
    private long notifyInterval;

    private static final String ALARM_ACTIVE_KEY = "alarm:active:";
    private static final String ALARM_ESCALATE_KEY = "alarm:escalate:";
    private static final long ALARM_ACTIVE_EXPIRE = 24;

    private final Map<String, AlarmRecord> activeAlarms = new ConcurrentHashMap<>();

    @Async
    public void checkThresholdAlarms(Device device, DeviceData deviceData) {
        List<AlarmConfig> configs = alarmConfigMapper.selectByDeviceId(device.getId());
        Map<Long, String> pointCodeMap = getPointCodeMap(device.getId());

        for (AlarmConfig config : configs) {
            if (!"THRESHOLD".equals(config.getAlarmType())) {
                continue;
            }

            try {
                String pointCode = pointCodeMap.get(config.getPointId());
                if (pointCode == null) {
                    continue;
                }

                Double value = deviceData.getValues().get(pointCode);
                if (value == null) {
                    continue;
                }

                boolean isAlarm = false;
                String alarmContent = "";

                if (config.getThresholdMin() != null
                        && BigDecimal.valueOf(value).compareTo(config.getThresholdMin()) < 0) {
                    isAlarm = true;
                    alarmContent = String.format("%s低于阈值: 当前值=%.2f, 最小值=%.2f",
                            pointCode, value, config.getThresholdMin());
                }

                if (config.getThresholdMax() != null
                        && BigDecimal.valueOf(value).compareTo(config.getThresholdMax()) > 0) {
                    isAlarm = true;
                    alarmContent = String.format("%s高于阈值: 当前值=%.2f, 最大值=%.2f",
                            pointCode, value, config.getThresholdMax());
                }

                if (isAlarm) {
                    triggerOrUpdateAlarm(device, config, alarmContent);
                } else {
                    resolveAlarm(device.getId(), config.getPointId(), config.getAlarmType());
                }

            } catch (Exception e) {
                log.error("Check threshold alarm failed", e);
            }
        }
    }

    @Async
    public void checkOfflineAlarm(Device device) {
        if (device.getLastOnlineTime() == null) {
            return;
        }

        long offlineDuration = Duration.between(
                device.getLastOnlineTime(),
                LocalDateTime.now()
        ).toMillis();

        if (offlineDuration > offlineThreshold) {
            AlarmConfig offlineConfig = getOfflineConfig(device.getId());
            if (offlineConfig != null) {
                String content = String.format("设备离线告警: %s, 已离线%d秒",
                        device.getDeviceName(), offlineDuration / 1000);
                triggerOrUpdateAlarm(device, offlineConfig, content);
            }
        }
    }

    @Scheduled(fixedDelay = 60000)
    public void checkAlarmEscalation() {
        log.debug("Checking alarm escalation for {} active alarms", activeAlarms.size());

        for (Map.Entry<String, AlarmRecord> entry : activeAlarms.entrySet()) {
            AlarmRecord record = entry.getValue();
            if (record.getStatus() != 1) {
                continue;
            }

            try {
                AlarmConfig config = alarmConfigMapper.selectById(
                        getConfigIdByRecord(record));
                if (config == null || config.getAutoEscalate() == null
                        || config.getAutoEscalate() != 1) {
                    continue;
                }

                int escalateMinutes = config.getEscalateAfterMinutes() != null
                        ? config.getEscalateAfterMinutes() : 30;

                Duration duration = Duration.between(record.getFirstAlarmTime(), LocalDateTime.now());
                long minutes = duration.toMinutes();

                if (minutes >= escalateMinutes) {
                    escalateAlarm(record, config, minutes);
                }
            } catch (Exception e) {
                log.error("Check alarm escalation failed for record: {}", record.getId(), e);
            }
        }
    }

    private void triggerOrUpdateAlarm(Device device, AlarmConfig config, String content) {
        String alarmKey = getAlarmKey(device.getId(), config.getPointId(), config.getAlarmType());

        AlarmRecord activeRecord = activeAlarms.get(alarmKey);

        if (activeRecord != null && activeRecord.getStatus() == 1) {
            updateExistingAlarm(activeRecord, config, content);
        } else {
            createNewAlarm(device, config, content, alarmKey);
        }
    }

    private void createNewAlarm(Device device, AlarmConfig config, String content, String alarmKey) {
        AlarmLevel configLevel = AlarmLevel.fromCode(config.getAlarmLevel());

        AlarmRecord record = new AlarmRecord();
        record.setDeviceId(device.getId());
        record.setPointId(config.getPointId());
        record.setAlarmType(config.getAlarmType());
        record.setAlarmContent(content);
        record.setAlarmLevel(configLevel.getCode());
        record.setAlarmCount(1);
        record.setFirstAlarmTime(LocalDateTime.now());
        record.setLastAlarmTime(LocalDateTime.now());
        record.setStatus(1);
        record.setCreateTime(LocalDateTime.now());
        record.setUpdateTime(LocalDateTime.now());
        alarmRecordMapper.insert(record);

        activeAlarms.put(alarmKey, record);

        sendNotification(config, record, content, false);

        log.warn("New alarm created: device={}, type={}, level={}, content={}",
                device.getDeviceCode(), config.getAlarmType(), configLevel.getCode(), content);

        redisTemplate.opsForValue().set(ALARM_ACTIVE_KEY + alarmKey,
                String.valueOf(record.getId()), ALARM_ACTIVE_EXPIRE, TimeUnit.HOURS);
    }

    private void updateExistingAlarm(AlarmRecord record, AlarmConfig config, String content) {
        record.setAlarmCount(record.getAlarmCount() + 1);
        record.setLastAlarmTime(LocalDateTime.now());
        record.setAlarmContent(content);
        record.setUpdateTime(LocalDateTime.now());
        alarmRecordMapper.updateById(record);

        if (shouldNotify(record)) {
            String notifyContent = String.format("[聚合告警] 第%d次触发: %s",
                    record.getAlarmCount(), content);
            sendNotification(config, record, notifyContent, false);
        }

        log.debug("Alarm aggregated: id={}, count={}", record.getId(), record.getAlarmCount());
    }

    private void escalateAlarm(AlarmRecord record, AlarmConfig config, long durationMinutes) {
        AlarmLevel currentLevel = AlarmLevel.fromCode(record.getAlarmLevel());
        AlarmLevel escalatedLevel = currentLevel.escalate();

        if (currentLevel == escalatedLevel) {
            return;
        }

        String escalateKey = ALARM_ESCALATE_KEY + record.getId();
        String lastEscalate = redisTemplate.opsForValue().get(escalateKey);
        if (lastEscalate != null) {
            return;
        }

        record.setAlarmLevel(escalatedLevel.getCode());
        record.setUpdateTime(LocalDateTime.now());
        alarmRecordMapper.updateById(record);

        String content = String.format("[告警升级] %s → %s, 已持续%d分钟。原告警: %s",
                currentLevel.getName(), escalatedLevel.getName(), durationMinutes, record.getAlarmContent());

        sendNotification(config, record, content, true);

        redisTemplate.opsForValue().set(escalateKey, escalatedLevel.getCode(),
                ALARM_ACTIVE_EXPIRE, TimeUnit.HOURS);

        log.warn("Alarm escalated: id={}, {} -> {}, duration={}min",
                record.getId(), currentLevel.getCode(), escalatedLevel.getCode(), durationMinutes);
    }

    private void resolveAlarm(Long deviceId, Long pointId, String alarmType) {
        String alarmKey = getAlarmKey(deviceId, pointId, alarmType);

        AlarmRecord activeRecord = activeAlarms.get(alarmKey);
        if (activeRecord == null) {
            return;
        }

        activeRecord.setStatus(0);
        activeRecord.setRecoverTime(LocalDateTime.now());
        activeRecord.setUpdateTime(LocalDateTime.now());
        alarmRecordMapper.updateById(activeRecord);

        String content = String.format("[告警恢复] %s, 持续时间: %d分钟, 共触发%d次",
                activeRecord.getAlarmContent(),
                Duration.between(activeRecord.getFirstAlarmTime(), activeRecord.getRecoverTime()).toMinutes(),
                activeRecord.getAlarmCount());

        AlarmLevel level = AlarmLevel.fromCode(activeRecord.getAlarmLevel());
        String notifyType = level.isHigherOrEqual(AlarmLevel.P1) ? "EMAIL,WECHAT" : "WECHAT";
        notificationService.sendNotification(notifyType, content);

        activeAlarms.remove(alarmKey);
        redisTemplate.delete(ALARM_ACTIVE_KEY + alarmKey);
        redisTemplate.delete(ALARM_ESCALATE_KEY + activeRecord.getId());

        log.info("Alarm resolved: id={}, type={}, duration={}min, count={}",
                activeRecord.getId(), alarmType,
                Duration.between(activeRecord.getFirstAlarmTime(), activeRecord.getRecoverTime()).toMinutes(),
                activeRecord.getAlarmCount());
    }

    private boolean shouldNotify(AlarmRecord record) {
        String notifyKey = "alarm:notify:" + record.getId();
        String lastNotify = redisTemplate.opsForValue().get(notifyKey);

        if (lastNotify == null) {
            redisTemplate.opsForValue().set(notifyKey,
                    String.valueOf(System.currentTimeMillis()),
                    notifyInterval / 1000, TimeUnit.SECONDS);
            return true;
        }

        long lastNotifyTime = Long.parseLong(lastNotify);
        if (System.currentTimeMillis() - lastNotifyTime >= notifyInterval) {
            redisTemplate.opsForValue().set(notifyKey,
                    String.valueOf(System.currentTimeMillis()),
                    notifyInterval / 1000, TimeUnit.SECONDS);
            return true;
        }

        return false;
    }

    private void sendNotification(AlarmConfig config, AlarmRecord record,
                                  String content, boolean isEscalation) {
        AlarmLevel level = AlarmLevel.fromCode(record.getAlarmLevel());
        String levelPrefix = String.format("【%s %s】", level.getCode(), level.getName());
        String fullContent = levelPrefix + content;

        String notifyType = config.getNotifyType();
        if (isEscalation || level.isHigherOrEqual(AlarmLevel.P1)) {
            notifyType = "EMAIL,WECHAT";
        }

        notificationService.sendNotification(notifyType, fullContent);
    }

    private String getAlarmKey(Long deviceId, Long pointId, String alarmType) {
        return deviceId + ":" + (pointId != null ? pointId : "0") + ":" + alarmType;
    }

    private Map<Long, String> getPointCodeMap(Long deviceId) {
        List<DevicePoint> points = devicePointMapper.selectByDeviceId(deviceId);
        Map<Long, String> map = new java.util.HashMap<>();
        for (DevicePoint point : points) {
            map.put(point.getId(), point.getPointCode());
        }
        return map;
    }

    private Long getConfigIdByRecord(AlarmRecord record) {
        List<AlarmConfig> configs = alarmConfigMapper.selectByDeviceId(record.getDeviceId());
        for (AlarmConfig config : configs) {
            if (config.getAlarmType().equals(record.getAlarmType())) {
                if (record.getPointId() == null && config.getPointId() == null) {
                    return config.getId();
                }
                if (record.getPointId() != null && record.getPointId().equals(config.getPointId())) {
                    return config.getId();
                }
            }
        }
        return null;
    }

    private AlarmConfig getOfflineConfig(Long deviceId) {
        List<AlarmConfig> configs = alarmConfigMapper.selectByDeviceId(deviceId);
        return configs.stream()
                .filter(c -> "OFFLINE".equals(c.getAlarmType()))
                .findFirst()
                .orElse(null);
    }
}
