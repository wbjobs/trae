package com.iot.monitor.modbus;

import com.digitalpetri.modbus.master.ModbusTcpMaster;
import com.digitalpetri.modbus.master.ModbusTcpMasterConfig;
import com.iot.monitor.config.ModbusConfig;
import com.iot.monitor.entity.Device;
import lombok.extern.slf4j.Slf4j;
import org.springframework.stereotype.Component;

import java.time.Duration;
import java.util.Map;
import java.util.concurrent.ConcurrentHashMap;
import java.util.concurrent.locks.ReentrantLock;

@Slf4j
@Component
public class ModbusConnectionManager {

    private final ModbusConfig modbusConfig;
    private final Map<String, ModbusTcpMaster> tcpConnections = new ConcurrentHashMap<>();
    private final Map<String, ReentrantLock> connectionLocks = new ConcurrentHashMap<>();
    private final Map<String, Long> lastConnectTime = new ConcurrentHashMap<>();
    private final Map<String, Boolean> connectionError = new ConcurrentHashMap<>();

    public ModbusConnectionManager(ModbusConfig modbusConfig) {
        this.modbusConfig = modbusConfig;
    }

    public ModbusTcpMaster getTcpMaster(Device device) {
        String key = getConnectionKey(device);
        ModbusTcpMaster master = tcpConnections.get(key);

        if (master != null && master.isConnected() && !Boolean.TRUE.equals(connectionError.get(key))) {
            return master;
        }

        ReentrantLock lock = connectionLocks.computeIfAbsent(key, k -> new ReentrantLock());
        lock.lock();
        try {
            master = tcpConnections.get(key);
            if (master != null && master.isConnected() && !Boolean.TRUE.equals(connectionError.get(key))) {
                return master;
            }

            Long lastTime = lastConnectTime.get(key);
            if (lastTime != null && System.currentTimeMillis() - lastTime < modbusConfig.getReconnectInterval()) {
                log.debug("Skip reconnect for {}, last connect time: {}", key, lastTime);
                return master;
            }

            if (master != null) {
                try {
                    master.disconnect();
                } catch (Exception e) {
                    log.warn("Disconnect old master failed: {}", key, e);
                }
                tcpConnections.remove(key);
            }

            master = createTcpMaster(device);
            if (master != null && master.isConnected()) {
                tcpConnections.put(key, master);
                connectionError.put(key, false);
                log.info("Modbus TCP connected successfully: {}", key);
            } else {
                connectionError.put(key, true);
            }
            lastConnectTime.put(key, System.currentTimeMillis());

            return master;
        } finally {
            lock.unlock();
        }
    }

    public void markConnectionError(Device device) {
        String key = getConnectionKey(device);
        connectionError.put(key, true);
        log.warn("Mark connection error: {}", key);
    }

    public void clearConnectionError(Device device) {
        String key = getConnectionKey(device);
        connectionError.put(key, false);
    }

    private ModbusTcpMaster createTcpMaster(Device device) {
        String key = getConnectionKey(device);
        ModbusTcpMasterConfig config = new ModbusTcpMasterConfig.Builder(device.getHost())
                .setPort(device.getPort())
                .setTimeout(Duration.ofMillis(modbusConfig.getTimeout()))
                .build();

        ModbusTcpMaster master = new ModbusTcpMaster(config);
        try {
            master.connect().get();
            return master;
        } catch (Exception e) {
            log.error("Modbus TCP connect failed: {}", key, e);
            try {
                master.disconnect();
            } catch (Exception ex) {
                // ignore
            }
            return null;
        }
    }

    public void disconnectAll() {
        tcpConnections.forEach((key, master) -> {
            try {
                master.disconnect();
            } catch (Exception e) {
                log.error("Disconnect failed: {}", key, e);
            }
        });
        tcpConnections.clear();
        connectionLocks.clear();
        lastConnectTime.clear();
        connectionError.clear();
    }

    private String getConnectionKey(Device device) {
        return device.getHost() + ":" + device.getPort();
    }
}
