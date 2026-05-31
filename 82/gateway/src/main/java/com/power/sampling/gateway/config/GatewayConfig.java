package com.power.sampling.gateway.config;

import com.alibaba.csp.sentinel.adapter.gateway.common.rule.GatewayFlowRule;
import com.alibaba.csp.sentinel.adapter.gateway.common.rule.GatewayRuleManager;
import com.alibaba.csp.sentinel.adapter.gateway.sc.SentinelGatewayFilter;
import com.alibaba.csp.sentinel.adapter.gateway.sc.callback.BlockRequestHandler;
import com.alibaba.csp.sentinel.adapter.gateway.sc.callback.GatewayCallbackManager;
import com.alibaba.csp.sentinel.adapter.gateway.sc.exception.SentinelGatewayBlockExceptionHandler;
import com.fasterxml.jackson.core.JsonProcessingException;
import com.fasterxml.jackson.databind.ObjectMapper;
import com.power.sampling.common.result.Result;
import com.power.sampling.common.result.ResultCode;
import org.springframework.beans.factory.ObjectProvider;
import org.springframework.cloud.gateway.filter.GlobalFilter;
import org.springframework.cloud.gateway.handler.ResultFilter;
import org.springframework.context.annotation.Bean;
import org.springframework.context.annotation.Configuration;
import org.springframework.core.Ordered;
import org.springframework.core.annotation.Order;
import org.springframework.http.HttpStatus;
import org.springframework.http.MediaType;
import org.springframework.http.codec.ServerCodecConfigurer;
import org.springframework.web.reactive.function.BodyInserters;
import org.springframework.web.reactive.function.server.ServerResponse;
import org.springframework.web.reactive.result.view.ViewResolver;
import reactor.core.publisher.Mono;

import javax.annotation.PostConstruct;
import java.util.*;

@Configuration
public class GatewayConfig {

    private final List<ViewResolver> viewResolvers;
    private final ServerCodecConfigurer serverCodecConfigurer;

    public GatewayConfig(ObjectProvider<List<ViewResolver>> viewResolversProvider,
                         ServerCodecConfigurer serverCodecConfigurer) {
        this.viewResolvers = viewResolversProvider.getIfAvailable(Collections::emptyList);
        this.serverCodecConfigurer = serverCodecConfigurer;
    }

    @Bean
    @Order(-1)
    public GlobalFilter sentinelGatewayFilter() {
        return new SentinelGatewayFilter();
    }

    @Bean
    @Order(Ordered.HIGHEST_PRECEDENCE)
    public SentinelGatewayBlockExceptionHandler sentinelGatewayBlockExceptionHandler() {
        return new SentinelGatewayBlockExceptionHandler(viewResolvers, serverCodecConfigurer);
    }

    @PostConstruct
    public void doInit() {
        initBlockHandler();
        initGatewayRules();
    }

    private void initBlockHandler() {
        BlockRequestHandler blockRequestHandler = (exchange, t) -> {
            ObjectMapper objectMapper = new ObjectMapper();
            Result<?> result = Result.fail(ResultCode.RATE_LIMIT);
            try {
                return ServerResponse.status(HttpStatus.OK)
                        .contentType(MediaType.APPLICATION_JSON)
                        .body(BodyInserters.fromValue(objectMapper.writeValueAsString(result)));
            } catch (JsonProcessingException e) {
                return ServerResponse.status(HttpStatus.INTERNAL_SERVER_ERROR).build();
            }
        };
        GatewayCallbackManager.setBlockHandler(blockRequestHandler);
    }

    private void initGatewayRules() {
        Set<GatewayFlowRule> rules = new HashSet<>();

        rules.add(new GatewayFlowRule("auth-service")
                .setCount(100)
                .setIntervalSec(1));

        rules.add(new GatewayFlowRule("device-service")
                .setCount(500)
                .setIntervalSec(1));

        rules.add(new GatewayFlowRule("sampling-service")
                .setCount(2000)
                .setIntervalSec(1));

        rules.add(new GatewayFlowRule("calculation-service")
                .setCount(100)
                .setIntervalSec(1));

        rules.add(new GatewayFlowRule("scheduler-service")
                .setCount(500)
                .setIntervalSec(1)
                .setBurst(100));

        rules.add(new GatewayFlowRule("sampling-batch-query")
                .setResourceMode(1)
                .setCount(50)
                .setIntervalSec(1)
                .setBurst(10));

        GatewayRuleManager.loadRules(rules);
    }
}
