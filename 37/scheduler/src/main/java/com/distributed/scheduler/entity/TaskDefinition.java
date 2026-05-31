package com.distributed.scheduler.entity;

import jakarta.persistence.*;
import lombok.Data;
import org.hibernate.annotations.JdbcTypeCode;
import org.hibernate.type.SqlTypes;

import java.time.LocalDateTime;
import java.util.Map;

@Data
@Entity
@Table(name = "task_definition")
public class TaskDefinition {
    @Id
    @GeneratedValue(strategy = GenerationType.IDENTITY)
    private Long id;

    @Column(name = "task_name", nullable = false, unique = true)
    private String taskName;

    @Column(name = "task_type", nullable = false)
    private String taskType;

    @Column(name = "cron_expression")
    private String cronExpression;

    @JdbcTypeCode(SqlTypes.JSON)
    @Column(name = "task_params", columnDefinition = "json")
    private Map<String, Object> taskParams;

    @Column(name = "description")
    private String description;

    @Column(name = "status", nullable = false)
    private String status = "ACTIVE";

    @Column(name = "max_retry_times", nullable = false)
    private Integer maxRetryTimes = 3;

    @Column(name = "retry_interval_seconds", nullable = false)
    private Integer retryIntervalSeconds = 60;

    @Column(name = "timeout_seconds", nullable = false)
    private Integer timeoutSeconds = 3600;

    @Column(name = "priority", nullable = false)
    private Integer priority = 5;

    @Column(name = "preemptible", nullable = false)
    private Boolean preemptible = true;

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
