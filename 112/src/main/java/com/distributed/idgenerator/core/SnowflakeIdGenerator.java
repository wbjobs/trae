package com.distributed.idgenerator.core;

import com.distributed.idgenerator.config.IdGeneratorProperties;
import com.distributed.idgenerator.ntp.NtpTimeManager;
import com.distributed.idgenerator.zk.ZkManager;
import lombok.extern.slf4j.Slf4j;

import javax.annotation.PostConstruct;
import javax.annotation.PreDestroy;
import java.util.concurrent.atomic.AtomicLong;

@Slf4j
public class SnowflakeIdGenerator {

    private final long workerIdBits;
    private final long sequenceBits;
    private final long maxClockBackwardMs;
    private final long selfHealingCheckIntervalMs;

    private final long workerIdShift;
    private final long timestampShift;
    private final long sequenceMask;
    private final long maxWorkerId;

    private long workerId;
    private long sequence = 0L;
    private long lastTimestamp = -1L;
    private long maxSequenceInSelfHealing = -1L;

    private final AtomicLong zkCompensationSequence = new AtomicLong(0);
    private volatile boolean selfHealingMode = false;
    private final ZkManager zkManager;
    private final NtpTimeManager ntpTimeManager;

    public SnowflakeIdGenerator(IdGeneratorProperties properties, ZkManager zkManager,
                                NtpTimeManager ntpTimeManager) {
        this.workerIdBits = properties.getWorkerIdBits();
        this.sequenceBits = properties.getSequenceBits();
        this.maxClockBackwardMs = properties.getMaxClockBackwardMs();
        this.selfHealingCheckIntervalMs = properties.getSelfHealingCheckIntervalMs();

        this.workerIdShift = sequenceBits;
        this.timestampShift = sequenceBits + workerIdBits;
        this.sequenceMask = ~(-1L << (int) sequenceBits);
        this.maxWorkerId = ~(-1L << (int) workerIdBits);

        this.zkManager = zkManager;
        this.ntpTimeManager = ntpTimeManager;
    }

    @PostConstruct
    public void init() {
        this.workerId = zkManager.registerWorker();
        log.info("SnowflakeIdGenerator initialized with workerId={}", workerId);

        if (workerId > maxWorkerId) {
            throw new IllegalArgumentException(String.format(
                    "Worker Id can't be greater than %d or less than 0", maxWorkerId));
        }
    }

    @PreDestroy
    public void destroy() {
        zkManager.unregisterWorker(workerId);
        log.info("SnowflakeIdGenerator destroyed, unregistered workerId={}", workerId);
    }

    public synchronized long nextId() {
        long currentTimestamp = timeGen();

        if (currentTimestamp < lastTimestamp) {
            long offset = lastTimestamp - currentTimestamp;
            log.warn("Clock moved backwards by {} ms, lastTimestamp={}, currentTimestamp={}",
                    offset, lastTimestamp, currentTimestamp);

            if (offset <= maxClockBackwardMs) {
                try {
                    log.info("Clock backward within threshold, waiting for {} ms", offset << 1);
                    wait(offset << 1);
                    currentTimestamp = timeGen();
                    if (currentTimestamp < lastTimestamp) {
                        enterSelfHealingMode(lastTimestamp);
                        return generateSelfHealingId();
                    }
                } catch (InterruptedException e) {
                    Thread.currentThread().interrupt();
                    throw new RuntimeException("Interrupted while waiting for clock to catch up", e);
                }
            } else {
                enterSelfHealingMode(lastTimestamp);
                return generateSelfHealingId();
            }
        }

        if (selfHealingMode) {
            if (currentTimestamp >= lastTimestamp) {
                exitSelfHealingMode();
            } else {
                return generateSelfHealingId();
            }
        }

        if (selfHealingMode) {
            return generateSelfHealingId();
        }

        if (lastTimestamp == currentTimestamp) {
            sequence = (sequence + 1) & sequenceMask;
            if (sequence == 0) {
                currentTimestamp = tilNextMillis(lastTimestamp);
            }
        } else {
            sequence = 0L;
        }

        lastTimestamp = currentTimestamp;
        return ((currentTimestamp - twepoch()) << timestampShift)
                | (workerId << workerIdShift)
                | sequence;
    }

    private void enterSelfHealingMode(long targetTimestamp) {
        if (!selfHealingMode) {
            selfHealingMode = true;
            zkCompensationSequence.set(0);
            maxSequenceInSelfHealing = -1L;
            log.warn("Entering self-healing mode, targetTimestamp={}, currentTime={}",
                    targetTimestamp, timeGen());
        }
    }

    private void exitSelfHealingMode() {
        selfHealingMode = false;

        long currentTimestamp = timeGen();
        if (currentTimestamp <= lastTimestamp && maxSequenceInSelfHealing >= 0) {
            sequence = maxSequenceInSelfHealing + 1;
            if (sequence > sequenceMask) {
                lastTimestamp++;
                sequence = 0L;
            }
            log.info("Exiting self-healing mode, clock caught up. Adjusted sequence to {}, lastTimestamp={}",
                    sequence, lastTimestamp);
        } else {
            log.info("Exiting self-healing mode, clock caught up. lastTimestamp={}, currentTimestamp={}",
                    lastTimestamp, currentTimestamp);
        }
    }

    private long generateSelfHealingId() {
        long compensationSeq = zkManager.getCompensationSequence(workerId);
        long seq = (compensationSeq & sequenceMask);

        if (seq == 0 && compensationSeq > 0) {
            lastTimestamp++;
        }

        sequence = seq;
        long timestamp = lastTimestamp;

        if (seq > maxSequenceInSelfHealing) {
            maxSequenceInSelfHealing = seq;
        }

        log.debug("Self-healing mode: generated ID with timestamp={}, workerId={}, sequence={}",
                timestamp, workerId, seq);

        return ((timestamp - twepoch()) << timestampShift)
                | (workerId << workerIdShift)
                | seq;
    }

    private long tilNextMillis(long lastTimestamp) {
        long timestamp = timeGen();
        while (timestamp <= lastTimestamp) {
            timestamp = timeGen();
        }
        return timestamp;
    }

    private long timeGen() {
        if (ntpTimeManager != null && ntpTimeManager.hasHealthyServers()) {
            return ntpTimeManager.currentTimeMillis();
        }
        return System.currentTimeMillis();
    }

    private long twepoch() {
        return 1704067200000L;
    }

    public boolean isSelfHealingMode() {
        return selfHealingMode;
    }

    public long getWorkerId() {
        return workerId;
    }

    public long getLastTimestamp() {
        return lastTimestamp;
    }

    public void reportClockOffset() {
        long currentTime = timeGen();
        long zkTime = zkManager.getZkTime();
        long offset = currentTime - zkTime;
        zkManager.reportClockOffset(workerId, offset, currentTime);
        log.debug("Reported clock offset: {} ms, localTime={}, zkTime={}", offset, currentTime, zkTime);
    }

    public boolean isUsingNtpTime() {
        return ntpTimeManager != null && ntpTimeManager.hasHealthyServers();
    }

    public long getNtpOffset() {
        if (ntpTimeManager != null) {
            return ntpTimeManager.getLocalOffset();
        }
        return 0;
    }

    public String getNtpPrimaryServer() {
        if (ntpTimeManager != null) {
            return ntpTimeManager.getPrimaryServer();
        }
        return null;
    }
}
