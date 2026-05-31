package com.distributed.scheduler.entity;

import jakarta.persistence.*;
import lombok.Data;

import java.time.LocalDateTime;

@Data
@Entity
@Table(name = "dag_edge", uniqueConstraints = {
    @UniqueConstraint(columnNames = {"dag_id", "from_task_id", "to_task_id"})
})
public class DagEdge {
    @Id
    @GeneratedValue(strategy = GenerationType.IDENTITY)
    private Long id;

    @Column(name = "dag_id", nullable = false)
    private Long dagId;

    @Column(name = "from_task_id", nullable = false)
    private Long fromTaskId;

    @Column(name = "to_task_id", nullable = false)
    private Long toTaskId;

    @Column(name = "created_at", nullable = false)
    private LocalDateTime createdAt;

    @PrePersist
    protected void onCreate() {
        createdAt = LocalDateTime.now();
    }
}
