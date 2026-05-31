package com.ota.platform.controller;

import com.ota.platform.dto.ApiResponse;
import com.ota.platform.dto.PageResult;
import com.ota.platform.entity.Firmware;
import com.ota.platform.service.FirmwareService;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.core.io.FileSystemResource;
import org.springframework.core.io.Resource;
import org.springframework.data.domain.PageRequest;
import org.springframework.data.domain.Pageable;
import org.springframework.data.domain.Sort;
import org.springframework.http.HttpHeaders;
import org.springframework.http.MediaType;
import org.springframework.http.ResponseEntity;
import org.springframework.web.bind.annotation.*;
import org.springframework.web.multipart.MultipartFile;

import java.io.File;
import java.util.List;

@RestController
@RequestMapping("/api/firmware")
public class FirmwareController {

    @Autowired
    private FirmwareService firmwareService;

    @PostMapping("/upload")
    public ApiResponse<Firmware> uploadFirmware(
            @RequestParam("file") MultipartFile file,
            @RequestParam("name") String name,
            @RequestParam("version") String version,
            @RequestParam(required = false) String description,
            @RequestParam(required = false) String modelRestriction,
            @RequestParam(required = false) String hardwareVersionMin,
            @RequestParam(required = false) String hardwareVersionMax,
            @RequestParam(required = false) String releaseNotes,
            @RequestParam(defaultValue = "false") boolean encrypt) throws Exception {

        Firmware firmware = firmwareService.uploadFirmware(
                file, name, version, description, modelRestriction,
                hardwareVersionMin, hardwareVersionMax, releaseNotes, encrypt);

        return ApiResponse.success("Firmware uploaded successfully", firmware);
    }

    @GetMapping
    public ApiResponse<PageResult<Firmware>> getAllFirmware(
            @RequestParam(defaultValue = "0") int page,
            @RequestParam(defaultValue = "20") int size,
            @RequestParam(defaultValue = "false") boolean publishedOnly) {

        Pageable pageable = PageRequest.of(page, size, Sort.by(Sort.Direction.DESC, "createdAt"));
        PageResult<Firmware> result;

        if (publishedOnly) {
            result = firmwareService.getPublishedFirmware(pageable);
        } else {
            result = firmwareService.getAllFirmware(pageable);
        }

        return ApiResponse.success(result);
    }

    @GetMapping("/{id}")
    public ApiResponse<Firmware> getFirmwareById(@PathVariable Long id) {
        Firmware firmware = firmwareService.getFirmwareById(id);
        return ApiResponse.success(firmware);
    }

    @GetMapping("/model/{model}")
    public ApiResponse<List<Firmware>> getPublishedFirmwareForModel(@PathVariable String model) {
        List<Firmware> firmwareList = firmwareService.getPublishedFirmwareForModel(model);
        return ApiResponse.success(firmwareList);
    }

    @GetMapping("/compatible")
    public ApiResponse<List<Firmware>> getCompatibleFirmware(
            @RequestParam String model,
            @RequestParam String hardwareVersion) {
        List<Firmware> firmwareList = firmwareService.getCompatibleFirmware(model, hardwareVersion);
        return ApiResponse.success(firmwareList);
    }

    @PostMapping("/{id}/publish")
    public ApiResponse<Firmware> publishFirmware(@PathVariable Long id) {
        Firmware firmware = firmwareService.publishFirmware(id);
        return ApiResponse.success("Firmware published successfully", firmware);
    }

    @PostMapping("/{id}/unpublish")
    public ApiResponse<Firmware> unpublishFirmware(@PathVariable Long id) {
        Firmware firmware = firmwareService.unpublishFirmware(id);
        return ApiResponse.success("Firmware unpublished successfully", firmware);
    }

    @PutMapping("/{id}")
    public ApiResponse<Firmware> updateFirmware(@PathVariable Long id, @RequestBody Firmware firmwareDetails) {
        Firmware updatedFirmware = firmwareService.updateFirmware(id, firmwareDetails);
        return ApiResponse.success("Firmware updated successfully", updatedFirmware);
    }

    @DeleteMapping("/{id}")
    public ApiResponse<Void> deleteFirmware(@PathVariable Long id) throws Exception {
        firmwareService.deleteFirmware(id);
        return ApiResponse.success("Firmware deleted successfully", null);
    }

    @GetMapping("/{id}/download")
    public ResponseEntity<Resource> downloadFirmware(@PathVariable Long id) {
        Firmware firmware = firmwareService.getFirmwareById(id);
        File file = firmwareService.getFirmwareFile(id);

        Resource resource = new FileSystemResource(file);

        return ResponseEntity.ok()
                .contentType(MediaType.APPLICATION_OCTET_STREAM)
                .header(HttpHeaders.CONTENT_DISPOSITION,
                        "attachment; filename=\"" + firmware.getFileName() + "\"")
                .header("X-Firmware-Hash", firmware.getFileHash())
                .header("X-Firmware-Signature", firmware.getSignature())
                .header("X-Firmware-Version", firmware.getVersion())
                .header("X-Firmware-Encrypted", String.valueOf(firmware.getIsEncrypted()))
                .body(resource);
    }
}
