package com.power.sampling.common.dto;

import lombok.Data;

import java.io.Serializable;
import java.math.BigDecimal;
import java.time.LocalDateTime;

@Data
public class DeviceSamplingDTO implements Serializable {

    private static final long serialVersionUID = 1L;

    private Long deviceId;

    private String deviceCode;

    private BigDecimal voltage;

    private BigDecimal current;

    private BigDecimal power;

    private BigDecimal powerFactor;

    private BigDecimal frequency;

    private LocalDateTime samplingTime;

    private Integer edgeNodeId;

    private Integer samplingStatus;
}
