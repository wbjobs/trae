package com.power.sampling.gateway.controller;

import com.alibaba.csp.sentinel.annotation.SentinelResource;
import com.alibaba.csp.sentinel.slots.block.BlockException;
import com.power.sampling.gateway.gray.GrayReleaseConfig;
import com.power.sampling.common.result.Result;
import com.power.sampling.common.result.ResultCode;
import lombok.extern.slf4j.Slf4j;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.web.bind.annotation.*;

import java.util.List;

@Slf4j
@RestController
@RequestMapping("/gray")
public class GrayReleaseController {

    @Autowired
    private GrayReleaseConfig grayReleaseConfig;

    @GetMapping("/config")
    @SentinelResource(value = "gray-config", blockHandler = "blockHandler")
    public Result<GrayReleaseConfig> getConfig() {
        return Result.success(grayReleaseConfig);
    }

    @GetMapping("/services")
    @SentinelResource(value = "gray-services", blockHandler = "blockHandler")
    public Result<List<GrayReleaseConfig.ServiceGrayConfig>> getServiceConfigs() {
        return Result.success(grayReleaseConfig.getServices());
    }

    @GetMapping("/services/{serviceName}")
    @SentinelResource(value = "gray-service-get", blockHandler = "blockHandler")
    public Result<GrayReleaseConfig.ServiceGrayConfig> getServiceConfig(@PathVariable String serviceName) {
        for (GrayReleaseConfig.ServiceGrayConfig config : grayReleaseConfig.getServices()) {
            if (config.getServiceName().equalsIgnoreCase(serviceName)) {
                return Result.success(config);
            }
        }
        return Result.success(null);
    }

    @PostMapping("/services/{serviceName}/enable")
    @SentinelResource(value = "gray-service-enable", blockHandler = "blockHandler")
    public Result<Boolean> enableGray(@PathVariable String serviceName) {
        for (GrayReleaseConfig.ServiceGrayConfig config : grayReleaseConfig.getServices()) {
            if (config.getServiceName().equalsIgnoreCase(serviceName)) {
                config.setEnabled(true);
                log.info("开启服务灰度发布: {}", serviceName);
                return Result.success(true);
            }
        }
        return Result.fail("服务不存在");
    }

    @PostMapping("/services/{serviceName}/disable")
    @SentinelResource(value = "gray-service-disable", blockHandler = "blockHandler")
    public Result<Boolean> disableGray(@PathVariable String serviceName) {
        for (GrayReleaseConfig.ServiceGrayConfig config : grayReleaseConfig.getServices()) {
            if (config.getServiceName().equalsIgnoreCase(serviceName)) {
                config.setEnabled(false);
                log.info("关闭服务灰度发布: {}", serviceName);
                return Result.success(true);
            }
        }
        return Result.fail("服务不存在");
    }

    @PostMapping("/services/{serviceName}/weight/{percent}")
    @SentinelResource(value = "gray-service-weight", blockHandler = "blockHandler")
    public Result<Boolean> updateWeight(@PathVariable String serviceName, @PathVariable Integer percent) {
        if (percent < 0 || percent > 100) {
            return Result.fail("权重百分比必须在0-100之间");
        }
        for (GrayReleaseConfig.ServiceGrayConfig config : grayReleaseConfig.getServices()) {
            if (config.getServiceName().equalsIgnoreCase(serviceName)) {
                config.setWeightPercent(percent);
                log.info("更新服务灰度权重: {}, weight={}%", serviceName, percent);
                return Result.success(true);
            }
        }
        return Result.fail("服务不存在");
    }

    public Result<?> blockHandler(Object param, BlockException e) {
        log.warn("灰度配置接口限流: {}", e.getMessage());
        return Result.fail(ResultCode.RATE_LIMIT);
    }
}
