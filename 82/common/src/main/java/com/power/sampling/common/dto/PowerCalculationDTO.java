package com.power.sampling.common.dto;

import lombok.Data;

import java.io.Serializable;
import java.time.LocalDateTime;
import java.util.List;

@Data
public class PowerCalculationDTO implements Serializable {

    private static final long serialVersionUID = 1L;

    private Long deviceId;

    private List<Long> deviceIds;

    private Integer calculationType;

    private LocalDateTime startTime;

    private LocalDateTime endTime;
}
