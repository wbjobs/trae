package com.distributed.scheduler.dto;

import lombok.Data;

@Data
public class DagEdgeDTO {
    private String fromTaskName;
    private String toTaskName;
}
