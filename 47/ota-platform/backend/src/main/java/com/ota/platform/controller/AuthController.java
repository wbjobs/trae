package com.ota.platform.controller;

import com.ota.platform.dto.ApiResponse;
import com.ota.platform.entity.User;
import com.ota.platform.service.AuthService;
import jakarta.servlet.http.HttpServletRequest;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.security.core.Authentication;
import org.springframework.web.bind.annotation.*;

import java.util.Map;

@RestController
@RequestMapping("/api/auth")
public class AuthController {

    @Autowired
    private AuthService authService;

    @PostMapping("/login")
    public ApiResponse<Map<String, Object>> login(@RequestBody Map<String, String> loginRequest,
                                                  HttpServletRequest request) {
        String username = loginRequest.get("username");
        String password = loginRequest.get("password");
        String ipAddress = request.getRemoteAddr();

        Map<String, Object> result = authService.login(username, password, ipAddress);
        return ApiResponse.success(result);
    }

    @PostMapping("/register")
    public ApiResponse<User> register(@RequestBody User user) {
        User registeredUser = authService.register(user);
        registeredUser.setPassword(null);
        return ApiResponse.success("User registered successfully", registeredUser);
    }

    @GetMapping("/me")
    public ApiResponse<User> getCurrentUser(Authentication authentication) {
        String username = authentication.getName();
        User user = authService.getCurrentUser(username);
        user.setPassword(null);
        return ApiResponse.success(user);
    }

    @PostMapping("/change-password")
    public ApiResponse<Void> changePassword(@RequestBody Map<String, String> request,
                                            Authentication authentication) {
        String username = authentication.getName();
        String oldPassword = request.get("oldPassword");
        String newPassword = request.get("newPassword");

        authService.changePassword(username, oldPassword, newPassword);
        return ApiResponse.success("Password changed successfully", null);
    }
}
