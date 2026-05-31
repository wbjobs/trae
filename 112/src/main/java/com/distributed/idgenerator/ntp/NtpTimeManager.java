package com.distributed.idgenerator.ntp;

import com.distributed.idgenerator.config.NtpProperties;
import lombok.extern.slf4j.Slf4j;
import org.apache.commons.net.ntp.NTPUDPClient;
import org.apache.commons.net.ntp.NtpV3Packet;
import org.apache.commons.net.ntp.TimeInfo;
import org.springframework.scheduling.annotation.Scheduled;

import javax.annotation.PostConstruct;
import java.net.InetAddress;
import java.util.*;
import java.util.concurrent.ConcurrentHashMap;
import java.util.concurrent.atomic.AtomicInteger;
import java.util.concurrent.atomic.AtomicLong;
import java.util.stream.Collectors;

@Slf4j
public class NtpTimeManager {

    private final NtpProperties properties;
    private final List<String> allServers;

    private volatile List<String> healthyServers = new ArrayList<>();
    private final Map<String, AtomicInteger> failureCounts = new ConcurrentHashMap<>();
    private final Map<String, Long> serverOffsets = new ConcurrentHashMap<>();
    private final Map<String, Long> serverLastCheck = new ConcurrentHashMap<>();
    private final Map<String, Boolean> serverHealthy = new ConcurrentHashMap<>();

    private final AtomicLong localOffset = new AtomicLong(0);
    private volatile String primaryServer;

    public NtpTimeManager(NtpProperties properties) {
        this.properties = properties;
        this.allServers = new ArrayList<>(properties.getServers());
    }

    @PostConstruct
    public void init() {
        for (String server : allServers) {
            failureCounts.put(server, new AtomicInteger(0));
            serverHealthy.put(server, true);
            serverOffsets.put(server, 0L);
        }

        healthyServers = new ArrayList<>(allServers);
        if (!healthyServers.isEmpty()) {
            primaryServer = healthyServers.get(0);
        }

        log.info("NtpTimeManager initialized with servers: {}", allServers);
        syncAllServers();
    }

    @Scheduled(fixedDelayString = "${ntp.check-interval-ms:60000}")
    public void scheduledSync() {
        log.debug("Scheduled NTP sync started");
        syncAllServers();
    }

    public long currentTimeMillis() {
        return System.currentTimeMillis() + localOffset.get();
    }

    public void syncAllServers() {
        Map<String, Long> validOffsets = new HashMap<>();

        for (String server : allServers) {
            try {
                Long offset = queryServer(server);
                if (offset != null) {
                    int absOffset = Math.abs(offset.intValue());

                    if (absOffset > properties.getMaxOffsetMs()) {
                        log.warn("NTP server {} offset {} ms exceeds threshold {} ms, marking as degraded",
                                server, offset, properties.getMaxOffsetMs());
                        markServerDegraded(server);
                    } else {
                        markServerHealthy(server);
                        validOffsets.put(server, offset);
                    }

                    serverOffsets.put(server, offset);
                    serverLastCheck.put(server, System.currentTimeMillis());
                } else {
                    log.warn("NTP server {} returned null offset", server);
                    incrementFailure(server);
                }
            } catch (Exception e) {
                log.warn("Failed to sync with NTP server {}: {}", server, e.getMessage());
                incrementFailure(server);
            }
        }

        if (!validOffsets.isEmpty()) {
            long medianOffset = calculateMedian(validOffsets.values());
            long oldOffset = localOffset.get();
            localOffset.set(medianOffset);
            log.info("NTP sync complete. Local offset updated: {} -> {} ms, healthy servers: {}",
                    oldOffset, medianOffset, validOffsets.keySet());

            updatePrimaryServer(validOffsets);
        } else {
            log.error("No healthy NTP servers available! Keeping last known offset: {} ms", localOffset.get());
        }

        updateHealthyServers();
    }

    private Long queryServer(String server) {
        NTPUDPClient client = new NTPUDPClient();
        client.setDefaultTimeout(properties.getTimeoutMs());

        try {
            client.open();
            InetAddress inetAddress = InetAddress.getByName(server);
            TimeInfo timeInfo = client.getTime(inetAddress, properties.getPort());

            NtpV3Packet message = timeInfo.getMessage();
            if (message == null) {
                return null;
            }

            timeInfo.computeDetails();
            Long offset = timeInfo.getOffset();

            if (offset == null) {
                return null;
            }

            log.debug("NTP server {}: offset={} ms, delay={} ms",
                    server, offset, timeInfo.getDelay());

            return offset;
        } catch (Exception e) {
            log.debug("Query NTP server {} failed: {}", server, e.getMessage());
            return null;
        } finally {
            client.close();
        }
    }

    private long calculateMedian(Collection<Long> values) {
        if (values.isEmpty()) {
            return 0;
        }

        List<Long> sorted = values.stream()
                .sorted()
                .collect(Collectors.toList());

        int size = sorted.size();
        if (size % 2 == 0) {
            return (sorted.get(size / 2 - 1) + sorted.get(size / 2)) / 2;
        } else {
            return sorted.get(size / 2);
        }
    }

    private void updatePrimaryServer(Map<String, Long> validOffsets) {
        String bestServer = null;
        long minAbsOffset = Long.MAX_VALUE;

        for (Map.Entry<String, Long> entry : validOffsets.entrySet()) {
            long absOffset = Math.abs(entry.getValue());
            if (absOffset < minAbsOffset) {
                minAbsOffset = absOffset;
                bestServer = entry.getKey();
            }
        }

        if (bestServer != null && !bestServer.equals(primaryServer)) {
            log.info("Primary NTP server switched: {} -> {} (offset={} ms)",
                    primaryServer, bestServer, minAbsOffset);
            primaryServer = bestServer;
        }
    }

    private void incrementFailure(String server) {
        AtomicInteger count = failureCounts.computeIfAbsent(server, k -> new AtomicInteger(0));
        int failures = count.incrementAndGet();

        if (failures >= properties.getMaxFailures()) {
            log.error("NTP server {} has failed {} times, marking as unhealthy", server, failures);
            markServerDegraded(server);
        }
    }

    private void markServerHealthy(String server) {
        failureCounts.computeIfAbsent(server, k -> new AtomicInteger(0)).set(0);
        Boolean wasHealthy = serverHealthy.put(server, true);
        if (wasHealthy != null && !wasHealthy) {
            log.info("NTP server {} has recovered", server);
        }
    }

    private void markServerDegraded(String server) {
        serverHealthy.put(server, false);
    }

    private void updateHealthyServers() {
        List<String> healthy = allServers.stream()
                .filter(s -> Boolean.TRUE.equals(serverHealthy.get(s)))
                .collect(Collectors.toList());

        if (!healthy.equals(healthyServers)) {
            log.info("Healthy NTP servers list updated: {} -> {}", healthyServers, healthy);
            healthyServers = healthy;

            if (healthy.isEmpty()) {
                log.warn("All NTP servers are unhealthy! Using local clock only.");
            } else if (primaryServer == null || !healthy.contains(primaryServer)) {
                primaryServer = healthy.get(0);
                log.info("Primary NTP server set to: {}", primaryServer);
            }
        }
    }

    public long getLocalOffset() {
        return localOffset.get();
    }

    public String getPrimaryServer() {
        return primaryServer;
    }

    public List<String> getHealthyServers() {
        return new ArrayList<>(healthyServers);
    }

    public List<String> getAllServers() {
        return new ArrayList<>(allServers);
    }

    public Map<String, Object> getServerStatus(String server) {
        Map<String, Object> status = new HashMap<>();
        status.put("server", server);
        status.put("healthy", serverHealthy.getOrDefault(server, false));
        status.put("offset", serverOffsets.getOrDefault(server, 0L));
        status.put("lastCheck", serverLastCheck.getOrDefault(server, 0L));
        status.put("failureCount", failureCounts.containsKey(server) ? failureCounts.get(server).get() : 0);
        status.put("isPrimary", server.equals(primaryServer));
        return status;
    }

    public List<Map<String, Object>> getAllServerStatus() {
        return allServers.stream()
                .map(this::getServerStatus)
                .collect(Collectors.toList());
    }

    public int getHealthyServerCount() {
        return healthyServers.size();
    }

    public boolean hasHealthyServers() {
        return !healthyServers.isEmpty();
    }

    public Map<String, Object> getOverallStatus() {
        Map<String, Object> status = new HashMap<>();
        status.put("primaryServer", primaryServer);
        status.put("localOffset", localOffset.get());
        status.put("healthyServerCount", healthyServers.size());
        status.put("totalServerCount", allServers.size());
        status.put("hasHealthyServers", hasHealthyServers());
        status.put("servers", getAllServerStatus());
        return status;
    }
}
