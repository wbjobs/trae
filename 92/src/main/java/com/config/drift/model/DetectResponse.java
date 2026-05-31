package com.config.drift.model;

import lombok.Builder;
import lombok.Data;

import java.time.LocalDateTime;
import java.util.List;

@Data
@Builder
public class DetectResponse {

    private String detectionId;

    private LocalDateTime detectTime;

    private List<DriftResult> serviceResults;

    private boolean overallDrift;

    private int totalDriftCount;

    private String snapshotIdA;

    private String snapshotIdB;

    private boolean fixMode;

    private String rollbackLogIdA;

    private String rollbackLogIdB;

    private RollbackLog.RollbackStatus rollbackStatusA;

    private RollbackLog.RollbackStatus rollbackStatusB;
}
