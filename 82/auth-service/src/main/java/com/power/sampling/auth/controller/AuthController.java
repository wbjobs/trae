package com.power.sampling.auth.controller;

import com.alibaba.csp.sentinel.annotation.SentinelResource;
import com.alibaba.csp.sentinel.slots.block.BlockException;
import com.power.sampling.auth.service.AuthService;
import com.power.sampling.common.dto.LoginDTO;
import com.power.sampling.common.entity.SysUser;
import com.power.sampling.common.result.Result;
import com.power.sampling.common.result.ResultCode;
import lombok.extern.slf4j.Slf4j;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.web.bind.annotation.*;

import java.util.Map;

@Slf4j
@RestController
@RequestMapping("/auth")
public class AuthController {

    @Autowired
    private AuthService authService;

    @PostMapping("/login")
    @SentinelResource(value = "auth-login", blockHandler = "loginBlockHandler")
    public Result<Map<String, Object>> login(@RequestBody LoginDTO loginDTO) {
        return Result.success(authService.login(loginDTO));
    }

    @PostMapping("/register")
    @SentinelResource(value = "auth-register", blockHandler = "registerBlockHandler")
    public Result<Boolean> register(@RequestBody SysUser user) {
        return Result.success(authService.register(user));
    }

    @GetMapping("/validate")
    @SentinelResource(value = "auth-validate", blockHandler = "validateBlockHandler")
    public Result<Boolean> validateToken(@RequestHeader("Authorization") String token) {
        return Result.success(authService.validateToken(token));
    }

    @GetMapping("/user/info")
    @SentinelResource(value = "auth-user-info", blockHandler = "userInfoBlockHandler")
    public Result<String> getCurrentUsername(@RequestHeader("Authorization") String token) {
        return Result.success(authService.getUsernameFromToken(token));
    }

    public Result<Map<String, Object>> loginBlockHandler(LoginDTO loginDTO, BlockException e) {
        log.warn("登录接口限流: {}", e.getMessage());
        return Result.fail(ResultCode.RATE_LIMIT);
    }

    public Result<Boolean> registerBlockHandler(SysUser user, BlockException e) {
        log.warn("注册接口限流: {}", e.getMessage());
        return Result.fail(ResultCode.RATE_LIMIT);
    }

    public Result<Boolean> validateBlockHandler(String token, BlockException e) {
        log.warn("Token校验接口限流: {}", e.getMessage());
        return Result.fail(ResultCode.RATE_LIMIT);
    }

    public Result<String> userInfoBlockHandler(String token, BlockException e) {
        log.warn("用户信息接口限流: {}", e.getMessage());
        return Result.fail(ResultCode.RATE_LIMIT);
    }
}
