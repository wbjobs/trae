package com.power.sampling.common.entity;

import com.baomidou.mybatisplus.annotation.IdType;
import com.baomidou.mybatisplus.annotation.TableId;
import com.baomidou.mybatisplus.annotation.TableName;
import lombok.Data;

import java.io.Serializable;
import java.math.BigDecimal;
import java.time.LocalDateTime;

@Data
@TableName("t_device_threshold")
public class DeviceThreshold implements Serializable {

    private static final long serialVersionUID = 1L;

    @TableId(type = IdType.AUTO)
    private Long id;

    private Long deviceId;

    private String deviceCode;

    private Integer thresholdType;

    private BigDecimal maxVoltage;

    private BigDecimal minVoltage;

    private BigDecimal maxCurrent;

    private BigDecimal minCurrent;

    private BigDecimal maxPower;

    private BigDecimal minPower;

    private BigDecimal maxTemperature;

    private BigDecimal maxHumidity;

    private Integer checkInterval;

    private Integer alertLevel;

    private Integer enableStatus;

    private String notifyEmails;

    private String notifyPhones;

    private LocalDateTime createTime;

    private LocalDateTime updateTime;
}
