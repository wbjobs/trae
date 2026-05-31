package com.ota.platform.controller;

import com.ota.platform.dto.ApiResponse;
import com.ota.platform.entity.FirmwareDelta;
import com.ota.platform.service.FirmwareDeltaService;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.core.io.FileSystemResource;
import org.springframework.core.io.Resource;
import org.springframework.http.HttpHeaders;
import org.springframework.http.MediaType;
import org.springframework.http.ResponseEntity;
import org.springframework.web.bind.annotation.*;

import java.util.List;
import java.util.Map;

@RestController
@RequestMapping("/api/firmware-deltas")
public class FirmwareDeltaController {

    @Autowired
    private FirmwareDeltaService firmwareDeltaService;

    @GetMapping("/from/{fromFirmwareId}")
    public ApiResponse<List<FirmwareDelta>> getDeltasForFromFirmware(@PathVariable Long fromFirmwareId) {
        List<FirmwareDelta> deltas = firmwareDeltaService.getGeneratedDeltasForFromFirmware(fromFirmwareId);
        return ApiResponse.success(deltas);
    }

    @GetMapping("/to/{toFirmwareId}")
    public ApiResponse<List<FirmwareDelta>> getDeltasForToFirmware(@PathVariable Long toFirmwareId) {
        List<FirmwareDelta> deltas = firmwareDeltaService.getGeneratedDeltasForToFirmware(toFirmwareId);
        return ApiResponse.success(deltas);
    }

    @GetMapping("/{id}")
    public ApiResponse<FirmwareDelta> getDeltaById(@PathVariable Long id) {
        FirmwareDelta delta = firmwareDeltaService.getDeltaById(id);
        return ApiResponse.success(delta);
    }

    @GetMapping("/versions/{fromVersion}/{toVersion}")
    public ApiResponse<FirmwareDelta> getDeltaByVersions(@PathVariable String fromVersion, @PathVariable String toVersion) {
        FirmwareDelta delta = firmwareDeltaService.getDeltaByVersions(fromVersion, toVersion);
        return ApiResponse.success(delta);
    }

    @PostMapping
    public ApiResponse<FirmwareDelta> createDelta(@RequestBody Map<String, Object> request) throws Exception {
        Long fromFirmwareId = ((Number) request.get("fromFirmwareId")).longValue();
        Long toFirmwareId = ((Number) request.get("toFirmwareId")).longValue();
        String description = (String) request.get("description");

        FirmwareDelta delta = firmwareDeltaService.createDeltaRecord(fromFirmwareId, toFirmwareId, description);
        firmwareDeltaService.generateDeltaAsync(delta.getId());

        return ApiResponse.success("Delta generation started", delta);
    }

    @PostMapping("/{id}/generate")
    public ApiResponse<FirmwareDelta> generateDelta(@PathVariable Long id) throws Exception {
        FirmwareDelta delta = firmwareDeltaService.generateDelta(id);
        return ApiResponse.success("Delta generated successfully", delta);
    }

    @PostMapping("/generate-all/{newFirmwareId}")
    public ApiResponse<String> generateAllDeltas(@PathVariable Long newFirmwareId) {
        firmwareDeltaService.generateAllDeltasForNewFirmware(newFirmwareId);
        return ApiResponse.success("Delta generation started for all compatible older versions");
    }

    @GetMapping("/{id}/download")
    public ResponseEntity<Resource> downloadDelta(@PathVariable Long id) {
        java.io.File deltaFile = firmwareDeltaService.getDeltaFile(id);
        FirmwareDelta delta = firmwareDeltaService.getDeltaById(id);

        FileSystemResource resource = new FileSystemResource(deltaFile);

        return ResponseEntity.ok()
                .contentType(MediaType.APPLICATION_OCTET_STREAM)
                .header(HttpHeaders.CONTENT_DISPOSITION, "attachment; filename=\"" + delta.getFileName() + "\"")
                .header("X-Delta-Algorithm", delta.getDeltaAlgorithm())
                .header("X-From-Version", delta.getFromFirmware().getVersion())
                .header("X-To-Version", delta.getToFirmware().getVersion())
                .header("X-File-Hash", delta.getFileHash())
                .header("X-Signature", delta.getSignature())
                .header("X-Is-Encrypted", String.valueOf(delta.getIsEncrypted()))
                .body(resource);
    }

    @DeleteMapping("/{id}")
    public ApiResponse<String> deleteDelta(@PathVariable Long id) throws Exception {
        firmwareDeltaService.deleteDelta(id);
        return ApiResponse.success("Delta deleted successfully");
    }

    @PostMapping("/{id}/apply-success")
    public ApiResponse<String> markApplySuccess(@PathVariable Long id) {
        firmwareDeltaService.incrementApplyCount(id, true);
        return ApiResponse.success("Marked as success");
    }

    @PostMapping("/{id}/apply-failure")
    public ApiResponse<String> markApplyFailure(@PathVariable Long id) {
        firmwareDeltaService.incrementApplyCount(id, false);
        return ApiResponse.success("Marked as failure");
    }

    @GetMapping("/best-delta")
    public ApiResponse<FirmwareDelta> getBestDeltaForDevice(
            @RequestParam String currentVersion,
            @RequestParam String targetVersion,
            @RequestParam String model) {
        FirmwareDelta delta = firmwareDeltaService.getBestDeltaForDevice(currentVersion, targetVersion, model);
        if (delta == null) {
            return ApiResponse.error("No delta available for this upgrade path");
        }
        return ApiResponse.success(delta);
    }
}
