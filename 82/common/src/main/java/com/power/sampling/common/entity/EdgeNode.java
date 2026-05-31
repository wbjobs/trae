package com.power.sampling.common.entity;

import com.baomidou.mybatisplus.annotation.IdType;
import com.baomidou.mybatisplus.annotation.TableId;
import com.baomidou.mybatisplus.annotation.TableName;
import lombok.Data;

import java.io.Serializable;
import java.time.LocalDateTime;

@Data
@TableName("t_edge_node")
public class EdgeNode implements Serializable {

    private static final long serialVersionUID = 1L;

    @TableId(type = IdType.AUTO)
    private Long id;

    private String nodeCode;

    private String nodeName;

    private String nodeIp;

    private Integer nodePort;

    private String dataCenter;

    private String room;

    private Integer status;

    private Integer loadLevel;

    private Integer maxDevices;

    private Integer currentDevices;

    private LocalDateTime lastHeartbeat;

    private LocalDateTime createTime;

    private LocalDateTime updateTime;
}
