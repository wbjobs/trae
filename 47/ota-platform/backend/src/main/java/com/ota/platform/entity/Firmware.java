package com.ota.platform.entity;

import jakarta.persistence.*;
import lombok.Data;
import org.hibernate.annotations.CreationTimestamp;
import org.hibernate.annotations.UpdateTimestamp;

import java.time.LocalDateTime;

@Data
@Entity
@Table(name = "firmwares")
public class Firmware {

    @Id
    @GeneratedValue(strategy = GenerationType.IDENTITY)
    private Long id;

    @Column(nullable = false, length = 100)
    private String name;

    @Column(nullable = false, length = 50)
    private String version;

    @Column(length = 500)
    private String description;

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

    @Column(name = "is_encrypted")
    private Boolean isEncrypted = false;

    @Column(name = "encryption_algorithm", length = 50)
    private String encryptionAlgorithm;

    @Column(name = "signature_algorithm", length = 50)
    private String signatureAlgorithm = "RSA256";

    @Column(name = "model_restriction", length = 200)
    private String modelRestriction;

    @Column(name = "hardware_version_min", length = 50)
    private String hardwareVersionMin;

    @Column(name = "hardware_version_max", length = 50)
    private String hardwareVersionMax;

    @Column(name = "is_published")
    private Boolean isPublished = false;

    @Column(name = "published_at")
    private LocalDateTime publishedAt;

    @Column(name = "release_notes", length = 2000)
    private String releaseNotes;

    @Column(name = "upgrade_count")
    private Integer upgradeCount = 0;

    @Column(name = "success_count")
    private Integer successCount = 0;

    @Column(name = "failure_count")
    private Integer failureCount = 0;

    @CreationTimestamp
    @Column(name = "created_at", nullable = false, updatable = false)
    private LocalDateTime createdAt;

    @UpdateTimestamp
    @Column(name = "updated_at")
    private LocalDateTime updatedAt;
}
