package com.ota.platform.repository;

import com.ota.platform.entity.UpgradeTask;
import org.springframework.data.domain.Page;
import org.springframework.data.domain.Pageable;
import org.springframework.data.jpa.repository.JpaRepository;
import org.springframework.data.jpa.repository.Query;
import org.springframework.data.repository.query.Param;
import org.springframework.stereotype.Repository;

import java.time.LocalDateTime;
import java.util.List;

@Repository
public interface UpgradeTaskRepository extends JpaRepository<UpgradeTask, Long> {

    Page<UpgradeTask> findByStatus(String status, Pageable pageable);

    Page<UpgradeTask> findByFirmwareId(Long firmwareId, Pageable pageable);

    List<UpgradeTask> findByStatus(String status);

    List<UpgradeTask> findByStatusIn(List<String> statuses);

    @Query("SELECT t FROM UpgradeTask t WHERE t.status = 'PENDING' AND t.scheduleTime <= :now")
    List<UpgradeTask> findScheduledTasksToExecute(@Param("now") LocalDateTime now);

    @Query("SELECT t FROM UpgradeTask t WHERE t.status = 'RUNNING' AND t.isGrayscale = true")
    List<UpgradeTask> findRunningGrayscaleTasks();

    @Query("SELECT COUNT(t) FROM UpgradeTask t WHERE t.createdAt >= :startDate")
    long countByCreatedAtAfter(@Param("startDate") LocalDateTime startDate);

    @Query("SELECT t.status, COUNT(t) FROM UpgradeTask t GROUP BY t.status")
    List<Object[]> countByStatus();

    @Query("SELECT SUM(t.successDevices), SUM(t.failedDevices) FROM UpgradeTask t")
    Object[] getTotalUpgradeResult();

    @Query("SELECT FUNCTION('DATE', t.createdAt), COUNT(t) FROM UpgradeTask t " +
           "WHERE t.createdAt >= :startDate GROUP BY FUNCTION('DATE', t.createdAt)")
    List<Object[]> getTaskCountByDate(@Param("startDate") LocalDateTime startDate);
}
