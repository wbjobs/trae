package com.power.sampling.common.entity;

import com.baomidou.mybatisplus.annotation.IdType;
import com.baomidou.mybatisplus.annotation.TableId;
import com.baomidou.mybatisplus.annotation.TableName;
import lombok.Data;

import java.io.Serializable;
import java.math.BigDecimal;
import java.time.LocalDateTime;

@Data
@TableName("t_power_sampling")
public class PowerSampling implements Serializable {

    private static final long serialVersionUID = 1L;

    @TableId(type = IdType.AUTO)
    private Long id;

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

    private LocalDateTime createTime;
}
