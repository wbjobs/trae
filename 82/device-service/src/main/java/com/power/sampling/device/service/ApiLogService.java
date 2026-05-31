package com.power.sampling.device.service;

import com.baomidou.mybatisplus.core.conditions.query.QueryWrapper;
import com.baomidou.mybatisplus.core.metadata.IPage;
import com.baomidou.mybatisplus.extension.plugins.pagination.Page;
import com.power.sampling.common.entity.ApiRequestLog;
import com.power.sampling.device.mapper.ApiRequestLogMapper;
import lombok.extern.slf4j.Slf4j;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.stereotype.Service;

import java.time.LocalDateTime;
import java.util.List;

@Slf4j
@Service
public class ApiLogService {

    @Autowired
    private ApiRequestLogMapper apiRequestLogMapper;

    public void saveLog(ApiRequestLog apiLog) {
        try {
            apiRequestLogMapper.insert(apiLog);
        } catch (Exception e) {
            log.error("保存API日志入库失败", e);
        }
    }

    public IPage<ApiRequestLog> getLogPage(Integer pageNum, Integer pageSize,
                                     String serviceName, Integer logLevel,
                                     Integer responseStatus,
                                     LocalDateTime startTime,
                                     LocalDateTime endTime) {
        Page<ApiRequestLog> page = new Page<>(pageNum, pageSize);
        QueryWrapper<ApiRequestLog> wrapper = new QueryWrapper<>();
        if (serviceName != null) {
            wrapper.like("service_name", serviceName);
        }
        if (logLevel != null) {
            wrapper.ge("log_level", logLevel);
        }
        if (responseStatus != null) {
            wrapper.eq("response_status", responseStatus);
        }
        if (startTime != null) {
            wrapper.ge("create_time", startTime);
        }
        if (endTime != null) {
            wrapper.le("create_time", endTime);
        }
        wrapper.orderByDesc("create_time");
        return apiRequestLogMapper.selectPage(page, wrapper);
    }

    public List<ApiRequestLog> getErrorLogs(LocalDateTime startTime, LocalDateTime endTime) {
        QueryWrapper<ApiRequestLog> wrapper = new QueryWrapper<>();
        wrapper.ge("log_level", 3);
        if (startTime != null) {
            wrapper.ge("create_time", startTime);
        }
        if (endTime != null) {
            wrapper.le("create_time", endTime);
        }
        wrapper.orderByDesc("create_time");
        wrapper.last("LIMIT 1000");
        return apiRequestLogMapper.selectList(wrapper);
    }

    public Long getSlowApiRequestCount(String serviceName, LocalDateTime startTime, LocalDateTime endTime) {
        QueryWrapper<ApiRequestLog> wrapper = new QueryWrapper<>();
        if (serviceName != null) {
            wrapper.eq("service_name", serviceName);
        }
        if (startTime != null) {
            wrapper.ge("create_time", startTime);
        }
        if (endTime != null) {
            wrapper.le("create_time", endTime);
        }
        return apiRequestLogMapper.selectCount(wrapper);
    }
}
