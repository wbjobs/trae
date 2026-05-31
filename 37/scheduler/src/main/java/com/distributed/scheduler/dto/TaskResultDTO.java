package com.distributed.scheduler.dto;

import lombok.Data;

@Data
public class TaskResultDTO {
    private Long taskInstanceId;
    private String status;
    private String result;
    private String errorMessage;
    private String traceId;
}
