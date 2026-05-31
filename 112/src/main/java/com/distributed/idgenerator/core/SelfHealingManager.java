package com.distributed.idgenerator.core;

import com.distributed.idgenerator.config.IdGeneratorProperties;
import com.distributed.idgenerator.zk.ZkManager;
import lombok.extern.slf4j.Slf4j;
import org.springframework.scheduling.annotation.Scheduled;

import javax.annotation.PostConstruct;

@Slf4j
public class SelfHealingManager {

    private final SnowflakeIdGenerator idGenerator;
    private final ZkManager zkManager;
    private final IdGeneratorProperties properties;

    private volatile long lastPhysicalTime;
    private volatile long enterSelfHealingTime;
    private volatile long lastClockCheckTime;
    private volatile long totalClockBackwardDuration;

    public SelfHealingManager(SnowflakeIdGenerator idGenerator,
                               ZkManager zkManager,
                               IdGeneratorProperties properties) {
        this.idGenerator = idGenerator;
        this.zkManager = zkManager;
        this.properties = properties;
    }

    @PostConstruct
    public void init() {
        this.lastPhysicalTime = System.currentTimeMillis();
        this.lastClockCheckTime = System.currentTimeMillis();
        this.totalClockBackwardDuration = 0;
        log.info("SelfHealingManager initialized");
    }

    @Scheduled(fixedDelay = 1000)
    public void monitorClock() {
        long currentPhysicalTime = System.currentTimeMillis();
        long clockDiff = currentPhysicalTime - lastPhysicalTime;

        if (clockDiff < 0) {
            log.warn("Clock regression detected: {} ms, lastPhysicalTime={}, currentTime={}",
                    clockDiff, lastPhysicalTime, currentPhysicalTime);
            handleClockRegression(clockDiff);
        }

        if (idGenerator.isSelfHealingMode()) {
            checkSelfHealingProgress(currentPhysicalTime);
        }

        lastPhysicalTime = currentPhysicalTime;
        lastClockCheckTime = currentPhysicalTime;
    }

    @Scheduled(fixedDelay = 5000)
    public void reportClockOffset() {
        try {
            idGenerator.reportClockOffset();
            zkManager.updateGlobalTime();
        } catch (Exception e) {
            log.warn("Failed to report clock offset", e);
        }
    }

    private void handleClockRegression(long clockDiff) {
        totalClockBackwardDuration += Math.abs(clockDiff);

        if (Math.abs(clockDiff) > properties.getMaxClockBackwardMs()) {
            log.error("Significant clock regression detected: {} ms, exceeding max threshold {} ms",
                    clockDiff, properties.getMaxClockBackwardMs());
            enterSelfHealingMode();
        }
    }

    private void enterSelfHealingMode() {
        enterSelfHealingTime = System.currentTimeMillis();
        log.warn("Self-healing mode entered at timestamp={}", enterSelfHealingTime);
    }

    private void checkSelfHealingProgress(long currentPhysicalTime) {
        if (currentPhysicalTime >= idGenerator.getLastTimestamp()) {
            log.info("Clock caught up: currentTime={}, lastTimestamp={}, exiting self-healing mode",
                    currentPhysicalTime, idGenerator.getLastTimestamp());

            long healingDuration = System.currentTimeMillis() - enterSelfHealingTime;
            log.info("Self-healing completed in {} ms", healingDuration);

            resetSelfHealingStats();
        } else {
            long lag = idGenerator.getLastTimestamp() - currentPhysicalTime;
            log.debug("Self-healing in progress, clock lag: {} ms, lastTimestamp={}, currentTime={}",
                    lag, idGenerator.getLastTimestamp(), currentPhysicalTime);

            if (lag > properties.getMaxClockBackwardMs() * 2) {
                log.warn("Self-healing taking longer than expected, lag={} ms", lag);
            }
        }
    }

    private void resetSelfHealingStats() {
        enterSelfHealingTime = 0;
        totalClockBackwardDuration = 0;
    }

    public SelfHealingStatus getStatus() {
        SelfHealingStatus status = new SelfHealingStatus();
        status.setSelfHealingMode(idGenerator.isSelfHealingMode());
        status.setWorkerId(idGenerator.getWorkerId());
        status.setLastTimestamp(idGenerator.getLastTimestamp());
        status.setCurrentPhysicalTime(System.currentTimeMillis());
        status.setEnterSelfHealingTime(enterSelfHealingTime);
        status.setTotalClockBackwardDuration(totalClockBackwardDuration);
        status.setZkConnected(zkManager.isConnected());

        if (idGenerator.isSelfHealingMode()) {
            status.setLag(idGenerator.getLastTimestamp() - System.currentTimeMillis());
        }

        return status;
    }

    @lombok.Data
    public static class SelfHealingStatus {
        private boolean selfHealingMode;
        private long workerId;
        private long lastTimestamp;
        private long currentPhysicalTime;
        private long enterSelfHealingTime;
        private long totalClockBackwardDuration;
        private long lag;
        private boolean zkConnected;
    }
}
