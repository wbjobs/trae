package com.power.sampling.common.entity;

import com.baomidou.mybatisplus.annotation.IdType;
import com.baomidou.mybatisplus.annotation.TableId;
import com.baomidou.mybatisplus.annotation.TableName;
import lombok.Data;

import java.io.Serializable;
import java.time.LocalDateTime;

@Data
@TableName("t_device_abnormal")
public class DeviceAbnormal implements Serializable {

    private static final long serialVersionUID = 1L;

    @TableId(type = IdType.AUTO)
    private Long id;

    private Long deviceId;

    private String deviceCode;

    private Integer abnormalType;

    private String abnormalMessage;

    private Integer severity;

    private Integer status;

    private LocalDateTime reportTime;

    private LocalDateTime handleTime;

    private String handler;

    private String handleRemark;

    private LocalDateTime createTime;
}
