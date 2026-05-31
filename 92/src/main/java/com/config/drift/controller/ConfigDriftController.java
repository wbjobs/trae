package com.config.drift.controller;

import com.config.drift.model.ConfigSnapshot;
import com.config.drift.model.DetectRequest;
import com.config.drift.model.DetectResponse;
import com.config.drift.model.RollbackLog;
import com.config.drift.service.DriftDetectionService;
import com.config.drift.service.RollbackLogService;
import com.config.drift.service.SnapshotService;
import jakarta.validation.Valid;
import lombok.RequiredArgsConstructor;
import org.eclipse.jgit.api.errors.GitAPIException;
import org.springframework.format.annotation.DateTimeFormat;
import org.springframework.http.ResponseEntity;
import org.springframework.web.bind.annotation.*;

import java.io.IOException;
import java.time.LocalDateTime;
import java.util.List;

@RestController
@RequestMapping("/api")
@RequiredArgsConstructor
public class ConfigDriftController {

    private final DriftDetectionService driftDetectionService;
    private final SnapshotService snapshotService;
    private final RollbackLogService rollbackLogService;

    @PostMapping("/detect")
    public ResponseEntity<DetectResponse> detect(@Valid @RequestBody DetectRequest request)
            throws GitAPIException, IOException {
        DetectResponse response = driftDetectionService.detect(request);
        return ResponseEntity.ok(response);
    }

    @GetMapping("/snapshots/{serviceName}")
    public ResponseEntity<List<ConfigSnapshot>> getSnapshots(@PathVariable String serviceName) {
        List<ConfigSnapshot> snapshots = snapshotService.getHistory(serviceName);
        return ResponseEntity.ok(snapshots);
    }

    @GetMapping("/snapshots/{serviceName}/range")
    public ResponseEntity<List<ConfigSnapshot>> getSnapshotsInRange(
            @PathVariable String serviceName,
            @RequestParam @DateTimeFormat(iso = DateTimeFormat.ISO.DATE_TIME) LocalDateTime start,
            @RequestParam @DateTimeFormat(iso = DateTimeFormat.ISO.DATE_TIME) LocalDateTime end) {
        List<ConfigSnapshot> snapshots = snapshotService.getHistoryInRange(serviceName, start, end);
        return ResponseEntity.ok(snapshots);
    }

    @GetMapping("/snapshots/id/{id}")
    public ResponseEntity<ConfigSnapshot> getSnapshotById(@PathVariable String id) {
        return snapshotService.findById(id)
                .map(ResponseEntity::ok)
                .orElse(ResponseEntity.notFound().build());
    }

    @GetMapping("/snapshots/{serviceName}/baseline")
    public ResponseEntity<ConfigSnapshot> getLatestBaseline(@PathVariable String serviceName) {
        return snapshotService.getLatestBaseline(serviceName)
                .map(ResponseEntity::ok)
                .orElse(ResponseEntity.notFound().build());
    }

    @DeleteMapping("/snapshots/{serviceName}/cleanup")
    public ResponseEntity<Void> cleanupOldSnapshots(
            @PathVariable String serviceName,
            @RequestParam @DateTimeFormat(iso = DateTimeFormat.ISO.DATE_TIME) LocalDateTime beforeTime) {
        snapshotService.deleteOldSnapshots(serviceName, beforeTime);
        return ResponseEntity.noContent().build();
    }

    @GetMapping("/rollbacks/{serviceName}")
    public ResponseEntity<List<RollbackLog>> getRollbackLogs(@PathVariable String serviceName) {
        List<RollbackLog> logs = rollbackLogService.getByServiceName(serviceName);
        return ResponseEntity.ok(logs);
    }

    @GetMapping("/rollbacks/{serviceName}/range")
    public ResponseEntity<List<RollbackLog>> getRollbackLogsInRange(
            @PathVariable String serviceName,
            @RequestParam @DateTimeFormat(iso = DateTimeFormat.ISO.DATE_TIME) LocalDateTime start,
            @RequestParam @DateTimeFormat(iso = DateTimeFormat.ISO.DATE_TIME) LocalDateTime end) {
        List<RollbackLog> logs = rollbackLogService.getByServiceNameAndTimeRange(serviceName, start, end);
        return ResponseEntity.ok(logs);
    }

    @GetMapping("/rollbacks/id/{id}")
    public ResponseEntity<RollbackLog> getRollbackLogById(@PathVariable String id) {
        return rollbackLogService.findById(id)
                .map(ResponseEntity::ok)
                .orElse(ResponseEntity.notFound().build());
    }

    @GetMapping("/rollbacks/detection/{detectionId}/{serviceName}")
    public ResponseEntity<RollbackLog> getRollbackLogByDetectionId(
            @PathVariable String detectionId,
            @PathVariable String serviceName) {
        return rollbackLogService.getByDetectionIdAndServiceName(detectionId, serviceName)
                .map(ResponseEntity::ok)
                .orElse(ResponseEntity.notFound().build());
    }

    @GetMapping("/rollbacks/status/{status}")
    public ResponseEntity<List<RollbackLog>> getRollbackLogsByStatus(@PathVariable RollbackLog.RollbackStatus status) {
        List<RollbackLog> logs = rollbackLogService.getByStatus(status);
        return ResponseEntity.ok(logs);
    }
}
