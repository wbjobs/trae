package com.config.drift.service;

import com.config.drift.model.ConfigSnapshot;
import com.config.drift.repository.ConfigSnapshotRepository;
import lombok.RequiredArgsConstructor;
import lombok.extern.slf4j.Slf4j;
import org.springframework.stereotype.Service;

import java.time.LocalDateTime;
import java.util.List;
import java.util.Optional;

@Slf4j
@Service
@RequiredArgsConstructor
public class SnapshotService {

    private final ConfigSnapshotRepository repository;

    public ConfigSnapshot save(ConfigSnapshot snapshot) {
        Optional<ConfigSnapshot> existing = repository.findByServiceNameAndCommitId(
                snapshot.getServiceName(), snapshot.getCommitId());
        if (existing.isPresent()) {
            log.debug("Snapshot already exists for service {} at commit {}",
                    snapshot.getServiceName(), snapshot.getCommitId());
            return existing.get();
        }
        ConfigSnapshot saved = repository.save(snapshot);
        log.info("Saved snapshot for service {} at commit {}",
                snapshot.getServiceName(), snapshot.getCommitId());
        return saved;
    }

    public Optional<ConfigSnapshot> getLatestBaseline(String serviceName) {
        return repository.findFirstByServiceNameAndIsBaselineTrueOrderBySnapshotTimeDesc(serviceName);
    }

    public Optional<ConfigSnapshot> getByCommitId(String serviceName, String commitId) {
        return repository.findByServiceNameAndCommitId(serviceName, commitId);
    }

    public List<ConfigSnapshot> getHistory(String serviceName) {
        return repository.findByServiceNameOrderBySnapshotTimeDesc(serviceName);
    }

    public List<ConfigSnapshot> getHistoryInRange(String serviceName, LocalDateTime start, LocalDateTime end) {
        return repository.findByServiceNameAndSnapshotTimeBetweenOrderBySnapshotTimeDesc(serviceName, start, end);
    }

    public void deleteOldSnapshots(String serviceName, LocalDateTime beforeTime) {
        repository.deleteByServiceNameAndSnapshotTimeBefore(serviceName, beforeTime);
        log.info("Deleted snapshots for service {} before {}", serviceName, beforeTime);
    }

    public Optional<ConfigSnapshot> findById(String id) {
        return repository.findById(id);
    }
}
