package com.power.sampling.common.entity;

import com.baomidou.mybatisplus.annotation.IdType;
import com.baomidou.mybatisplus.annotation.TableId;
import com.baomidou.mybatisplus.annotation.TableName;
import lombok.Data;

import java.io.Serializable;
import java.math.BigDecimal;
import java.time.LocalDateTime;

@Data
@TableName("t_node_load_stats")
public class NodeLoadStats implements Serializable {

    private static final long serialVersionUID = 1L;

    @TableId(type = IdType.AUTO)
    private Long id;

    private Long nodeId;

    private String nodeCode;

    private BigDecimal cpuUsage;

    private BigDecimal memoryUsage;

    private BigDecimal diskUsage;

    private BigDecimal networkIn;

    private BigDecimal networkOut;

    private Integer connectionCount;

    private Integer requestCount;

    private Integer errorCount;

    private BigDecimal avgResponseTime;

    private Integer deviceCount;

    private Integer samplingCount;

    private BigDecimal loadScore;

    private LocalDateTime statsTime;

    private LocalDateTime createTime;
}
