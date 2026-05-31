package com.distributed.scheduler.dto;

import lombok.Data;

import java.util.Map;

@Data
public class TaskSubmitDTO {
    private String taskName;
    private Map<String, Object> params;
}
