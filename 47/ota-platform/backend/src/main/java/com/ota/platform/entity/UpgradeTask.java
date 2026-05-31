package com.ota.platform.entity;

import jakarta.persistence.*;
import lombok.Data;
import org.hibernate.annotations.CreationTimestamp;
import org.hibernate.annotations.UpdateTimestamp;

import java.time.LocalDateTime;
import java.util.ArrayList;
import java.util.List;

@Data
@Entity
@Table(name = "upgrade_tasks")
public class UpgradeTask {

    @Id
    @GeneratedValue(strategy = GenerationType.IDENTITY)
    private Long id;

    @Column(nullable = false, length = 100)
    private String name;

    @Column(length = 500)
    private String description;

    @ManyToOne(fetch = FetchType.LAZY)
    @JoinColumn(name = "firmware_id", nullable = false)
    private Firmware firmware;

    @Column(name = "task_type", nullable = false, length = 20)
    private String taskType = "MANUAL";

    @Column(name = "target_type", nullable = false, length = 20)
    private String targetType = "DEVICES";

    @Column(name = "target_ids", length = 2000)
    private String targetIds;

    @Column(name = "is_grayscale")
    private Boolean isGrayscale = false;

    @Column(name = "grayscale_percentage")
    private Integer grayscalePercentage = 0;

    @Column(name = "grayscale_device_count")
    private Integer grayscaleDeviceCount = 0;

    @Column(name = "schedule_time")
    private LocalDateTime scheduleTime;

    @Column(name = "start_time")
    private LocalDateTime startTime;

    @Column(name = "end_time")
    private LocalDateTime endTime;

    @Column(nullable = false, length = 20)
    private String status = "PENDING";

    @Column(name = "total_devices")
    private Integer totalDevices = 0;

    @Column(name = "pending_devices")
    private Integer pendingDevices = 0;

    @Column(name = "upgrading_devices")
    private Integer upgradingDevices = 0;

    @Column(name = "success_devices")
    private Integer successDevices = 0;

    @Column(name = "failed_devices")
    private Integer failedDevices = 0;

    @Column(name = "cancelled_devices")
    private Integer cancelledDevices = 0;

    @Column(name = "timeout_seconds")
    private Integer timeoutSeconds = 3600;

    @Column(name = "max_retry_count")
    private Integer maxRetryCount = 3;

    @Column(name = "is_force_upgrade")
    private Boolean isForceUpgrade = false;

    @Column(name = "created_by", length = 100)
    private String createdBy;

    @Column(length = 2000)
    private String remarks;

    @OneToMany(mappedBy = "task", cascade = CascadeType.ALL, fetch = FetchType.LAZY)
    private List<UpgradeProgress> upgradeProgresses = new ArrayList<>();

    @CreationTimestamp
    @Column(name = "created_at", nullable = false, updatable = false)
    private LocalDateTime createdAt;

    @UpdateTimestamp
    @Column(name = "updated_at")
    private LocalDateTime updatedAt;
}
