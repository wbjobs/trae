package com.distributed.scheduler.repository;

import com.distributed.scheduler.entity.ExecutorRegistry;
import org.springframework.data.jpa.repository.JpaRepository;
import org.springframework.data.jpa.repository.Query;
import org.springframework.stereotype.Repository;

import java.time.LocalDateTime;
import java.util.List;

@Repository
public interface ExecutorRegistryRepository extends JpaRepository<ExecutorRegistry, String> {
    List<ExecutorRegistry> findByStatus(String status);
    
    @Query("SELECT e FROM ExecutorRegistry e WHERE e.status = 'ACTIVE' AND e.lastHeartbeatAt < :threshold")
    List<ExecutorRegistry> findExpiredExecutors(LocalDateTime threshold);
    
    @Query("SELECT e FROM ExecutorRegistry e WHERE e.status = 'ACTIVE' AND :taskType MEMBER OF e.taskTypes")
    List<ExecutorRegistry> findExecutorsByTaskType(String taskType);
}
