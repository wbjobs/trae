package com.distributed.scheduler.repository;

import com.distributed.scheduler.entity.TaskInstance;
import org.springframework.data.jpa.repository.JpaRepository;
import org.springframework.data.jpa.repository.Query;
import org.springframework.stereotype.Repository;

import java.time.LocalDateTime;
import java.util.List;

@Repository
public interface TaskInstanceRepository extends JpaRepository<TaskInstance, Long> {
    List<TaskInstance> findByTaskIdOrderByCreatedAtDesc(Long taskId);
    List<TaskInstance> findByStatus(String status);
    List<TaskInstance> findByExecutorIdAndStatusIn(String executorId, List<String> statuses);
    List<TaskInstance> findByDagId(Long dagId);
    List<TaskInstance> findByTraceId(String traceId);

    @Query("SELECT ti FROM TaskInstance ti WHERE ti.status = 'RUNNING' AND ti.timeoutAt < :now")
    List<TaskInstance> findTimeoutInstances(LocalDateTime now);

    @Query("SELECT ti FROM TaskInstance ti WHERE ti.status IN ('RUNNING', 'PENDING') AND ti.executorId = :executorId")
    List<TaskInstance> findInstancesByExecutor(String executorId);

    @Query("SELECT ti FROM TaskInstance ti WHERE ti.dagId = :dagId AND ti.status != 'SUCCESS'")
    List<TaskInstance> findUncompletedInstancesByDagId(Long dagId);

    @Query("SELECT ti FROM TaskInstance ti WHERE ti.status = 'RUNNING' AND ti.executorId = :executorId")
    List<TaskInstance> findRunningInstancesByExecutor(String executorId);

    List<TaskInstance> findByStatusOrderByPriorityDescCreatedAtAsc(String status);
}
