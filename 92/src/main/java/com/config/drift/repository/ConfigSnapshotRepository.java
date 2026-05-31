package com.config.drift.repository;

import com.config.drift.model.ConfigSnapshot;
import org.springframework.data.mongodb.repository.MongoRepository;
import org.springframework.data.mongodb.repository.Query;
import org.springframework.stereotype.Repository;

import java.time.LocalDateTime;
import java.util.List;
import java.util.Optional;

@Repository
public interface ConfigSnapshotRepository extends MongoRepository<ConfigSnapshot, String> {

    List<ConfigSnapshot> findByServiceNameOrderBySnapshotTimeDesc(String serviceName);

    Optional<ConfigSnapshot> findFirstByServiceNameAndIsBaselineTrueOrderBySnapshotTimeDesc(String serviceName);

    Optional<ConfigSnapshot> findByServiceNameAndCommitId(String serviceName, String commitId);

    List<ConfigSnapshot> findByServiceNameAndSnapshotTimeBetweenOrderBySnapshotTimeDesc(
            String serviceName, LocalDateTime start, LocalDateTime end);

    @Query("{'serviceName': ?0, 'snapshotTime': {$gte: ?1, $lte: ?2}")
    List<ConfigSnapshot> findSnapshotsInRange(String serviceName, LocalDateTime start, LocalDateTime end);

    void deleteByServiceNameAndSnapshotTimeBefore(String serviceName, LocalDateTime beforeTime);
}
