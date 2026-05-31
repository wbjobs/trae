package com.iot.monitor.entity;

import com.baomidou.mybatisplus.annotation.IdType;
import com.baomidou.mybatisplus.annotation.TableId;
import com.baomidou.mybatisplus.annotation.TableName;
import lombok.Data;

import java.time.LocalDateTime;

@Data
@TableName("device")
public class Device {

    @TableId(type = IdType.AUTO)
    private Long id;

    private String deviceCode;

    private String deviceName;

    private String protocolType;

    private String connectionType;

    private String host;

    private Integer port;

    private String serialPort;

    private Integer baudRate;

    private Integer slaveId;

    private Integer collectInterval;

    private Integer status;

    private LocalDateTime lastOnlineTime;

    private LocalDateTime createTime;

    private LocalDateTime updateTime;
}
