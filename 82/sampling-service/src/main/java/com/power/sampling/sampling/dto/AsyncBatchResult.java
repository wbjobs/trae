package com.power.sampling.sampling.dto;

import lombok.Data;

import java.io.Serializable;
import java.math.BigDecimal;
import java.time.LocalDateTime;
import java.util.List;
import java.util.Map;
import java.util.concurrent.ConcurrentHashMap;

@Data
public class AsyncBatchResult implements Serializable {

    private static final long serialVersionUID = 1L;

    private String taskId;

    private Integer totalCount;

    private Integer successCount;

    private Integer failCount;

    private Integer status;

    private LocalDateTime startTime;

    private LocalDateTime endTime;

    private List<String> failMessages;

    private BigDecimal totalPower;

    private Map<Long, Boolean> deviceStatus = new ConcurrentHashMap<>();

    public AsyncBatchResult() {
        this.startTime = LocalDateTime.now();
        this.status = 0;
        this.successCount = 0;
        this.failCount = 0;
    }
}
