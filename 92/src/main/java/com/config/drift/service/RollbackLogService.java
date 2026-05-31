package com.config.drift.service;

import com.config.drift.model.RollbackLog;
import com.config.drift.repository.RollbackLogRepository;
import lombok.RequiredArgsConstructor;
import lombok.extern.slf4j.Slf4j;
import org.springframework.stereotype.Service;

import java.time.LocalDateTime;
import java.util.List;
import java.util.Optional;

@Slf4j
@Service
@RequiredArgsConstructor
public class RollbackLogService {

    private final RollbackLogRepository repository;

    public RollbackLog save(RollbackLog rollbackLog) {
        RollbackLog saved = repository.save(rollbackLog);
        log.info("Saved rollback log for service {}: status={}, count={}",
                saved.getServiceName(), saved.getStatus(), saved.getRollbackCount());
        return saved;
    }

    public List<RollbackLog> getByServiceName(String serviceName) {
        return repository.findByServiceNameOrderByRollbackTimeDesc(serviceName);
    }

    public Optional<RollbackLog> getByDetectionIdAndServiceName(String detectionId, String serviceName) {
        return repository.findByDetectionIdAndServiceName(detectionId, serviceName);
    }

    public List<RollbackLog> getByServiceNameAndTimeRange(String serviceName, LocalDateTime start, LocalDateTime end) {
        return repository.findByServiceNameAndRollbackTimeBetweenOrderByRollbackTimeDesc(serviceName, start, end);
    }

    public List<RollbackLog> getByStatus(RollbackLog.RollbackStatus status) {
        return repository.findByStatusOrderByRollbackTimeDesc(status);
    }

    public Optional<RollbackLog> findById(String id) {
        return repository.findById(id);
    }
}
