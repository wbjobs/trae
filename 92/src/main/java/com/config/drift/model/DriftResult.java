package com.config.drift.model;

import lombok.Builder;
import lombok.Data;

import java.time.LocalDateTime;
import java.util.List;

@Data
@Builder
public class DriftResult {

    private String serviceName;

    private String baselineCommitId;

    private String currentCommitId;

    private boolean hasDrift;

    private int driftCount;

    private List<DriftItem> drifts;

    private LocalDateTime detectTime;
}
