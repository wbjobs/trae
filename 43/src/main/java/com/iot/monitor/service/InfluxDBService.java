package com.iot.monitor.service;

import com.influxdb.client.InfluxDBClient;
import com.influxdb.client.WriteApi;
import com.influxdb.client.domain.WritePrecision;
import com.influxdb.client.write.Point;
import com.iot.monitor.config.InfluxDBConfig;
import com.iot.monitor.dto.DeviceData;
import lombok.RequiredArgsConstructor;
import lombok.extern.slf4j.Slf4j;
import org.springframework.data.redis.core.StringRedisTemplate;
import org.springframework.stereotype.Service;

import java.time.Instant;
import java.util.ArrayList;
import java.util.List;
import java.util.Map;
import java.util.concurrent.TimeUnit;

@Slf4j
@Service
@RequiredArgsConstructor
public class InfluxDBService {

    private final InfluxDBClient influxDBClient;
    private final InfluxDBConfig influxDBConfig;
    private final StringRedisTemplate redisTemplate;

    private static final String LAST_WRITE_KEY = "influx:last_write:";
    private static final long LAST_WRITE_EXPIRE = 24;

    public boolean saveDeviceData(DeviceData deviceData) {
        if (!deviceData.isSuccess() || deviceData.getValues() == null) {
            return false;
        }

        Instant timestamp = deviceData.getCollectTime() != null
                ? deviceData.getCollectTime().atZone(java.time.ZoneId.systemDefault()).toInstant()
                : Instant.now();

        long timestampMs = timestamp.toEpochMilli();
        List<Point> points = new ArrayList<>();
        boolean hasNewData = false;

        for (Map.Entry<String, Double> entry : deviceData.getValues().entrySet()) {
            if (entry.getValue() == null) {
                continue;
            }

            String pointCode = entry.getKey();
            String dedupKey = LAST_WRITE_KEY + deviceData.getDeviceId() + ":" + pointCode;

            if (!shouldWrite(dedupKey, timestampMs)) {
                log.debug("Skip duplicate data for device:{}, point:{}, timestamp:{}",
                        deviceData.getDeviceCode(), pointCode, timestampMs);
                continue;
            }

            Point point = Point.measurement("device_data")
                    .addTag("deviceId", String.valueOf(deviceData.getDeviceId()))
                    .addTag("deviceCode", deviceData.getDeviceCode())
                    .addTag("pointCode", pointCode)
                    .addField("value", entry.getValue())
                    .time(timestamp, WritePrecision.MS);

            points.add(point);
            updateLastWriteTime(dedupKey, timestampMs);
            hasNewData = true;
        }

        if (!points.isEmpty()) {
            try (WriteApi writeApi = influxDBClient.getWriteApi()) {
                writeApi.writePoints(influxDBConfig.getBucket(), influxDBConfig.getOrg(), points);
                log.debug("Saved {} data points for device: {} to InfluxDB",
                        points.size(), deviceData.getDeviceCode());
            } catch (Exception e) {
                log.error("Save device data to InfluxDB failed", e);
                hasNewData = false;
            }
        }

        return hasNewData;
    }

    private boolean shouldWrite(String dedupKey, long timestampMs) {
        try {
            String lastWriteStr = redisTemplate.opsForValue().get(dedupKey);
            if (lastWriteStr == null) {
                return true;
            }
            long lastWriteMs = Long.parseLong(lastWriteStr);
            return timestampMs > lastWriteMs;
        } catch (Exception e) {
            log.warn("Check last write time failed for key: {}", dedupKey, e);
            return true;
        }
    }

    private void updateLastWriteTime(String dedupKey, long timestampMs) {
        try {
            redisTemplate.opsForValue().set(dedupKey, String.valueOf(timestampMs),
                    LAST_WRITE_EXPIRE, TimeUnit.HOURS);
        } catch (Exception e) {
            log.warn("Update last write time failed for key: {}", dedupKey, e);
        }
    }

    public void saveDeviceStatus(Long deviceId, String deviceCode, int status) {
        try (WriteApi writeApi = influxDBClient.getWriteApi()) {
            Point point = Point.measurement("device_status")
                    .addTag("deviceId", String.valueOf(deviceId))
                    .addTag("deviceCode", deviceCode)
                    .addField("status", status)
                    .time(Instant.now(), WritePrecision.MS);

            writeApi.writePoint(influxDBConfig.getBucket(), influxDBConfig.getOrg(), point);
        } catch (Exception e) {
            log.error("Save device status to InfluxDB failed", e);
        }
    }
}
