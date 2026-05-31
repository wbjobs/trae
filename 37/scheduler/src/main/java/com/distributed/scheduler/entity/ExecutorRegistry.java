package com.distributed.scheduler.entity;

import jakarta.persistence.*;
import lombok.Data;
import org.hibernate.annotations.JdbcTypeCode;
import org.hibernate.type.SqlTypes;

import java.time.LocalDateTime;
import java.util.List;

@Data
@Entity
@Table(name = "executor_registry")
public class ExecutorRegistry {
    @Id
    @Column(name = "id", length = 128)
    private String id;

    @Column(name = "executor_name", nullable = false)
    private String executorName;

    @Column(name = "host", nullable = false)
    private String host;

    @Column(name = "port", nullable = false)
    private Integer port;

    @Column(name = "status", nullable = false)
    private String status = "ACTIVE";

    @Column(name = "last_heartbeat_at", nullable = false)
    private LocalDateTime lastHeartbeatAt;

    @JdbcTypeCode(SqlTypes.JSON)
    @Column(name = "task_types", columnDefinition = "json")
    private List<String> taskTypes;

    @Column(name = "created_at", nullable = false)
    private LocalDateTime createdAt;

    @Column(name = "updated_at", nullable = false)
    private LocalDateTime updatedAt;

    @PrePersist
    protected void onCreate() {
        createdAt = LocalDateTime.now();
        updatedAt = LocalDateTime.now();
        lastHeartbeatAt = LocalDateTime.now();
    }

    @PreUpdate
    protected void onUpdate() {
        updatedAt = LocalDateTime.now();
    }
}
