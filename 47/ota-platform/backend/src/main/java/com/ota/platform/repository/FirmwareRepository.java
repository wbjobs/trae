package com.ota.platform.repository;

import com.ota.platform.entity.Firmware;
import org.springframework.data.domain.Page;
import org.springframework.data.domain.Pageable;
import org.springframework.data.jpa.repository.JpaRepository;
import org.springframework.data.jpa.repository.Query;
import org.springframework.data.repository.query.Param;
import org.springframework.stereotype.Repository;

import java.time.LocalDateTime;
import java.util.List;
import java.util.Optional;

@Repository
public interface FirmwareRepository extends JpaRepository<Firmware, Long> {

    Optional<Firmware> findByVersion(String version);

    boolean existsByVersion(String version);

    Page<Firmware> findByIsPublished(Boolean isPublished, Pageable pageable);

    List<Firmware> findByIsPublishedTrueOrderByCreatedAtDesc();

    @Query("SELECT f FROM Firmware f WHERE f.isPublished = true AND f.modelRestriction LIKE %:model% ORDER BY f.createdAt DESC")
    List<Firmware> findPublishedFirmwareByModel(@Param("model") String model);

    @Query("SELECT f FROM Firmware f WHERE f.isPublished = true AND f.modelRestriction LIKE %:model% " +
           "AND (f.hardwareVersionMin IS NULL OR f.hardwareVersionMin <= :hardwareVersion) " +
           "AND (f.hardwareVersionMax IS NULL OR f.hardwareVersionMax >= :hardwareVersion) " +
           "ORDER BY f.createdAt DESC")
    List<Firmware> findCompatibleFirmware(@Param("model") String model, @Param("hardwareVersion") String hardwareVersion);

    @Query("SELECT COUNT(f) FROM Firmware f WHERE f.createdAt >= :startDate")
    long countByCreatedAtAfter(@Param("startDate") LocalDateTime startDate);

    @Query("SELECT SUM(f.upgradeCount) FROM Firmware f")
    Long getTotalUpgradeCount();

    @Query("SELECT SUM(f.successCount) FROM Firmware f")
    Long getTotalSuccessCount();

    @Query("SELECT SUM(f.failureCount) FROM Firmware f")
    Long getTotalFailureCount();

    @Query("SELECT f.version, f.successCount, f.failureCount FROM Firmware f WHERE f.isPublished = true ORDER BY f.createdAt DESC")
    List<Object[]> getFirmwareUpgradeStats();

    @Query("SELECT f FROM Firmware f WHERE f.isPublished = true AND f.modelRestriction = :model AND f.version < :version ORDER BY f.createdAt DESC")
    List<Firmware> findOlderPublishedFirmwares(@Param("model") String model, @Param("version") String version);
}
