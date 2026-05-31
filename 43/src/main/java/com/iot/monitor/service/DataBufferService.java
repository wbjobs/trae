package com.iot.monitor.service;

import com.iot.monitor.dto.DeviceData;
import lombok.RequiredArgsConstructor;
import lombok.extern.slf4j.Slf4j;
import org.springframework.data.redis.core.ListOperations;
import org.springframework.data.redis.core.StringRedisTemplate;
import org.springframework.scheduling.annotation.Scheduled;
import org.springframework.stereotype.Service;

import com.alibaba.fastjson.JSON;

import java.util.concurrent.TimeUnit;

@Slf4j
@Service
@RequiredArgsConstructor
public class DataBufferService {

    private final StringRedisTemplate redisTemplate;
    private final InfluxDBService influxDBService;

    private static final String DATA_BUFFER_KEY = "collect:buffer:";
    private static final long BUFFER_EXPIRE = 24;
    private static final int MAX_BUFFER_SIZE = 1000;

    public void bufferData(DeviceData deviceData) {
        try {
            String key = DATA_BUFFER_KEY + deviceData.getDeviceId();
            String json = JSON.toJSONString(deviceData);

            ListOperations<String, String> listOps = redisTemplate.opsForList();
            listOps.rightPush(key, json);
            listOps.trim(key, -MAX_BUFFER_SIZE, -1);
            redisTemplate.expire(key, BUFFER_EXPIRE, TimeUnit.HOURS);

            log.debug("Buffered data for device: {}, buffer size: {}",
                    deviceData.getDeviceCode(), listOps.size(key));
        } catch (Exception e) {
            log.error("Buffer data failed for device: {}", deviceData.getDeviceCode(), e);
        }
    }

    @Scheduled(fixedDelay = 10000)
    public void replayBufferedData() {
        try {
            var keys = redisTemplate.keys(DATA_BUFFER_KEY + "*");
            if (keys == null || keys.isEmpty()) {
                return;
            }

            for (String key : keys) {
                replayDeviceBuffer(key);
            }
        } catch (Exception e) {
            log.error("Replay buffered data failed", e);
        }
    }

    private void replayDeviceBuffer(String key) {
        try {
            ListOperations<String, String> listOps = redisTemplate.opsForList();
            Long size = listOps.size(key);

            if (size == null || size == 0) {
                redisTemplate.delete(key);
                return;
            }

            int replayCount = Math.min(size.intValue(), 100);
            int successCount = 0;

            for (int i = 0; i < replayCount; i++) {
                String json = listOps.leftPop(key);
                if (json == null) {
                    break;
                }

                try {
                    DeviceData deviceData = JSON.parseObject(json, DeviceData.class);
                    boolean saved = influxDBService.saveDeviceData(deviceData);
                    if (saved) {
                        successCount++;
                    }
                } catch (Exception e) {
                    log.warn("Parse buffered data failed, skip: {}", json);
                }
            }

            if (successCount > 0) {
                log.info("Replayed {} buffered data entries from key: {}", successCount, key);
            }

            Long remaining = listOps.size(key);
            if (remaining == null || remaining == 0) {
                redisTemplate.delete(key);
            }
        } catch (Exception e) {
            log.error("Replay device buffer failed for key: {}", key, e);
        }
    }

    public long getBufferSize(Long deviceId) {
        try {
            String key = DATA_BUFFER_KEY + deviceId;
            ListOperations<String, String> listOps = redisTemplate.opsForList();
            Long size = listOps.size(key);
            return size != null ? size : 0;
        } catch (Exception e) {
            return 0;
        }
    }
}
