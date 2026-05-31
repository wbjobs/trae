package com.power.sampling.common.aspect;

import cn.hutool.core.util.IdUtil;
import cn.hutool.core.util.StrUtil;
import cn.hutool.json.JSONUtil;
import com.power.sampling.common.entity.ApiRequestLog;
import com.power.sampling.common.event.ApiLogEvent;
import lombok.extern.slf4j.Slf4j;
import org.aspectj.lang.ProceedingJoinPoint;
import org.aspectj.lang.annotation.Around;
import org.aspectj.lang.annotation.Aspect;
import org.aspectj.lang.reflect.MethodSignature;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.context.ApplicationEventPublisher;
import org.springframework.stereotype.Component;
import org.springframework.web.context.request.RequestContextHolder;
import org.springframework.web.context.request.ServletRequestAttributes;

import javax.servlet.http.HttpServletRequest;
import java.lang.reflect.Method;
import java.time.LocalDateTime;

@Slf4j
@Aspect
@Component
public class ApiLogAspect {

    @Autowired
    private ApplicationEventPublisher eventPublisher;

    @Around("@annotation(com.power.sampling.common.aspect.ApiLog)")
    public Object around(ProceedingJoinPoint joinPoint) throws Throwable {
        long startTime = System.currentTimeMillis();
        String traceId = IdUtil.simpleUUID();

        ServletRequestAttributes attributes = (ServletRequestAttributes) RequestContextHolder.getRequestAttributes();
        HttpServletRequest request = attributes != null ? attributes.getRequest() : null;

        ApiRequestLog apiLog = new ApiRequestLog();
        apiLog.setTraceId(traceId);
        apiLog.setCreateTime(LocalDateTime.now());

        try {
            if (request != null) {
                apiLog.setRequestMethod(request.getMethod());
                apiLog.setRequestPath(request.getRequestURI());
                apiLog.setRequestIp(getClientIp(request));
                apiLog.setUserAgent(request.getHeader("User-Agent"));
                apiLog.setUserId(request.getHeader("X-User-Id"));
                apiLog.setUsername(request.getHeader("X-User-Name"));
            }

            MethodSignature signature = (MethodSignature) joinPoint.getSignature();
            Method method = signature.getMethod();
            ApiLog apiLogAnnotation = method.getAnnotation(ApiLog.class);
            apiLog.setServiceName(apiLogAnnotation.serviceName());
            apiLog.setLogLevel(apiLogAnnotation.logLevel());

            Object[] args = joinPoint.getArgs();
            if (args != null && args.length > 0 && apiLogAnnotation.logParams()) {
                try {
                    apiLog.setRequestParams(JSONUtil.toJsonStr(args));
                } catch (Exception e) {
                    apiLog.setRequestParams("参数解析失败");
                }
            }

            Object result = joinPoint.proceed();

            if (result != null && apiLogAnnotation.logResult()) {
                try {
                    String resultJson = JSONUtil.toJsonStr(result);
                    if (resultJson.length() > 2000) {
                        resultJson = resultJson.substring(0, 2000) + "...";
                    }
                    apiLog.setResponseBody(resultJson);
                } catch (Exception e) {
                    apiLog.setResponseBody("响应解析失败");
                }
            }

            apiLog.setResponseStatus(200);
            return result;

        } catch (Exception e) {
            apiLog.setResponseStatus(500);
            apiLog.setErrorMessage(e.getMessage());
            determineLogLevel(e, apiLog);
            throw e;
        } finally {
            apiLog.setCostTime(System.currentTimeMillis() - startTime);
            publishLogEvent(apiLog);
        }
    }

    private void determineLogLevel(Exception e, ApiRequestLog apiLog) {
        int currentLevel = apiLog.getLogLevel() != null ? apiLog.getLogLevel() : 1;
        apiLog.setLogLevel(Math.max(currentLevel, 3));
    }

    private String getClientIp(HttpServletRequest request) {
        String ip = request.getHeader("X-Forwarded-For");
        if (StrUtil.isBlank(ip) || "unknown".equalsIgnoreCase(ip)) {
            ip = request.getHeader("Proxy-Client-IP");
        }
        if (StrUtil.isBlank(ip) || "unknown".equalsIgnoreCase(ip)) {
            ip = request.getHeader("WL-Proxy-Client-IP");
        }
        if (StrUtil.isBlank(ip) || "unknown".equalsIgnoreCase(ip)) {
            ip = request.getRemoteAddr();
        }
        return ip;
    }

    private void publishLogEvent(ApiRequestLog apiLog) {
        try {
            eventPublisher.publishEvent(new ApiLogEvent(this, apiLog));

            if (apiLog.getLogLevel() >= 3) {
                log.error("API请求错误: traceId={}, path={}, cost={}ms, error={}",
                        apiLog.getTraceId(),
                        apiLog.getRequestPath(),
                        apiLog.getCostTime(),
                        apiLog.getErrorMessage());
            } else if (apiLog.getLogLevel() >= 2) {
                log.warn("API请求告警: traceId={}, path={}, cost={}ms",
                        apiLog.getTraceId(),
                        apiLog.getRequestPath(),
                        apiLog.getCostTime());
            } else {
                log.debug("API请求: traceId={}, path={}, cost={}ms",
                        apiLog.getTraceId(),
                        apiLog.getRequestPath(),
                        apiLog.getCostTime());
            }
        } catch (Exception e) {
            log.error("发布API日志事件异常", e);
        }
    }
}
