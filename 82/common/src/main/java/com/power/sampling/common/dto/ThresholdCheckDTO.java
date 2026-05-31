package com.power.sampling.common.dto;

import lombok.Data;

import java.io.Serializable;
import java.math.BigDecimal;

@Data
public class ThresholdCheckDTO implements Serializable {

    private static final long serialVersionUID = 1L;

    private Long deviceId;

    private String deviceCode;

    private BigDecimal voltage;

    private BigDecimal current;

    private BigDecimal power;

    private BigDecimal temperature;

    private BigDecimal humidity;
}
