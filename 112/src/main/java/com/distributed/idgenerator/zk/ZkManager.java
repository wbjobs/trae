package com.distributed.idgenerator.zk;

import com.distributed.idgenerator.config.ZookeeperProperties;
import com.fasterxml.jackson.databind.ObjectMapper;
import lombok.extern.slf4j.Slf4j;
import org.apache.curator.framework.CuratorFramework;
import org.apache.curator.framework.CuratorFrameworkFactory;
import org.apache.curator.framework.recipes.atomic.AtomicValue;
import org.apache.curator.framework.recipes.atomic.DistributedAtomicLong;
import org.apache.curator.framework.recipes.locks.InterProcessMutex;
import org.apache.curator.retry.ExponentialBackoffRetry;
import org.apache.curator.utils.EnsurePath;
import org.apache.zookeeper.CreateMode;
import org.apache.zookeeper.data.Stat;

import javax.annotation.PostConstruct;
import javax.annotation.PreDestroy;
import java.net.InetAddress;
import java.nio.charset.StandardCharsets;
import java.util.HashMap;
import java.util.List;
import java.util.Map;
import java.util.concurrent.ConcurrentHashMap;
import java.util.concurrent.atomic.AtomicLong;

@Slf4j
public class ZkManager {

    private static final String WORKERS_PATH = "/workers";
    private static final String COMPENSATION_PATH = "/compensation";
    private static final String CLOCK_OFFSET_PATH = "/clock-offsets";
    private static final String GLOBAL_TIME_PATH = "/global-time";
    private static final String SEQUENCE_PATH = "/sequences";

    private final ZookeeperProperties properties;
    private CuratorFramework client;
    private final ObjectMapper objectMapper = new ObjectMapper();
    private final Map<Long, DistributedAtomicLong> compensationSequenceCache = new ConcurrentHashMap<>();
    private String currentWorkerPath;

    public ZkManager(ZookeeperProperties properties) {
        this.properties = properties;
    }

    @PostConstruct
    public void init() {
        try {
            client = CuratorFrameworkFactory.builder()
                    .connectString(properties.getConnectString())
                    .namespace(properties.getNamespace())
                    .connectionTimeoutMs(properties.getConnectionTimeout())
                    .sessionTimeoutMs(properties.getSessionTimeout())
                    .retryPolicy(new ExponentialBackoffRetry(
                            properties.getRetryInterval(),
                            properties.getMaxRetries()))
                    .build();

            client.start();
            client.blockUntilConnected();

            ensureBasePaths();

            log.info("ZooKeeper client initialized, connected to {}", properties.getConnectString());
        } catch (Exception e) {
            log.error("Failed to initialize ZooKeeper client", e);
            throw new RuntimeException("ZooKeeper initialization failed", e);
        }
    }

    @PreDestroy
    public void destroy() {
        if (client != null) {
            client.close();
            log.info("ZooKeeper client closed");
        }
    }

    private void ensureBasePaths() throws Exception {
        ensurePath(WORKERS_PATH);
        ensurePath(COMPENSATION_PATH);
        ensurePath(CLOCK_OFFSET_PATH);
        ensurePath(SEQUENCE_PATH);

        if (client.checkExists().forPath(GLOBAL_TIME_PATH) == null) {
            client.create()
                    .creatingParentsIfNeeded()
                    .withMode(CreateMode.PERSISTENT)
                    .forPath(GLOBAL_TIME_PATH, String.valueOf(System.currentTimeMillis()).getBytes(StandardCharsets.UTF_8));
        }
    }

    private void ensurePath(String path) throws Exception {
        EnsurePath ensurePath = new EnsurePath(path);
        ensurePath.ensure(client.getZookeeperClient());
    }

    public long registerWorker() {
        InterProcessMutex lock = new InterProcessMutex(client, WORKERS_PATH + "/lock");
        try {
            lock.acquire();

            String hostAddress = InetAddress.getLocalHost().getHostAddress();
            long workerId = findAvailableWorkerId(hostAddress);

            Map<String, Object> workerInfo = new HashMap<>();
            workerInfo.put("workerId", workerId);
            workerInfo.put("host", hostAddress);
            workerInfo.put("registerTime", System.currentTimeMillis());
            workerInfo.put("status", "ACTIVE");

            String workerPath = WORKERS_PATH + "/" + workerId;
            currentWorkerPath = workerPath;

            if (client.checkExists().forPath(workerPath) != null) {
                client.delete().forPath(workerPath);
            }

            client.create()
                    .withMode(CreateMode.EPHEMERAL)
                    .forPath(workerPath, objectMapper.writeValueAsBytes(workerInfo));

            log.info("Worker registered: workerId={}, host={}", workerId, hostAddress);
            return workerId;
        } catch (Exception e) {
            log.error("Failed to register worker", e);
            throw new RuntimeException("Worker registration failed", e);
        } finally {
            try {
                lock.release();
            } catch (Exception e) {
                log.warn("Failed to release worker registration lock", e);
            }
        }
    }

    private long findAvailableWorkerId(String hostAddress) throws Exception {
        List<String> existingWorkers = client.getChildren().forPath(WORKERS_PATH);

        for (String workerIdStr : existingWorkers) {
            if (!workerIdStr.matches("\\d+")) {
                continue;
            }
            try {
                byte[] data = client.getData().forPath(WORKERS_PATH + "/" + workerIdStr);
                if (data != null && data.length > 0) {
                    Map<String, Object> workerInfo = objectMapper.readValue(data, Map.class);
                    if (hostAddress.equals(workerInfo.get("host"))) {
                        log.info("Found existing worker for host {}: workerId={}", hostAddress, workerIdStr);
                        return Long.parseLong(workerIdStr);
                    }
                }
            } catch (Exception e) {
                log.warn("Failed to read worker info for {}", workerIdStr, e);
            }
        }

        long maxWorkerId = 1023;
        for (long id = 0; id <= maxWorkerId; id++) {
            String path = WORKERS_PATH + "/" + id;
            if (client.checkExists().forPath(path) == null) {
                return id;
            }
        }

        throw new RuntimeException("No available worker ID found, max worker ID is " + maxWorkerId);
    }

    public void unregisterWorker(long workerId) {
        try {
            String workerPath = WORKERS_PATH + "/" + workerId;
            if (client.checkExists().forPath(workerPath) != null) {
                client.delete().forPath(workerPath);
                log.info("Worker unregistered: workerId={}", workerId);
            }

            String compPath = COMPENSATION_PATH + "/" + workerId;
            if (client.checkExists().forPath(compPath) != null) {
                client.delete().forPath(compPath);
            }
        } catch (Exception e) {
            log.warn("Failed to unregister worker {}", workerId, e);
        }
    }

    public long getCompensationSequence(long workerId) {
        try {
            DistributedAtomicLong atomicLong = getOrCreateCompensationSequence(workerId);
            AtomicValue<Long> value = atomicLong.increment();

            if (value.succeeded()) {
                return value.postValue();
            } else {
                log.warn("Failed to increment compensation sequence for workerId={}, using local fallback", workerId);
                return fallbackCompensationSequence(workerId);
            }
        } catch (Exception e) {
            log.warn("Failed to get compensation sequence from ZooKeeper for workerId={}", workerId, e);
            return fallbackCompensationSequence(workerId);
        }
    }

    private DistributedAtomicLong getOrCreateCompensationSequence(long workerId) throws Exception {
        return compensationSequenceCache.computeIfAbsent(workerId, id -> {
            String path = COMPENSATION_PATH + "/" + id;
            try {
                if (client.checkExists().forPath(path) == null) {
                    client.create()
                            .creatingParentsIfNeeded()
                            .withMode(CreateMode.PERSISTENT)
                            .forPath(path, "0".getBytes(StandardCharsets.UTF_8));
                }
            } catch (Exception e) {
                throw new RuntimeException("Failed to create compensation path for worker " + id, e);
            }
            return new DistributedAtomicLong(client, path,
                    new ExponentialBackoffRetry(properties.getRetryInterval(), properties.getMaxRetries()));
        });
    }

    private final Map<Long, AtomicLong> fallbackSequences = new ConcurrentHashMap<>();

    private long fallbackCompensationSequence(long workerId) {
        return fallbackSequences.computeIfAbsent(workerId, k -> new AtomicLong(0))
                .incrementAndGet();
    }

    public void reportClockOffset(long workerId, long offset, long localTime) {
        try {
            Map<String, Object> offsetInfo = new HashMap<>();
            offsetInfo.put("workerId", workerId);
            offsetInfo.put("offset", offset);
            offsetInfo.put("localTime", localTime);
            offsetInfo.put("reportTime", System.currentTimeMillis());

            String offsetPath = CLOCK_OFFSET_PATH + "/" + workerId;
            byte[] data = objectMapper.writeValueAsBytes(offsetInfo);

            if (client.checkExists().forPath(offsetPath) == null) {
                client.create()
                        .creatingParentsIfNeeded()
                        .withMode(CreateMode.PERSISTENT)
                        .forPath(offsetPath, data);
            } else {
                client.setData().forPath(offsetPath, data);
            }
        } catch (Exception e) {
            log.warn("Failed to report clock offset for workerId={}", workerId, e);
        }
    }

    public long getZkTime() {
        try {
            byte[] data = client.getData().forPath(GLOBAL_TIME_PATH);
            if (data != null && data.length > 0) {
                return Long.parseLong(new String(data, StandardCharsets.UTF_8));
            }
        } catch (Exception e) {
            log.warn("Failed to get ZooKeeper global time", e);
        }
        return System.currentTimeMillis();
    }

    public void updateGlobalTime() {
        try {
            long currentTime = System.currentTimeMillis();
            Stat stat = client.checkExists().forPath(GLOBAL_TIME_PATH);
            if (stat != null) {
                byte[] data = client.getData().forPath(GLOBAL_TIME_PATH);
                long zkTime = Long.parseLong(new String(data, StandardCharsets.UTF_8));
                if (currentTime > zkTime) {
                    client.setData().forPath(GLOBAL_TIME_PATH,
                            String.valueOf(currentTime).getBytes(StandardCharsets.UTF_8));
                }
            }
        } catch (Exception e) {
            log.warn("Failed to update global time", e);
        }
    }

    public Map<String, Object> getWorkerInfo(long workerId) {
        try {
            String path = WORKERS_PATH + "/" + workerId;
            byte[] data = client.getData().forPath(path);
            if (data != null && data.length > 0) {
                return objectMapper.readValue(data, Map.class);
            }
        } catch (Exception e) {
            log.warn("Failed to get worker info for workerId={}", workerId, e);
        }
        return new HashMap<>();
    }

    public List<String> getActiveWorkers() {
        try {
            return client.getChildren().forPath(WORKERS_PATH);
        } catch (Exception e) {
            log.warn("Failed to get active workers", e);
            return List.of();
        }
    }

    public Map<String, Object> getClockOffsetInfo(long workerId) {
        try {
            String path = CLOCK_OFFSET_PATH + "/" + workerId;
            byte[] data = client.getData().forPath(path);
            if (data != null && data.length > 0) {
                return objectMapper.readValue(data, Map.class);
            }
        } catch (Exception e) {
            log.warn("Failed to get clock offset info for workerId={}", workerId, e);
        }
        return new HashMap<>();
    }

    public boolean isConnected() {
        return client != null && client.getZookeeperClient().isConnected();
    }
}
