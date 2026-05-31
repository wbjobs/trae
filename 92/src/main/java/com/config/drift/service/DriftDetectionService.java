package com.config.drift.service;

import com.config.drift.model.*;
import lombok.RequiredArgsConstructor;
import lombok.extern.slf4j.Slf4j;
import org.eclipse.jgit.api.errors.GitAPIException;
import org.springframework.beans.factory.annotation.Value;
import org.springframework.stereotype.Service;

import java.io.IOException;
import java.time.LocalDateTime;
import java.util.ArrayList;
import java.util.List;
import java.util.UUID;

@Slf4j
@Service
@RequiredArgsConstructor
public class DriftDetectionService {

    private final GitConfigService gitConfigService;
    private final ConfigComparisonService comparisonService;
    private final SnapshotService snapshotService;
    private final RollbackLogService rollbackLogService;

    @Value("${config-drift.rollback.author-name:Config Drift Detector}")
    private String authorName;

    @Value("${config-drift.rollback.author-email:config-drift@local}")
    private String authorEmail;

    public DetectResponse detect(DetectRequest request) throws GitAPIException, IOException {
        String detectionId = UUID.randomUUID().toString();
        LocalDateTime detectTime = LocalDateTime.now();

        List<DriftResult> results = new ArrayList<>();
        String snapshotIdA = null;
        String snapshotIdB = null;
        String rollbackLogIdA = null;
        String rollbackLogIdB = null;
        RollbackLog.RollbackStatus rollbackStatusA = null;
        RollbackLog.RollbackStatus rollbackStatusB = null;

        ConfigSnapshot baselineA = fetchBaseline(request.getServiceA(), request.getBaselineCommitId());
        ConfigSnapshot currentA = gitConfigService.fetchConfig(request.getServiceA(), false);
        DriftResult resultA = comparisonService.compare(baselineA, currentA);
        results.add(resultA);

        if (request.isSaveSnapshot()) {
            currentA.setBaselineCommitId(baselineA.getCommitId());
            snapshotIdA = snapshotService.save(currentA).getId();
        }

        if (request.isFix() && resultA.isHasDrift()) {
            RollbackLog rollbackLogA = performRollback(
                    detectionId, request.getServiceA(), baselineA, currentA, resultA,
                    request.getCommitMessage(), request.getTriggeredBy());
            rollbackLogIdA = rollbackLogA.getId();
            rollbackStatusA = rollbackLogA.getStatus();
        } else if (request.isFix()) {
            rollbackStatusA = RollbackLog.RollbackStatus.NO_DRIFT;
        }

        ConfigSnapshot baselineB = fetchBaseline(request.getServiceB(), request.getBaselineCommitId());
        ConfigSnapshot currentB = gitConfigService.fetchConfig(request.getServiceB(), false);
        DriftResult resultB = comparisonService.compare(baselineB, currentB);
        results.add(resultB);

        if (request.isSaveSnapshot()) {
            currentB.setBaselineCommitId(baselineB.getCommitId());
            snapshotIdB = snapshotService.save(currentB).getId();
        }

        if (request.isFix() && resultB.isHasDrift()) {
            RollbackLog rollbackLogB = performRollback(
                    detectionId, request.getServiceB(), baselineB, currentB, resultB,
                    request.getCommitMessage(), request.getTriggeredBy());
            rollbackLogIdB = rollbackLogB.getId();
            rollbackStatusB = rollbackLogB.getStatus();
        } else if (request.isFix()) {
            rollbackStatusB = RollbackLog.RollbackStatus.NO_DRIFT;
        }

        boolean overallDrift = results.stream().anyMatch(DriftResult::isHasDrift);
        int totalDriftCount = results.stream().mapToInt(DriftResult::getDriftCount).sum();

        return DetectResponse.builder()
                .detectionId(detectionId)
                .detectTime(detectTime)
                .serviceResults(results)
                .overallDrift(overallDrift)
                .totalDriftCount(totalDriftCount)
                .snapshotIdA(snapshotIdA)
                .snapshotIdB(snapshotIdB)
                .fixMode(request.isFix())
                .rollbackLogIdA(rollbackLogIdA)
                .rollbackLogIdB(rollbackLogIdB)
                .rollbackStatusA(rollbackStatusA)
                .rollbackStatusB(rollbackStatusB)
                .build();
    }

    private RollbackLog performRollback(String detectionId, String serviceName,
                                         ConfigSnapshot baseline, ConfigSnapshot current,
                                         DriftResult driftResult, String commitMessage, String triggeredBy) {
        RollbackLog rollbackLog = new RollbackLog();
        rollbackLog.setDetectionId(detectionId);
        rollbackLog.setServiceName(serviceName);
        rollbackLog.setFromCommitId(current.getCommitId());
        rollbackLog.setToCommitId(baseline.getCommitId());
        rollbackLog.setRolledBackItems(driftResult.getDrifts());
        rollbackLog.setRollbackCount(driftResult.getDriftCount());
        rollbackLog.setTriggeredBy(triggeredBy);
        rollbackLog.setRollbackTime(LocalDateTime.now());

        try {
            String newCommitId = gitConfigService.rollbackConfig(
                    serviceName, baseline, driftResult.getDrifts(),
                    commitMessage, authorName, authorEmail);
            rollbackLog.setGitCommitId(newCommitId);
            rollbackLog.setStatus(RollbackLog.RollbackStatus.SUCCESS);
            log.info("Successfully rolled back {} drift items for service {}",
                    driftResult.getDriftCount(), serviceName);
        } catch (Exception e) {
            log.error("Failed to rollback config for service {}", serviceName, e);
            rollbackLog.setStatus(RollbackLog.RollbackStatus.FAILED);
            rollbackLog.setErrorMessage(e.getMessage());
        }

        return rollbackLogService.save(rollbackLog);
    }

    private ConfigSnapshot fetchBaseline(String serviceName, String baselineCommitId) throws GitAPIException, IOException {
        if (baselineCommitId != null && !baselineCommitId.isEmpty()) {
            return gitConfigService.fetchConfig(serviceName, baselineCommitId);
        }
        return snapshotService.getLatestBaseline(serviceName)
                .orElseGet(() -> {
                    try {
                        ConfigSnapshot baseline = gitConfigService.fetchConfig(serviceName, true);
                        return snapshotService.save(baseline);
                    } catch (Exception e) {
                        throw new RuntimeException("Failed to fetch baseline config for " + serviceName, e);
                    }
                });
    }
}
