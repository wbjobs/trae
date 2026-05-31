package com.distributed.scheduler.dto;

import lombok.Data;

import java.util.Map;

@Data
public class TaskDefinitionDTO {
    private String taskName;
    private String taskType;
    private String cronExpression;
    private Map<String, Object> taskParams;
    private String description;
    private Integer maxRetryTimes;
    private Integer retryIntervalSeconds;
    private Integer timeoutSeconds;
    private Integer priority;
    private Boolean preemptible;
}
