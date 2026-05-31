package com.iot.monitor.modbus;

import com.digitalpetri.modbus.master.ModbusTcpMaster;
import com.digitalpetri.modbus.requests.ReadHoldingRegistersRequest;
import com.digitalpetri.modbus.responses.ReadHoldingRegistersResponse;
import com.iot.monitor.dto.DeviceData;
import com.iot.monitor.entity.Device;
import com.iot.monitor.entity.DevicePoint;
import com.iot.monitor.mapper.DevicePointMapper;
import lombok.RequiredArgsConstructor;
import lombok.extern.slf4j.Slf4j;
import org.springframework.stereotype.Component;

import java.time.LocalDateTime;
import java.util.HashMap;
import java.util.List;
import java.util.Map;

@Slf4j
@Component
@RequiredArgsConstructor
public class ModbusDataCollector {

    private final ModbusConnectionManager connectionManager;
    private final DevicePointMapper devicePointMapper;

    private static final int MAX_RETRY = 2;

    public DeviceData collectData(Device device) {
        DeviceData deviceData = new DeviceData();
        deviceData.setDeviceId(device.getId());
        deviceData.setDeviceCode(device.getDeviceCode());
        deviceData.setCollectTime(LocalDateTime.now());

        try {
            List<DevicePoint> points = devicePointMapper.selectByDeviceId(device.getId());
            if (points.isEmpty()) {
                deviceData.setSuccess(false);
                deviceData.setErrorMsg("No points configured");
                return deviceData;
            }

            Map<String, Double> values = new HashMap<>();

            if ("TCP".equalsIgnoreCase(device.getConnectionType())) {
                values = collectTcpDataWithRetry(device, points);
            } else if ("RTU".equalsIgnoreCase(device.getConnectionType())) {
                values = collectRtuData(device, points);
            }

            deviceData.setValues(values);
            deviceData.setSuccess(true);
            connectionManager.clearConnectionError(device);

        } catch (Exception e) {
            log.error("Collect data failed for device: {}", device.getDeviceCode(), e);
            deviceData.setSuccess(false);
            deviceData.setErrorMsg(e.getMessage());
            connectionManager.markConnectionError(device);
        }

        return deviceData;
    }

    private Map<String, Double> collectTcpDataWithRetry(Device device, List<DevicePoint> points) {
        Map<String, Double> values = null;
        Exception lastException = null;

        for (int retry = 0; retry <= MAX_RETRY; retry++) {
            try {
                values = collectTcpData(device, points);
                if (values != null && !values.isEmpty()) {
                    return values;
                }
            } catch (Exception e) {
                lastException = e;
                log.warn("Collect TCP data retry {} failed for device: {}",
                        retry, device.getDeviceCode(), e.getMessage());

                if (retry < MAX_RETRY) {
                    try {
                        Thread.sleep(1000L * (retry + 1));
                    } catch (InterruptedException ie) {
                        Thread.currentThread().interrupt();
                        break;
                    }
                }
            }
        }

        if (lastException != null) {
            throw new RuntimeException("Collect TCP data failed after " + MAX_RETRY + " retries", lastException);
        }

        return values != null ? values : new HashMap<>();
    }

    private Map<String, Double> collectTcpData(Device device, List<DevicePoint> points) throws Exception {
        ModbusTcpMaster master = connectionManager.getTcpMaster(device);
        if (master == null || !master.isConnected()) {
            throw new RuntimeException("Modbus TCP master not connected");
        }

        Map<String, Double> values = new HashMap<>();
        int successCount = 0;

        for (DevicePoint point : points) {
            try {
                ReadHoldingRegistersRequest request = new ReadHoldingRegistersRequest(
                        point.getRegisterAddress(),
                        point.getRegisterCount()
                );

                ReadHoldingRegistersResponse response = master.sendRequest(
                        request,
                        device.getSlaveId()
                ).get();

                byte[] registers = response.getRegisters();
                double value = parseRegisters(registers, point);
                values.put(point.getPointCode(), value);
                successCount++;

            } catch (Exception e) {
                log.warn("Read point failed: {} - {}", point.getPointCode(), e.getMessage());
                values.put(point.getPointCode(), null);
            }
        }

        if (successCount == 0) {
            throw new RuntimeException("All points read failed");
        }

        return values;
    }

    private Map<String, Double> collectRtuData(Device device, List<DevicePoint> points) {
        Map<String, Double> values = new HashMap<>();
        for (DevicePoint point : points) {
            values.put(point.getPointCode(), null);
        }
        log.warn("RTU mode not fully implemented, returning null values");
        return values;
    }

    private double parseRegisters(byte[] registers, DevicePoint point) {
        double value = 0;

        switch (point.getDataType().toUpperCase()) {
            case "INT16":
                value = (short) ((registers[0] << 8) | (registers[1] & 0xFF));
                break;
            case "UINT16":
                value = ((registers[0] & 0xFF) << 8) | (registers[1] & 0xFF);
                break;
            case "INT32":
                if (registers.length >= 4) {
                    value = (registers[0] << 24) | ((registers[1] & 0xFF) << 16)
                            | ((registers[2] & 0xFF) << 8) | (registers[3] & 0xFF);
                }
                break;
            case "FLOAT32":
                if (registers.length >= 4) {
                    int intBits = (registers[0] << 24) | ((registers[1] & 0xFF) << 16)
                            | ((registers[2] & 0xFF) << 8) | (registers[3] & 0xFF);
                    value = Float.intBitsToFloat(intBits);
                }
                break;
            default:
                value = ((registers[0] & 0xFF) << 8) | (registers[1] & 0xFF);
        }

        if (point.getScale() != null) {
            value = value * point.getScale();
        }
        if (point.getOffset() != null) {
            value = value + point.getOffset();
        }

        return value;
    }
}
