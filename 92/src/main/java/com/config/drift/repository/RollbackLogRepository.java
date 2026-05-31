package com.config.drift.repository;

import com.config.drift.model.RollbackLog;
import org.springframework.data.mongodb.repository.MongoRepository;
import org.springframework.stereotype.Repository;

import java.time.LocalDateTime;
import java.util.List;
import java.util.Optional;

@Repository
public interface RollbackLogRepository extends MongoRepository<RollbackLog, String> {

    List<RollbackLog> findByServiceNameOrderByRollbackTimeDesc(String serviceName);

    Optional<RollbackLog> findByDetectionIdAndServiceName(String detectionId, String serviceName);

    List<RollbackLog> findByServiceNameAndRollbackTimeBetweenOrderByRollbackTimeDesc(
            String serviceName, LocalDateTime start, LocalDateTime end);

    List<RollbackLog> findByStatusOrderByRollbackTimeDesc(RollbackLog.RollbackStatus status);
}
