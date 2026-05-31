package com.iot.monitor.service;

import com.influxdb.client.InfluxDBClient;
import com.influxdb.client.QueryApi;
import com.influxdb.query.FluxRecord;
import com.influxdb.query.FluxTable;
import com.iot.monitor.config.InfluxDBConfig;
import lombok.RequiredArgsConstructor;
import lombok.extern.slf4j.Slf4j;
import org.springframework.stereotype.Service;

import java.time.Instant;
import java.time.temporal.ChronoUnit;
import java.util.ArrayList;
import java.util.HashMap;
import java.util.List;
import java.util.Map;

@Slf4j
@Service
@RequiredArgsConstructor
public class DataQueryService {

    private final InfluxDBClient influxDBClient;
    private final InfluxDBConfig influxDBConfig;

    public List<Map<String, Object>> queryDeviceData(Long deviceId, String pointCode, int minutes) {
        String flux = String.format(
                "from(bucket: \"%s\") " +
                        "|> range(start: -%dm) " +
                        "|> filter(fn: (r) => r._measurement == \"device_data\" " +
                        "and r.deviceId == \"%d\" " +
                        "and r.pointCode == \"%s\") " +
                        "|> aggregateWindow(every: 1m, fn: mean, createEmpty: false) " +
                        "|> yield(name: \"mean\")",
                influxDBConfig.getBucket(), minutes, deviceId, pointCode
        );

        return executeQuery(flux);
    }

    public Map<String, Object> getLatestData(Long deviceId) {
        String flux = String.format(
                "from(bucket: \"%s\") " +
                        "|> range(start: -1h) " +
                        "|> filter(fn: (r) => r._measurement == \"device_data\" " +
                        "and r.deviceId == \"%d\") " +
                        "|> last()",
                influxDBConfig.getBucket(), deviceId
        );

        List<Map<String, Object>> results = executeQuery(flux);
        Map<String, Object> latestData = new HashMap<>();

        for (Map<String, Object> record : results) {
            String pointCode = (String) record.get("pointCode");
            latestData.put(pointCode, record.get("value"));
            latestData.put(pointCode + "_time", record.get("time"));
        }

        return latestData;
    }

    private List<Map<String, Object>> executeQuery(String flux) {
        List<Map<String, Object>> resultList = new ArrayList<>();

        try {
            QueryApi queryApi = influxDBClient.getQueryApi();
            List<FluxTable> tables = queryApi.query(flux, influxDBConfig.getOrg());

            for (FluxTable table : tables) {
                for (FluxRecord record : table.getRecords()) {
                    Map<String, Object> data = new HashMap<>();
                    data.put("time", record.getTime());
                    data.put("value", record.getValue());

                    record.getValues().forEach((key, value) -> {
                        if (!key.startsWith("_")) {
                            data.put(key, value);
                        }
                    });

                    resultList.add(data);
                }
            }
        } catch (Exception e) {
            log.error("Query InfluxDB failed", e);
        }

        return resultList;
    }
}
