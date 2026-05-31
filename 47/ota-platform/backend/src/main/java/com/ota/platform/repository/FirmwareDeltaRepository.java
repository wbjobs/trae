package com.ota.platform.repository;

import com.ota.platform.entity.FirmwareDelta;
import org.springframework.data.jpa.repository.JpaRepository;
import org.springframework.data.jpa.repository.Query;
import org.springframework.data.repository.query.Param;
import org.springframework.stereotype.Repository;

import java.util.List;
import java.util.Optional;

@Repository
public interface FirmwareDeltaRepository extends JpaRepository<FirmwareDelta, Long> {

    Optional<FirmwareDelta> findByFromFirmwareIdAndToFirmwareId(Long fromFirmwareId, Long toFirmwareId);

    List<FirmwareDelta> findByFromFirmwareId(Long fromFirmwareId);

    List<FirmwareDelta> findByToFirmwareId(Long toFirmwareId);

    List<FirmwareDelta> findByFromFirmwareIdAndIsGeneratedTrue(Long fromFirmwareId);

    List<FirmwareDelta> findByToFirmwareIdAndIsGeneratedTrue(Long toFirmwareId);

    @Query("SELECT d FROM FirmwareDelta d WHERE d.fromFirmware.version = :fromVersion AND d.toFirmware.version = :toVersion AND d.isGenerated = true")
    Optional<FirmwareDelta> findByVersions(@Param("fromVersion") String fromVersion, @Param("toVersion") String toVersion);

    @Query("SELECT d FROM FirmwareDelta d WHERE d.fromFirmware.modelRestriction = :model AND d.isGenerated = true ORDER BY d.toFirmware.version DESC")
    List<FirmwareDelta> findAvailableDeltasForModel(@Param("model") String model);

    boolean existsByFromFirmwareIdAndToFirmwareId(Long fromFirmwareId, Long toFirmwareId);

    @Query("SELECT COUNT(d) FROM FirmwareDelta d WHERE d.toFirmware.id = :firmwareId AND d.isGenerated = true")
    long countGeneratedDeltasForFirmware(@Param("firmwareId") Long firmwareId);
}
