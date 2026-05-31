package com.distributed.scheduler.repository;

import com.distributed.scheduler.entity.TaskDefinition;
import org.springframework.data.jpa.repository.JpaRepository;
import org.springframework.stereotype.Repository;

import java.util.List;
import java.util.Optional;

@Repository
public interface TaskDefinitionRepository extends JpaRepository<TaskDefinition, Long> {
    Optional<TaskDefinition> findByTaskName(String taskName);
    List<TaskDefinition> findByStatus(String status);
    List<TaskDefinition> findByStatusAndCronExpressionIsNotNull(String status);
    boolean existsByTaskName(String taskName);
}
