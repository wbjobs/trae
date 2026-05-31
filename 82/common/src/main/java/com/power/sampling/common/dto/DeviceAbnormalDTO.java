package com.power.sampling.common.dto;

import lombok.Data;

import java.io.Serializable;
import java.time.LocalDateTime;

@Data
public class DeviceAbnormalDTO implements Serializable {

    private static final long serialVersionUID = 1L;

    private Long deviceId;

    private String deviceCode;

    private Integer abnormalType;

    private String abnormalMessage;

    private Integer severity;

    private LocalDateTime reportTime;
}
