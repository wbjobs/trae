package com.ota.platform.repository;

import com.ota.platform.entity.UpgradeProgress;
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
public interface UpgradeProgressRepository extends JpaRepository<UpgradeProgress, Long> {

    Page<UpgradeProgress> findByTaskId(Long taskId, Pageable pageable);

    Page<UpgradeProgress> findByDeviceId(Long deviceId, Pageable pageable);

    List<UpgradeProgress> findByTaskId(Long taskId);

    List<UpgradeProgress> findByTaskIdAndStatus(Long taskId, String status);

    List<UpgradeProgress> findByDeviceId(Long deviceId);

    Optional<UpgradeProgress> findByTaskIdAndDeviceId(Long taskId, Long deviceId);

    long countByTaskId(Long taskId);

    long countByTaskIdAndStatus(Long taskId, String status);

    @Query("SELECT COUNT(p) FROM UpgradeProgress p WHERE p.device.id = :deviceId AND p.status = 'SUCCESS'")
    long countSuccessfulUpgradesByDevice(@Param("deviceId") Long deviceId);

    @Query("SELECT COUNT(p) FROM UpgradeProgress p WHERE p.device.id = :deviceId AND p.status = 'FAILED'")
    long countFailedUpgradesByDevice(@Param("deviceId") Long deviceId);

    @Query("SELECT p FROM UpgradeProgress p WHERE p.status = 'UPGRADING' AND p.startTime < :timeout")
    List<UpgradeProgress> findUpgradingTasksWithTimeout(@Param("timeout") LocalDateTime timeout);

    @Query("SELECT p.status, COUNT(p) FROM UpgradeProgress p WHERE p.task.id = :taskId GROUP BY p.status")
    List<Object[]> countByTaskIdGroupByStatus(@Param("taskId") Long taskId);

    @Query("SELECT p FROM UpgradeProgress p WHERE p.device.id = :deviceId AND p.status = 'UPGRADING' ORDER BY p.createdAt DESC")
    List<UpgradeProgress> findUpgradingProgressByDevice(@Param("deviceId") Long deviceId);

    @Query("SELECT p FROM UpgradeProgress p WHERE p.device.id = :deviceId AND p.status IN ('UPGRADING', 'PENDING') AND p.wasInterrupted = false ORDER BY p.createdAt DESC")
    List<UpgradeProgress> findActiveUpgradeByDevice(@Param("deviceId") Long deviceId);

    @Query("SELECT p FROM UpgradeProgress p WHERE p.status = 'UPGRADING' AND p.lastProgressUpdate < :timeout")
    List<UpgradeProgress> findStuckUpgradingProgress(@Param("timeout") LocalDateTime timeout);

    Optional<UpgradeProgress> findFirstByDeviceIdAndStatusOrderByCreatedAtDesc(Long deviceId, String status);

    List<UpgradeProgress> findByDeviceIdAndStatusIn(Long deviceId, List<String> statuses);
}
