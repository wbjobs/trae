package com.ota.platform.service;

import com.ota.platform.entity.Firmware;
import com.ota.platform.entity.FirmwareDelta;
import com.ota.platform.repository.FirmwareDeltaRepository;
import com.ota.platform.repository.FirmwareRepository;
import com.ota.platform.security.DeltaUtils;
import com.ota.platform.security.EncryptionUtils;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.beans.factory.annotation.Value;
import org.springframework.scheduling.annotation.Async;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

import java.io.File;
import java.nio.file.Files;
import java.nio.file.Path;
import java.nio.file.Paths;
import java.security.PrivateKey;
import java.time.LocalDateTime;
import java.util.List;
import java.util.UUID;

@Service
public class FirmwareDeltaService {

    @Autowired
    private FirmwareDeltaRepository firmwareDeltaRepository;

    @Autowired
    private FirmwareRepository firmwareRepository;

    @Autowired
    private FirmwareService firmwareService;

    @Value("${ota.firmware.storage-path:./firmware-storage}")
    private String storagePath;

    @Value("${ota.encryption.aes-key:ota-encryption-key-256bit}")
    private String aesKey;

    public List<FirmwareDelta> getDeltasForFromFirmware(Long fromFirmwareId) {
        return firmwareDeltaRepository.findByFromFirmwareId(fromFirmwareId);
    }

    public List<FirmwareDelta> getGeneratedDeltasForFromFirmware(Long fromFirmwareId) {
        return firmwareDeltaRepository.findByFromFirmwareIdAndIsGeneratedTrue(fromFirmwareId);
    }

    public List<FirmwareDelta> getGeneratedDeltasForToFirmware(Long toFirmwareId) {
        return firmwareDeltaRepository.findByToFirmwareIdAndIsGeneratedTrue(toFirmwareId);
    }

    public FirmwareDelta getDeltaById(Long id) {
        return firmwareDeltaRepository.findById(id)
                .orElseThrow(() -> new RuntimeException("Firmware delta not found with id: " + id));
    }

    public FirmwareDelta getDeltaByVersions(String fromVersion, String toVersion) {
        return firmwareDeltaRepository.findByVersions(fromVersion, toVersion)
                .orElseThrow(() -> new RuntimeException("Firmware delta not found for versions: " + fromVersion + " -> " + toVersion));
    }

    @Transactional
    public FirmwareDelta createDeltaRecord(Long fromFirmwareId, Long toFirmwareId, String description) {
        if (firmwareDeltaRepository.existsByFromFirmwareIdAndToFirmwareId(fromFirmwareId, toFirmwareId)) {
            throw new RuntimeException("Delta already exists for this firmware pair");
        }

        Firmware fromFirmware = firmwareRepository.findById(fromFirmwareId)
                .orElseThrow(() -> new RuntimeException("From firmware not found"));
        Firmware toFirmware = firmwareRepository.findById(toFirmwareId)
                .orElseThrow(() -> new RuntimeException("To firmware not found"));

        if (!isCompatible(fromFirmware, toFirmware)) {
            throw new RuntimeException("Firmwares are not compatible for delta generation");
        }

        FirmwareDelta delta = new FirmwareDelta();
        delta.setFromFirmware(fromFirmware);
        delta.setToFirmware(toFirmware);
        delta.setDescription(description);
        delta.setIsGenerated(false);
        delta.setOriginalSize(toFirmware.getFileSize());

        return firmwareDeltaRepository.save(delta);
    }

    @Async
    @Transactional
    public void generateDeltaAsync(Long deltaId) {
        try {
            generateDelta(deltaId);
        } catch (Exception e) {
            FirmwareDelta delta = firmwareDeltaRepository.findById(deltaId).orElse(null);
            if (delta != null) {
                delta.setIsGenerated(false);
                delta.setGenerationError(e.getMessage());
                firmwareDeltaRepository.save(delta);
            }
        }
    }

    @Transactional
    public FirmwareDelta generateDelta(Long deltaId) throws Exception {
        FirmwareDelta delta = getDeltaById(deltaId);
        
        if (delta.getIsGenerated()) {
            return delta;
        }

        Firmware fromFirmware = delta.getFromFirmware();
        Firmware toFirmware = delta.getToFirmware();

        File fromFile = new File(fromFirmware.getFilePath());
        File toFile = new File(toFirmware.getFilePath());

        if (!fromFile.exists() || !toFile.exists()) {
            throw new RuntimeException("Firmware files not found");
        }

        Path deltaDir = Paths.get(storagePath, "deltas");
        if (!Files.exists(deltaDir)) {
            Files.createDirectories(deltaDir);
        }

        String deltaFileName = UUID.randomUUID().toString() + ".delta";
        Path deltaFilePath = deltaDir.resolve(deltaFileName);
        File deltaFile = deltaFilePath.toFile();

        DeltaUtils.generateDeltaFile(fromFile, toFile, deltaFile);

        boolean encrypt = toFirmware.getIsEncrypted();
        File finalFile;
        if (encrypt) {
            finalFile = new File(deltaDir.toFile(), deltaFileName + ".enc");
            EncryptionUtils.encryptFile(deltaFile, finalFile, aesKey);
            deltaFile.delete();
        } else {
            finalFile = deltaFile;
        }

        String fileHash = EncryptionUtils.calculateSHA256(finalFile);

        byte[] fileContent = Files.readAllBytes(finalFile.toPath());
        PrivateKey signingKey = firmwareService.getSigningPrivateKey();
        String signature = EncryptionUtils.signData(fileContent, signingKey);

        long deltaSize = finalFile.length();
        double compressionRatio = (double) (toFirmware.getFileSize() - deltaSize) / toFirmware.getFileSize() * 100;

        delta.setFilePath(finalFile.getAbsolutePath());
        delta.setFileName(finalFile.getName());
        delta.setFileSize(deltaSize);
        delta.setFileHash(fileHash);
        delta.setSignature(signature);
        delta.setIsEncrypted(encrypt);
        delta.setCompressionRatio(compressionRatio);
        delta.setIsGenerated(true);
        delta.setGeneratedAt(LocalDateTime.now());
        delta.setGenerationError(null);

        return firmwareDeltaRepository.save(delta);
    }

    @Transactional
    public FirmwareDelta generateDeltaForFirmwares(Long fromFirmwareId, Long toFirmwareId) throws Exception {
        FirmwareDelta delta = createDeltaRecord(fromFirmwareId, toFirmwareId, null);
        return generateDelta(delta.getId());
    }

    @Transactional
    public void generateAllDeltasForNewFirmware(Long newFirmwareId) {
        Firmware newFirmware = firmwareRepository.findById(newFirmwareId)
                .orElseThrow(() -> new RuntimeException("Firmware not found"));

        List<Firmware> olderFirmwares = firmwareRepository.findOlderPublishedFirmwares(
                newFirmware.getModelRestriction(), newFirmware.getVersion());

        for (Firmware olderFirmware : olderFirmwares) {
            try {
                if (!firmwareDeltaRepository.existsByFromFirmwareIdAndToFirmwareId(olderFirmware.getId(), newFirmwareId)) {
                    FirmwareDelta delta = createDeltaRecord(olderFirmware.getId(), newFirmwareId,
                            "Auto-generated delta from " + olderFirmware.getVersion() + " to " + newFirmware.getVersion());
                    generateDeltaAsync(delta.getId());
                }
            } catch (Exception e) {
                System.err.println("Failed to generate delta for " + olderFirmware.getVersion() + " -> " + newFirmware.getVersion() + ": " + e.getMessage());
            }
        }
    }

    public File getDeltaFile(Long deltaId) {
        FirmwareDelta delta = getDeltaById(deltaId);
        if (!delta.getIsGenerated()) {
            throw new RuntimeException("Delta not generated yet");
        }
        File file = new File(delta.getFilePath());
        if (!file.exists()) {
            throw new RuntimeException("Delta file not found");
        }
        incrementDownloadCount(deltaId);
        return file;
    }

    @Transactional
    public void incrementDownloadCount(Long deltaId) {
        FirmwareDelta delta = getDeltaById(deltaId);
        delta.setDownloadCount(delta.getDownloadCount() + 1);
        firmwareDeltaRepository.save(delta);
    }

    @Transactional
    public void incrementApplyCount(Long deltaId, boolean success) {
        FirmwareDelta delta = getDeltaById(deltaId);
        if (success) {
            delta.setApplySuccessCount(delta.getApplySuccessCount() + 1);
        } else {
            delta.setApplyFailureCount(delta.getApplyFailureCount() + 1);
        }
        firmwareDeltaRepository.save(delta);
    }

    @Transactional
    public void deleteDelta(Long deltaId) throws Exception {
        FirmwareDelta delta = getDeltaById(deltaId);
        File file = new File(delta.getFilePath());
        if (file.exists()) {
            Files.delete(file.toPath());
        }
        firmwareDeltaRepository.delete(delta);
    }

    public FirmwareDelta getBestDeltaForDevice(String currentVersion, String targetVersion, String model) {
        List<FirmwareDelta> deltas = firmwareDeltaRepository.findAvailableDeltasForModel(model);
        
        for (FirmwareDelta delta : deltas) {
            if (delta.getFromFirmware().getVersion().equals(currentVersion) &&
                delta.getToFirmware().getVersion().equals(targetVersion)) {
                return delta;
            }
        }
        
        return null;
    }

    private boolean isCompatible(Firmware from, Firmware to) {
        if (from.getModelRestriction() != null && to.getModelRestriction() != null) {
            return from.getModelRestriction().equals(to.getModelRestriction());
        }
        return true;
    }

    public long getGeneratedDeltaCountForFirmware(Long firmwareId) {
        return firmwareDeltaRepository.countGeneratedDeltasForFirmware(firmwareId);
    }
}
