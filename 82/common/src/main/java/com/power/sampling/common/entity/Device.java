package com.power.sampling.common.entity;

import com.baomidou.mybatisplus.annotation.IdType;
import com.baomidou.mybatisplus.annotation.TableId;
import com.baomidou.mybatisplus.annotation.TableName;
import lombok.Data;

import java.io.Serializable;
import java.time.LocalDateTime;

@Data
@TableName("t_device")
public class Device implements Serializable {

    private static final long serialVersionUID = 1L;

    @TableId(type = IdType.AUTO)
    private Long id;

    private String deviceCode;

    private String deviceName;

    private String deviceType;

    private String location;

    private String ipAddress;

    private Integer status;

    private Integer roomId;

    private Integer rackId;

    private String edgeNode;

    private LocalDateTime lastHeartbeat;

    private LocalDateTime createTime;

    private LocalDateTime updateTime;

    private String remark;
}
