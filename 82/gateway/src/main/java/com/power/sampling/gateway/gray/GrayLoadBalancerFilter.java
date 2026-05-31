package com.power.sampling.gateway.gray;

import cn.hutool.core.util.RandomUtil;
import cn.hutool.core.util.StrUtil;
import lombok.extern.slf4j.Slf4j;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.cloud.client.ServiceInstance;
import org.springframework.cloud.client.discovery.DiscoveryClient;
import org.springframework.cloud.gateway.filter.GatewayFilterChain;
import org.springframework.cloud.gateway.filter.GlobalFilter;
import org.springframework.cloud.gateway.support.ServerWebExchangeUtils;
import org.springframework.core.Ordered;
import org.springframework.http.HttpHeaders;
import org.springframework.stereotype.Component;
import org.springframework.web.server.ServerWebExchange;
import reactor.core.publisher.Mono;

import java.net.URI;
import java.util.List;

@Slf4j
@Component
public class GrayLoadBalancerFilter implements GlobalFilter, Ordered {

    @Autowired
    private GrayReleaseConfig grayReleaseConfig;

    @Autowired
    private DiscoveryClient discoveryClient;

    @Override
    public Mono<Void> filter(ServerWebExchange exchange, GatewayFilterChain chain) {
        if (!grayReleaseConfig.isEnabled()) {
            return chain.filter(exchange);
        }

        URI uri = exchange.getAttribute(ServerWebExchangeUtils.GATEWAY_REQUEST_URL_ATTR);
        if (uri == null) {
            return chain.filter(exchange);
        }

        String scheme = uri.getScheme();
        if (!"lb".equalsIgnoreCase(scheme)) {
            return chain.filter(exchange);
        }

        String serviceId = uri.getHost();
        GrayReleaseConfig.ServiceGrayConfig serviceConfig = getServiceConfig(serviceId);
        if (serviceConfig == null || !serviceConfig.isEnabled()) {
            return chain.filter(exchange);
        }

        String username = exchange.getRequest().getHeaders().getFirst("X-User-Name");
        String clientIp = getClientIp(exchange);

        boolean isGrayUser = isGrayUser(serviceConfig, username);
        boolean isGrayIp = isGrayIp(serviceConfig, clientIp);
        boolean isGrayWeight = isGrayByWeight(serviceConfig);

        boolean shouldUseGray = isGrayUser || isGrayIp || isGrayWeight;

        if (shouldUseGray && StrUtil.isNotBlank(serviceConfig.getTargetVersion())) {
            ServiceInstance grayInstance = selectGrayInstance(serviceId, serviceConfig.getTargetVersion());
            if (grayInstance != null) {
                exchange.getAttributes().put(ServerWebExchangeUtils.GATEWAY_REQUEST_URL_ATTR, grayInstance.getUri());
                log.debug("灰度路由: service={}, username={}, ip={}, targetVersion={}",
                        serviceId, username, clientIp, serviceConfig.getTargetVersion());
            }
        }

        return chain.filter(exchange);
    }

    private GrayReleaseConfig.ServiceGrayConfig getServiceConfig(String serviceName) {
        for (GrayReleaseConfig.ServiceGrayConfig config : grayReleaseConfig.getServices()) {
            if (config.getServiceName().equalsIgnoreCase(serviceName)) {
                return config;
            }
        }
        return null;
    }

    private boolean isGrayUser(GrayReleaseConfig.ServiceGrayConfig config, String username) {
        if (StrUtil.isBlank(username) || config.getGrayType() != 2) {
            return false;
        }
        return config.getGrayUsers().contains(username);
    }

    private boolean isGrayIp(GrayReleaseConfig.ServiceGrayConfig config, String clientIp) {
        if (StrUtil.isBlank(clientIp) || config.getGrayType() != 3) {
            return false;
        }
        return config.getGrayIps().contains(clientIp);
    }

    private boolean isGrayByWeight(GrayReleaseConfig.ServiceGrayConfig config) {
        if (config.getGrayType() != 1) {
            return false;
        }
        int random = RandomUtil.randomInt(1, 101);
        return random <= config.getWeightPercent();
    }

    private ServiceInstance selectGrayInstance(String serviceId, String targetVersion) {
        List<ServiceInstance> instances = discoveryClient.getInstances(serviceId);
        if (instances == null || instances.isEmpty()) {
            return null;
        }
        for (ServiceInstance instance : instances) {
            String instanceVersion = instance.getMetadata().get("version");
            if (targetVersion.equals(instanceVersion)) {
                return instance;
            }
        }
        return null;
    }

    private String getClientIp(ServerWebExchange exchange) {
        HttpHeaders headers = exchange.getRequest().getHeaders();
        String ip = headers.getFirst("X-Forwarded-For");
        if (StrUtil.isBlank(ip) || "unknown".equalsIgnoreCase(ip)) {
            ip = headers.getFirst("Proxy-Client-IP");
        }
        if (StrUtil.isBlank(ip) || "unknown".equalsIgnoreCase(ip)) {
            ip = headers.getFirst("WL-Proxy-Client-IP");
        }
        if (StrUtil.isBlank(ip) || "unknown".equalsIgnoreCase(ip)) {
            ip = exchange.getRequest().getRemoteAddress() != null ?
                    exchange.getRequest().getRemoteAddress().getAddress().getHostAddress() : "";
        }
        return ip;
    }

    @Override
    public int getOrder() {
        return -99;
    }
}
