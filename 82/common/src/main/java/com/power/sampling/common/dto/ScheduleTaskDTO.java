package com.power.sampling.common.dto;

import lombok.Data;

import java.io.Serializable;
import java.util.List;

@Data
public class ScheduleTaskDTO implements Serializable {

    private static final long serialVersionUID = 1L;

    private Integer taskType;

    private String cronExpression;

    private List<Long> deviceIds;

    private Integer edgeNodeId;

    private String taskDesc;
}
