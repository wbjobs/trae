package com.iot.monitor.entity;

import com.baomidou.mybatisplus.annotation.IdType;
import com.baomidou.mybatisplus.annotation.TableId;
import com.baomidou.mybatisplus.annotation.TableName;
import lombok.Data;

import java.time.LocalDateTime;

@Data
@TableName("alarm_record")
public class AlarmRecord {

    @TableId(type = IdType.AUTO)
    private Long id;

    private Long deviceId;

    private Long pointId;

    private String alarmType;

    private String alarmContent;

    private String alarmLevel;

    private Integer alarmCount;

    private LocalDateTime firstAlarmTime;

    private LocalDateTime lastAlarmTime;

    private Integer status;

    private LocalDateTime recoverTime;

    private LocalDateTime createTime;

    private LocalDateTime updateTime;
}
