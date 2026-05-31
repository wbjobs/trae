package com.power.sampling.common.entity;

import com.baomidou.mybatisplus.annotation.IdType;
import com.baomidou.mybatisplus.annotation.TableId;
import com.baomidou.mybatisplus.annotation.TableName;
import lombok.Data;

import java.io.Serializable;
import java.math.BigDecimal;
import java.time.LocalDateTime;

@Data
@TableName("t_device_alert")
public class DeviceAlert implements Serializable {

    private static final long serialVersionUID = 1L;

    @TableId(type = IdType.AUTO)
    private Long id;

    private Long deviceId;

    private String deviceCode;

    private Integer alertType;

    private Integer alertLevel;

    private String alertTitle;

    private String alertMessage;

    private BigDecimal thresholdValue;

    private BigDecimal actualValue;

    private Integer status;

    private LocalDateTime alertTime;

    private LocalDateTime resolveTime;

    private String resolver;

    private String resolveRemark;

    private LocalDateTime createTime;
}
