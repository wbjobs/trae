package com.ota.platform.entity;

import jakarta.persistence.*;
import lombok.Data;
import org.hibernate.annotations.CreationTimestamp;
import org.hibernate.annotations.UpdateTimestamp;

import java.time.LocalDateTime;

@Data
@Entity
@Table(name = "upgrade_progresses")
public class UpgradeProgress {

    @Id
    @GeneratedValue(strategy = GenerationType.IDENTITY)
    private Long id;

    @ManyToOne(fetch = FetchType.LAZY)
    @JoinColumn(name = "task_id", nullable = false)
    private UpgradeTask task;

    @ManyToOne(fetch = FetchType.LAZY)
    @JoinColumn(name = "device_id", nullable = false)
    private Device device;

    @Column(nullable = false, length = 20)
    private String status = "PENDING";

    @Column(name = "progress_percentage")
    private Integer progressPercentage = 0;

    @Column(name = "current_stage", length = 50)
    private String currentStage;

    @Column(name = "downloaded_size")
    private Long downloadedSize = 0L;

    @Column(name = "retry_count")
    private Integer retryCount = 0;

    @Column(name = "error_message", length = 2000)
    private String errorMessage;

    @Column(name = "error_code", length = 50)
    private String errorCode;

    @Column(name = "start_time")
    private LocalDateTime startTime;

    @Column(name = "end_time")
    private LocalDateTime endTime;

    @Column(name = "duration_seconds")
    private Long durationSeconds;

    @Column(name = "old_version", length = 50)
    private String oldVersion;

    @Column(name = "new_version", length = 50)
    private String newVersion;

    @Column(name = "is_success_notified")
    private Boolean isSuccessNotified = false;

    @Column(name = "is_failure_notified")
    private Boolean isFailureNotified = false;

    @Column(name = "backup_version", length = 50)
    private String backupVersion;

    @Column(name = "is_rollback_needed")
    private Boolean isRollbackNeeded = false;

    @Column(name = "is_rollback_in_progress")
    private Boolean isRollbackInProgress = false;

    @Column(name = "rollback_stage", length = 50)
    private String rollbackStage;

    @Column(name = "rollback_error_message", length = 2000)
    private String rollbackErrorMessage;

    @Column(name = "was_interrupted")
    private Boolean wasInterrupted = false;

    @Column(name = "interruption_stage", length = 50)
    private String interruptionStage;

    @Column(name = "last_progress_update")
    private LocalDateTime lastProgressUpdate;

    @Column(name = "can_resume")
    private Boolean canResume = false;

    @Column(name = "resume_count")
    private Integer resumeCount = 0;

    @Column(name = "max_resume_attempts")
    private Integer maxResumeAttempts = 3;

    @CreationTimestamp
    @Column(name = "created_at", nullable = false, updatable = false)
    private LocalDateTime createdAt;

    @UpdateTimestamp
    @Column(name = "updated_at")
    private LocalDateTime updatedAt;
}
