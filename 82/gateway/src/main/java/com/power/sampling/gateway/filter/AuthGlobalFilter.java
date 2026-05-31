package com.power.sampling.gateway.filter;

import cn.hutool.core.util.StrUtil;
import com.fasterxml.jackson.core.JsonProcessingException;
import com.fasterxml.jackson.databind.ObjectMapper;
import com.power.sampling.common.result.Result;
import com.power.sampling.common.result.ResultCode;
import com.power.sampling.common.utils.JwtUtil;
import lombok.extern.slf4j.Slf4j;
import org.springframework.cloud.gateway.filter.GatewayFilterChain;
import org.springframework.cloud.gateway.filter.GlobalFilter;
import org.springframework.core.Ordered;
import org.springframework.core.io.buffer.DataBuffer;
import org.springframework.http.HttpStatus;
import org.springframework.http.MediaType;
import org.springframework.http.server.reactive.ServerHttpRequest;
import org.springframework.http.server.reactive.ServerHttpResponse;
import org.springframework.stereotype.Component;
import org.springframework.web.server.ServerWebExchange;
import reactor.core.publisher.Mono;

import java.nio.charset.StandardCharsets;

@Slf4j
@Component
public class AuthGlobalFilter implements GlobalFilter, Ordered {

    private static final String[] WHITE_LIST = {
            "/auth/login",
            "/auth/register",
            "/device/heartbeat",
            "/device/abnormal/report",
            "/sampling/collect",
            "/sampling/batch/collect",
            "/eureka"
    };

    private final ObjectMapper objectMapper = new ObjectMapper();

    @Override
    public Mono<Void> filter(ServerWebExchange exchange, GatewayFilterChain chain) {
        ServerHttpRequest request = exchange.getRequest();
        String path = request.getURI().getPath();

        if (isWhiteList(path)) {
            return chain.filter(exchange);
        }

        String token = request.getHeaders().getFirst("Authorization");
        if (StrUtil.isBlank(token)) {
            return unauthorizedResponse(exchange, ResultCode.UNAUTHORIZED);
        }

        if (token.startsWith("Bearer ")) {
            token = token.substring(7);
        }

        if (JwtUtil.isTokenExpired(token)) {
            return unauthorizedResponse(exchange, ResultCode.AUTH_TOKEN_EXPIRED);
        }

        String username = JwtUtil.getUsernameFromToken(token);
        if (StrUtil.isBlank(username)) {
            return unauthorizedResponse(exchange, ResultCode.AUTH_TOKEN_INVALID);
        }

        ServerHttpRequest modifiedRequest = request.mutate()
                .header("X-User-Name", username)
                .header("X-User-Id", String.valueOf(JwtUtil.getUserIdFromToken(token)))
                .build();

        return chain.filter(exchange.mutate().request(modifiedRequest).build());
    }

    private boolean isWhiteList(String path) {
        for (String whitePath : WHITE_LIST) {
            if (path.startsWith(whitePath)) {
                return true;
            }
        }
        return false;
    }

    private Mono<Void> unauthorizedResponse(ServerWebExchange exchange, ResultCode resultCode) {
        ServerHttpResponse response = exchange.getResponse();
        response.setStatusCode(HttpStatus.OK);
        response.getHeaders().setContentType(MediaType.APPLICATION_JSON);

        Result<?> result = Result.fail(resultCode.getCode(), resultCode.getMessage());
        try {
            byte[] bytes = objectMapper.writeValueAsString(result).getBytes(StandardCharsets.UTF_8);
            DataBuffer buffer = response.bufferFactory().wrap(bytes);
            return response.writeWith(Mono.just(buffer));
        } catch (JsonProcessingException e) {
            log.error("序列化响应失败", e);
            return response.setComplete();
        }
    }

    @Override
    public int getOrder() {
        return -100;
    }
}
