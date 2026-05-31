package com.config.drift.model;

import jakarta.validation.constraints.NotBlank;
import lombok.Data;

@Data
public class DetectRequest {

    @NotBlank(message = "serviceA is required")
    private String serviceA;

    @NotBlank(message = "serviceB is required")
    private String serviceB;

    private String baselineCommitId;

    private boolean saveSnapshot = true;

    private boolean fix = false;

    private String commitMessage = "Auto-rollback configuration drift to baseline";

    private String triggeredBy = "system";
}
