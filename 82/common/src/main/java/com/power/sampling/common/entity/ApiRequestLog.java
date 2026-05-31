package com.power.sampling.common.entity;

import com.baomidou.mybatisplus.annotation.IdType;
import com.baomidou.mybatisplus.annotation.TableId;
import com.baomidou.mybatisplus.annotation.TableName;
import lombok.Data;

import java.io.Serializable;
import java.time.LocalDateTime;

@Data
@TableName("t_api_request_log")
public class ApiRequestLog implements Serializable {

    private static final long serialVersionUID = 1L;

    @TableId(type = IdType.AUTO)
    private Long id;

    private String traceId;

    private String serviceName;

    private String requestMethod;

    private String requestPath;

    private String requestParams;

    private String requestBody;

    private String requestIp;

    private String userAgent;

    private String userId;

    private String username;

    private Integer responseStatus;

    private String responseBody;

    private Long costTime;

    private Integer logLevel;

    private String errorMessage;

    private LocalDateTime createTime;
}
