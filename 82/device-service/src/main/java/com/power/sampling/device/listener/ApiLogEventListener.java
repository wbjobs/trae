package com.power.sampling.device.listener;

import com.power.sampling.common.entity.ApiRequestLog;
import com.power.sampling.common.event.ApiLogEvent;
import com.power.sampling.device.service.ApiLogService;
import lombok.extern.slf4j.Slf4j;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.context.event.EventListener;
import org.springframework.scheduling.annotation.Async;
import org.springframework.stereotype.Component;

@Slf4j
@Component
public class ApiLogEventListener {

    @Autowired
    private ApiLogService apiLogService;

    @Async("logExecutor")
    @EventListener
    public void handleApiLogEvent(ApiLogEvent event) {
        try {
            ApiRequestLog apiLog = event.getApiRequestLog();

            if (apiLog.getLogLevel() != null && apiLog.getLogLevel() >= 1) {
                apiLogService.saveLog(apiLog);
            }

            log.debug("API日志事件处理完成: traceId={}, level={}", apiLog.getTraceId(), apiLog.getLogLevel());
        } catch (Exception e) {
            log.error("处理API日志事件异常", e);
        }
    }
}
