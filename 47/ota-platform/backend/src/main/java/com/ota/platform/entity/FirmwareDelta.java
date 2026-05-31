package com.ota.platform.entity;

import jakarta.persistence.*;
import lombok.Data;
import org.hibernate.annotations.CreationTimestamp;
import org.hibernate.annotations.UpdateTimestamp;

import java.time.LocalDateTime;

@Data
@Entity
@Table(name = "firmware_deltas")
public class FirmwareDelta {

    @Id
    @GeneratedValue(strategy = GenerationType.IDENTITY)
    private Long id;

    @ManyToOne(fetch = FetchType.LAZY)
    @JoinColumn(name = "from_firmware_id", nullable = false)
    private Firmware fromFirmware;

    @ManyToOne(fetch = FetchType.LAZY)
    @JoinColumn(name = "to_firmware_id", nullable = false)
    private Firmware toFirmware;

    @Column(name = "file_path", nullable = false)
    private String filePath;

    @Column(name = "file_name", nullable = false)
    private String fileName;

    @Column(name = "file_size", nullable = false)
    private Long fileSize;

    @Column(name = "file_hash", nullable = false, length = 64)
    private String fileHash;

    @Column(name = "signature", length = 1024)
    private String signature;

    @Column(name = "delta_algorithm", length = 50)
    private String deltaAlgorithm = "CUSTOM_BSDIFF";

    @Column(name = "is_encrypted")
    private Boolean isEncrypted = false;

    @Column(name = "original_size")
    private Long originalSize;

    @Column(name = "compression_ratio")
    private Double compressionRatio;

    @Column(name = "is_generated")
    private Boolean isGenerated = false;

    @Column(name = "generated_at")
    private LocalDateTime generatedAt;

    @Column(name = "generation_error", length = 2000)
    private String generationError;

    @Column(name = "download_count")
    private Integer downloadCount = 0;

    @Column(name = "apply_success_count")
    private Integer applySuccessCount = 0;

    @Column(name = "apply_failure_count")
    private Integer applyFailureCount = 0;

    @Column(length = 2000)
    private String description;

    @CreationTimestamp
    @Column(name = "created_at", nullable = false, updatable = false)
    private LocalDateTime createdAt;

    @UpdateTimestamp
    @Column(name = "updated_at")
    private LocalDateTime updatedAt;
}
