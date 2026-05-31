package com.distributed.scheduler.dto;

import lombok.Data;

import java.util.List;

@Data
public class ExecutorHeartbeatDTO {
    private String executorId;
    private String executorName;
    private String host;
    private Integer port;
    private List<String> taskTypes;
}
