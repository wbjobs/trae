package com.ota.platform.repository;

import com.ota.platform.entity.Device;
import org.springframework.data.domain.Page;
import org.springframework.data.domain.Pageable;
import org.springframework.data.jpa.repository.JpaRepository;
import org.springframework.data.jpa.repository.Modifying;
import org.springframework.data.jpa.repository.Query;
import org.springframework.data.repository.query.Param;
import org.springframework.stereotype.Repository;

import java.time.LocalDateTime;
import java.util.List;
import java.util.Optional;

@Repository
public interface DeviceRepository extends JpaRepository<Device, Long> {

    Optional<Device> findByDeviceId(String deviceId);

    boolean existsByDeviceId(String deviceId);

    Page<Device> findByStatus(String status, Pageable pageable);

    Page<Device> findByGroupId(Long groupId, Pageable pageable);

    Page<Device> findByFirmwareVersion(String firmwareVersion, Pageable pageable);

    List<Device> findByStatus(String status);

    List<Device> findByGroupId(Long groupId);

    List<Device> findByStatusAndGroupId(String status, Long groupId);

    @Query("SELECT d FROM Device d WHERE d.lastHeartbeat < :timeout")
    List<Device> findDevicesWithExpiredHeartbeat(@Param("timeout") LocalDateTime timeout);

    @Query("SELECT d.firmwareVersion, COUNT(d) FROM Device d GROUP BY d.firmwareVersion")
    List<Object[]> countByFirmwareVersion();

    @Query("SELECT d.status, COUNT(d) FROM Device d GROUP BY d.status")
    List<Object[]> countByStatus();

    long countByStatus(String status);

    long countByGroupId(Long groupId);

    @Modifying
    @Query("UPDATE Device d SET d.status = :status WHERE d.deviceId = :deviceId")
    int updateStatusByDeviceId(@Param("deviceId") String deviceId, @Param("status") String status);

    @Modifying
    @Query("UPDATE Device d SET d.lastHeartbeat = :lastHeartbeat, d.status = 'ONLINE' WHERE d.deviceId = :deviceId")
    int updateHeartbeat(@Param("deviceId") String deviceId, @Param("lastHeartbeat") LocalDateTime lastHeartbeat);
}
