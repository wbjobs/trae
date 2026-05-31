package com.distributed.scheduler.service;

import com.distributed.scheduler.dto.ExecutorHeartbeatDTO;
import com.distributed.scheduler.entity.ExecutorRegistry;
import com.distributed.scheduler.repository.ExecutorRegistryRepository;
import lombok.RequiredArgsConstructor;
import lombok.extern.slf4j.Slf4j;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

import java.time.LocalDateTime;
import java.util.List;
import java.util.Optional;
import java.util.Random;

@Slf4j
@Service
@RequiredArgsConstructor
public class ExecutorService {

    private final ExecutorRegistryRepository executorRegistryRepository;
    private final Random random = new Random();

    @Transactional
    public ExecutorRegistry registerExecutor(ExecutorHeartbeatDTO dto) {
        ExecutorRegistry executor = executorRegistryRepository.findById(dto.getExecutorId())
                .orElse(new ExecutorRegistry());

        executor.setId(dto.getExecutorId());
        executor.setExecutorName(dto.getExecutorName());
        executor.setHost(dto.getHost());
        executor.setPort(dto.getPort());
        executor.setTaskTypes(dto.getTaskTypes());
        executor.setStatus("ACTIVE");
        executor.setLastHeartbeatAt(LocalDateTime.now());

        return executorRegistryRepository.save(executor);
    }

    @Transactional
    public void heartbeat(String executorId) {
        ExecutorRegistry executor = executorRegistryRepository.findById(executorId)
                .orElseThrow(() -> new RuntimeException("Executor not found: " + executorId));

        executor.setLastHeartbeatAt(LocalDateTime.now());
        executorRegistryRepository.save(executor);
    }

    public Optional<ExecutorRegistry> getExecutor(String executorId) {
        return executorRegistryRepository.findById(executorId);
    }

    public List<ExecutorRegistry> getAllExecutors() {
        return executorRegistryRepository.findAll();
    }

    public List<ExecutorRegistry> getActiveExecutors() {
        return executorRegistryRepository.findByStatus("ACTIVE");
    }

    public ExecutorRegistry selectExecutor(String taskType) {
        List<ExecutorRegistry> executors = executorRegistryRepository.findExecutorsByTaskType(taskType);
        
        if (executors.isEmpty()) {
            throw new RuntimeException("No active executor available for task type: " + taskType);
        }

        return executors.get(random.nextInt(executors.size()));
    }

    @Transactional
    public void markExecutorInactive(String executorId) {
        ExecutorRegistry executor = executorRegistryRepository.findById(executorId)
                .orElseThrow(() -> new RuntimeException("Executor not found: " + executorId));

        executor.setStatus("INACTIVE");
        executorRegistryRepository.save(executor);
        log.warn("Executor marked as inactive: {}", executorId);
    }

    public List<ExecutorRegistry> getExpiredExecutors(int heartbeatTimeoutSeconds) {
        LocalDateTime threshold = LocalDateTime.now().minusSeconds(heartbeatTimeoutSeconds);
        return executorRegistryRepository.findExpiredExecutors(threshold);
    }
}
