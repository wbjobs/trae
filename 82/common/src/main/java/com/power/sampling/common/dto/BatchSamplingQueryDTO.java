package com.power.sampling.common.dto;

import lombok.Data;

import java.io.Serializable;
import java.time.LocalDateTime;
import java.util.List;

@Data
public class BatchSamplingQueryDTO implements Serializable {

    private static final long serialVersionUID = 1L;

    private List<Long> deviceIds;

    private List<String> deviceCodes;

    private LocalDateTime startTime;

    private LocalDateTime endTime;

    private Integer pageNum = 1;

    private Integer pageSize = 100;
}
