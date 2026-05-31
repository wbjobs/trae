package com.ota.platform.service;

import com.ota.platform.dto.PageResult;
import com.ota.platform.entity.Firmware;
import com.ota.platform.repository.FirmwareRepository;
import com.ota.platform.security.EncryptionUtils;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.beans.factory.annotation.Value;
import org.springframework.data.domain.Pageable;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;
import org.springframework.web.multipart.MultipartFile;

import java.io.File;
import java.nio.file.Files;
import java.nio.file.Path;
import java.nio.file.Paths;
import java.nio.file.StandardCopyOption;
import java.security.KeyPair;
import java.security.PrivateKey;
import java.time.LocalDateTime;
import java.util.List;
import java.util.UUID;

@Service
public class FirmwareService {

    @Autowired
    private FirmwareRepository firmwareRepository;

    @Autowired
    private FirmwareDeltaService firmwareDeltaService;

    @Value("${ota.firmware.storage-path:./firmware-storage}")
    private String storagePath;

    @Value("${ota.encryption.aes-key:ota-encryption-key-256bit}")
    private String aesKey;

    private PrivateKey signingPrivateKey;

    public FirmwareService() {
        try {
            KeyPair keyPair = EncryptionUtils.generateRSAKeyPair();
            this.signingPrivateKey = keyPair.getPrivate();
        } catch (Exception e) {
            throw new RuntimeException("Failed to generate RSA keys", e);
        }
    }

    @Transactional
    public Firmware uploadFirmware(MultipartFile file, String name, String version, String description,
                                   String modelRestriction, String hardwareVersionMin, String hardwareVersionMax,
                                   String releaseNotes, boolean encrypt) throws Exception {

        if (firmwareRepository.existsByVersion(version)) {
            throw new RuntimeException("Firmware version already exists: " + version);
        }

        Path storageDir = Paths.get(storagePath);
        if (!Files.exists(storageDir)) {
            Files.createDirectories(storageDir);
        }

        String originalFilename = file.getOriginalFilename();
        String fileExtension = originalFilename != null ?
                originalFilename.substring(originalFilename.lastIndexOf(".")) : ".bin";
        String storedFileName = UUID.randomUUID().toString() + fileExtension;
        Path filePath = storageDir.resolve(storedFileName);

        File tempFile = File.createTempFile("firmware-", ".tmp");
        file.transferTo(tempFile);

        String fileHash = EncryptionUtils.calculateSHA256(tempFile);

        File finalFile;
        if (encrypt) {
            finalFile = new File(storageDir.toFile(), storedFileName);
            EncryptionUtils.encryptFile(tempFile, finalFile, aesKey);
        } else {
            finalFile = new File(storageDir.toFile(), storedFileName);
            Files.copy(tempFile.toPath(), finalFile.toPath(), StandardCopyOption.REPLACE_EXISTING);
        }

        byte[] fileContent = Files.readAllBytes(tempFile.toPath());
        String signature = EncryptionUtils.signData(fileContent, signingPrivateKey);

        tempFile.delete();

        Firmware firmware = new Firmware();
        firmware.setName(name);
        firmware.setVersion(version);
        firmware.setDescription(description);
        firmware.setFilePath(filePath.toString());
        firmware.setFileName(storedFileName);
        firmware.setFileSize(file.getSize());
        firmware.setFileHash(fileHash);
        firmware.setSignature(signature);
        firmware.setIsEncrypted(encrypt);
        firmware.setEncryptionAlgorithm(encrypt ? "AES-256" : null);
        firmware.setModelRestriction(modelRestriction);
        firmware.setHardwareVersionMin(hardwareVersionMin);
        firmware.setHardwareVersionMax(hardwareVersionMax);
        firmware.setReleaseNotes(releaseNotes);
        firmware.setIsPublished(false);
        firmware.setUpgradeCount(0);
        firmware.setSuccessCount(0);
        firmware.setFailureCount(0);

        return firmwareRepository.save(firmware);
    }

    public Firmware getFirmwareById(Long id) {
        return firmwareRepository.findById(id)
                .orElseThrow(() -> new RuntimeException("Firmware not found with id: " + id));
    }

    public PageResult<Firmware> getAllFirmware(Pageable pageable) {
        return PageResult.from(firmwareRepository.findAll(pageable));
    }

    public PageResult<Firmware> getPublishedFirmware(Pageable pageable) {
        return PageResult.from(firmwareRepository.findByIsPublished(true, pageable));
    }

    public List<Firmware> getPublishedFirmwareForModel(String model) {
        return firmwareRepository.findPublishedFirmwareByModel(model);
    }

    public List<Firmware> getCompatibleFirmware(String model, String hardwareVersion) {
        return firmwareRepository.findCompatibleFirmware(model, hardwareVersion);
    }

    @Transactional
    public Firmware publishFirmware(Long id) {
        Firmware firmware = getFirmwareById(id);
        if (firmware.getIsPublished()) {
            throw new RuntimeException("Firmware is already published");
        }
        firmware.setIsPublished(true);
        firmware.setPublishedAt(LocalDateTime.now());
        Firmware savedFirmware = firmwareRepository.save(firmware);
        
        firmwareDeltaService.generateAllDeltasForNewFirmware(id);
        
        return savedFirmware;
    }

    @Transactional
    public Firmware unpublishFirmware(Long id) {
        Firmware firmware = getFirmwareById(id);
        firmware.setIsPublished(false);
        return firmwareRepository.save(firmware);
    }

    @Transactional
    public Firmware updateFirmware(Long id, Firmware firmwareDetails) {
        Firmware firmware = getFirmwareById(id);
        firmware.setName(firmwareDetails.getName());
        firmware.setDescription(firmwareDetails.getDescription());
        firmware.setModelRestriction(firmwareDetails.getModelRestriction());
        firmware.setHardwareVersionMin(firmwareDetails.getHardwareVersionMin());
        firmware.setHardwareVersionMax(firmwareDetails.getHardwareVersionMax());
        firmware.setReleaseNotes(firmwareDetails.getReleaseNotes());
        return firmwareRepository.save(firmware);
    }

    @Transactional
    public void deleteFirmware(Long id) throws Exception {
        Firmware firmware = getFirmwareById(id);
        File file = new File(firmware.getFilePath());
        if (file.exists()) {
            Files.delete(file.toPath());
        }
        firmwareRepository.delete(firmware);
    }

    public File getFirmwareFile(Long id) {
        Firmware firmware = getFirmwareById(id);
        File file = new File(firmware.getFilePath());
        if (!file.exists()) {
            throw new RuntimeException("Firmware file not found");
        }
        return file;
    }

    public boolean verifyFirmwareSignature(Long id, byte[] data) throws Exception {
        Firmware firmware = getFirmwareById(id);
        return EncryptionUtils.verifySignature(data, firmware.getSignature(), signingPrivateKey.getEncoded() != null ?
                EncryptionUtils.decodePublicKey(EncryptionUtils.encodePublicKey(signingPrivateKey.getEncoded() != null ?
                        signingPrivateKey.getEncoded() : null)) : null);
    }

    public void incrementUpgradeCount(Long id, boolean success) {
        Firmware firmware = getFirmwareById(id);
        firmware.setUpgradeCount(firmware.getUpgradeCount() + 1);
        if (success) {
            firmware.setSuccessCount(firmware.getSuccessCount() + 1);
        } else {
            firmware.setFailureCount(firmware.getFailureCount() + 1);
        }
        firmwareRepository.save(firmware);
    }

    public long getTotalFirmwareCount() {
        return firmwareRepository.count();
    }

    public long getPublishedFirmwareCount() {
        return firmwareRepository.count();
    }

    public List<Object[]> getFirmwareUpgradeStats() {
        return firmwareRepository.getFirmwareUpgradeStats();
    }

    public PrivateKey getSigningPrivateKey() {
        return signingPrivateKey;
    }
}
