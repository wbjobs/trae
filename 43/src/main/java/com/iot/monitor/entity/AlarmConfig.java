package com.iot.monitor.entity;

import com.baomidou.mybatisplus.annotation.IdType;
import com.baomidou.mybatisplus.annotation.TableId;
import com.baomidou.mybatisplus.annotation.TableName;
import lombok.Data;

import java.math.BigDecimal;
import java.time.LocalDateTime;

@Data
@TableName("alarm_config")
public class AlarmConfig {

    @TableId(type = IdType.AUTO)
    private Long id;

    private Long deviceId;

    private Long pointId;

    private String alarmType;

    private BigDecimal thresholdMin;

    private BigDecimal thresholdMax;

    private String alarmLevel;

    private Integer autoEscalate;

    private Integer escalateAfterMinutes;

    private String notifyType;

    private Integer enabled;

    private LocalDateTime createTime;

    private LocalDateTime updateTime;
}
