package com.power.sampling.common.feign;

import com.power.sampling.common.result.Result;
import org.springframework.cloud.openfeign.FeignClient;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.RequestHeader;

@FeignClient(name = "auth-service", path = "/auth")
public interface AuthFeignClient {

    @GetMapping("/validate")
    Result<Boolean> validateToken(@RequestHeader("Authorization") String token);

    @GetMapping("/user/info")
    Result<String> getCurrentUsername(@RequestHeader("Authorization") String token);
}
