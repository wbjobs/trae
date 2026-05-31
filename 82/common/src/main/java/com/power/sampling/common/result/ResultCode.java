package com.power.sampling.common.result;

import lombok.AllArgsConstructor;
import lombok.Getter;

@Getter
@AllArgsConstructor
public enum ResultCode {

    SUCCESS(200, "操作成功"),
    ERROR(500, "系统错误"),
    BAD_REQUEST(400, "请求参数错误"),
    UNAUTHORIZED(401, "未授权"),
    FORBIDDEN(403, "禁止访问"),
    NOT_FOUND(404, "资源不存在"),

    AUTH_USER_NOT_EXIST(1001, "用户不存在"),
    AUTH_PASSWORD_ERROR(1002, "密码错误"),
    AUTH_TOKEN_INVALID(1003, "Token无效"),
    AUTH_TOKEN_EXPIRED(1004, "Token已过期"),

    DEVICE_NOT_EXIST(2001, "设备不存在"),
    DEVICE_OFFLINE(2002, "设备离线"),
    DEVICE_ABNORMAL(2003, "设备异常"),
    DEVICE_ALREADY_EXIST(2004, "设备已存在"),

    SAMPLING_FAILED(3001, "采样失败"),
    SAMPLING_TIMEOUT(3002, "采样超时"),

    CALCULATION_FAILED(4001, "运算失败"),

    SCHEDULE_FAILED(5001, "调度失败"),

    RATE_LIMIT(6001, "请求限流"),
    CIRCUIT_BREAK(6002, "服务熔断"),

    RPC_CALL_FAILED(7001, "RPC调用失败");

    private final Integer code;

    private final String message;
}
