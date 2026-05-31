package com.power.sampling.common.event;

import com.power.sampling.common.entity.ApiRequestLog;
import org.springframework.context.ApplicationEvent;

public class ApiLogEvent extends ApplicationEvent {

    private final ApiRequestLog apiRequestLog;

    public ApiLogEvent(Object source, ApiRequestLog apiRequestLog) {
        super(source);
        this.apiRequestLog = apiRequestLog;
    }

    public ApiRequestLog getApiRequestLog() {
        return apiRequestLog;
    }
}
