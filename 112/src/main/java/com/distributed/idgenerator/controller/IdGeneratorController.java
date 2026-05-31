package com.distributed.idgenerator.controller;

import com.distributed.idgenerator.core.SelfHealingManager;
import com.distributed.idgenerator.core.SnowflakeIdGenerator;
import com.distributed.idgenerator.ntp.NtpTimeManager;
import com.distributed.idgenerator.zk.ZkManager;
import lombok.extern.slf4j.Slf4j;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RestController;

import java.util.HashMap;
import java.util.List;
import java.util.Map;

@Slf4j
@RestController
@RequestMapping
public class IdGeneratorController {

    private final SnowflakeIdGenerator idGenerator;
    private final SelfHealingManager selfHealingManager;
    private final ZkManager zkManager;
    private final NtpTimeManager ntpTimeManager;

    public IdGeneratorController(SnowflakeIdGenerator idGenerator,
                                  SelfHealingManager selfHealingManager,
                                  ZkManager zkManager,
                                  NtpTimeManager ntpTimeManager) {
        this.idGenerator = idGenerator;
        this.selfHealingManager = selfHealingManager;
        this.zkManager = zkManager;
        this.ntpTimeManager = ntpTimeManager;
    }

    @GetMapping("/nextId")
    public Map<String, Object> nextId() {
        long startTime = System.currentTimeMillis();
        long id = idGenerator.nextId();
        long duration = System.currentTimeMillis() - startTime;

        Map<String, Object> result = new HashMap<>();
        result.put("id", id);
        result.put("workerId", idGenerator.getWorkerId());
        result.put("selfHealingMode", idGenerator.isSelfHealingMode());
        result.put("usingNtpTime", idGenerator.isUsingNtpTime());
        result.put("ntpPrimaryServer", idGenerator.getNtpPrimaryServer());
        result.put("ntpOffset", idGenerator.getNtpOffset());
        result.put("timestamp", System.currentTimeMillis());
        result.put("generationTimeMs", duration);

        if (log.isDebugEnabled()) {
            log.debug("Generated ID: {}, workerId: {}, selfHealing: {}, ntp: {}, duration: {}ms",
                    id, idGenerator.getWorkerId(), idGenerator.isSelfHealingMode(),
                    idGenerator.isUsingNtpTime(), duration);
        }

        return result;
    }

    @GetMapping("/status")
    public Map<String, Object> status() {
        Map<String, Object> result = new HashMap<>();

        SelfHealingManager.SelfHealingStatus healingStatus = selfHealingManager.getStatus();
        result.put("selfHealing", healingStatus);

        result.put("workerId", idGenerator.getWorkerId());
        result.put("lastTimestamp", idGenerator.getLastTimestamp());
        result.put("currentTime", System.currentTimeMillis());
        result.put("usingNtpTime", idGenerator.isUsingNtpTime());
        result.put("ntpOffset", idGenerator.getNtpOffset());

        result.put("ntp", ntpTimeManager.getOverallStatus());

        Map<String, Object> workerInfo = zkManager.getWorkerInfo(idGenerator.getWorkerId());
        result.put("workerInfo", workerInfo);

        Map<String, Object> clockOffsetInfo = zkManager.getClockOffsetInfo(idGenerator.getWorkerId());
        result.put("clockOffset", clockOffsetInfo);

        List<String> activeWorkers = zkManager.getActiveWorkers();
        result.put("activeWorkers", activeWorkers);
        result.put("zkConnected", zkManager.isConnected());

        return result;
    }

    @GetMapping("/ntp/status")
    public Map<String, Object> ntpStatus() {
        return ntpTimeManager.getOverallStatus();
    }

    @GetMapping("/ntp/sync")
    public Map<String, Object> ntpSync() {
        long startTime = System.currentTimeMillis();
        ntpTimeManager.syncAllServers();
        long duration = System.currentTimeMillis() - startTime;

        Map<String, Object> result = new HashMap<>();
        result.put("status", "SYNCED");
        result.put("durationMs", duration);
        result.put("ntp", ntpTimeManager.getOverallStatus());
        return result;
    }

    @GetMapping("/health")
    public Map<String, Object> health() {
        Map<String, Object> result = new HashMap<>();
        result.put("status", "UP");
        result.put("zkConnected", zkManager.isConnected());
        result.put("selfHealingMode", idGenerator.isSelfHealingMode());
        result.put("workerId", idGenerator.getWorkerId());
        result.put("usingNtpTime", idGenerator.isUsingNtpTime());
        result.put("healthyNtpServers", ntpTimeManager.getHealthyServerCount());
        result.put("totalNtpServers", ntpTimeManager.getAllServers().size());

        if (!zkManager.isConnected()) {
            result.put("status", "DEGRADED");
            result.put("reason", "ZooKeeper connection lost");
        }

        return result;
    }
}
