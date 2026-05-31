package com.distributed.scheduler.entity;

import jakarta.persistence.*;
import lombok.Data;
import org.hibernate.annotations.JdbcTypeCode;
import org.hibernate.type.SqlTypes;

import java.time.LocalDateTime;
import java.util.Map;

@Data
@Entity
@Table(name = "task_instance")
public class TaskInstance {
    @Id
    @GeneratedValue(strategy = GenerationType.IDENTITY)
    private Long id;

    @Column(name = "task_id", nullable = false)
    private Long taskId;

    @Column(name = "dag_id")
    private Long dagId;

    @Column(name = "trace_id")
    private String traceId;

    @Column(name = "status", nullable = false)
    private String status = "PENDING";

    @Column(name = "executor_id")
    private String executorId;

    @JdbcTypeCode(SqlTypes.JSON)
    @Column(name = "params", columnDefinition = "json")
    private Map<String, Object> params;

    @Column(name = "result", columnDefinition = "TEXT")
    private String result;

    @Column(name = "error_message", columnDefinition = "TEXT")
    private String errorMessage;

    @Column(name = "retry_times", nullable = false)
    private Integer retryTimes = 0;

    @Column(name = "scheduled_at")
    private LocalDateTime scheduledAt;

    @Column(name = "started_at")
    private LocalDateTime startedAt;

    @Column(name = "completed_at")
    private LocalDateTime completedAt;

    @Column(name = "timeout_at")
    private LocalDateTime timeoutAt;

    @Column(name = "priority", nullable = false)
    private Integer priority = 5;

    @Column(name = "suspended_by_instance_id")
    private Long suspendedByInstanceId;

    @Column(name = "suspended_at")
    private LocalDateTime suspendedAt;

    @Column(name = "resume_count", nullable = false)
    private Integer resumeCount = 0;

    @Column(name = "checkpoint_data", columnDefinition = "TEXT")
    private String checkpointData;

    @Column(name = "created_at", nullable = false)
    private LocalDateTime createdAt;

    @Column(name = "updated_at", nullable = false)
    private LocalDateTime updatedAt;

    @PrePersist
    protected void onCreate() {
        createdAt = LocalDateTime.now();
        updatedAt = LocalDateTime.now();
    }

    @PreUpdate
    protected void onUpdate() {
        updatedAt = LocalDateTime.now();
    }
}
