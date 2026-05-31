package com.iot.monitor.entity;

import com.baomidou.mybatisplus.annotation.IdType;
import com.baomidou.mybatisplus.annotation.TableId;
import com.baomidou.mybatisplus.annotation.TableName;
import lombok.Data;

import java.time.LocalDateTime;

@Data
@TableName("device_point")
public class DevicePoint {

    @TableId(type = IdType.AUTO)
    private Long id;

    private Long deviceId;

    private String pointCode;

    private String pointName;

    private String dataType;

    private Integer registerAddress;

    private Integer registerCount;

    private String unit;

    private Double scale;

    private Double offset;

    private Integer sortOrder;

    private LocalDateTime createTime;
}
