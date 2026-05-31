package com.power.sampling.auth.service;

import cn.hutool.core.util.IdUtil;
import cn.hutool.crypto.SecureUtil;
import com.baomidou.mybatisplus.core.conditions.query.QueryWrapper;
import com.power.sampling.auth.mapper.SysUserMapper;
import com.power.sampling.common.dto.LoginDTO;
import com.power.sampling.common.entity.SysUser;
import com.power.sampling.common.exception.BusinessException;
import com.power.sampling.common.result.ResultCode;
import com.power.sampling.common.utils.JwtUtil;
import lombok.extern.slf4j.Slf4j;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.stereotype.Service;

import java.time.LocalDateTime;
import java.util.HashMap;
import java.util.Map;

@Slf4j
@Service
public class AuthService {

    @Autowired
    private SysUserMapper sysUserMapper;

    public Map<String, Object> login(LoginDTO loginDTO) {
        SysUser user = sysUserMapper.selectOne(new QueryWrapper<SysUser>()
                .eq("username", loginDTO.getUsername()));

        if (user == null) {
            throw new BusinessException(ResultCode.AUTH_USER_NOT_EXIST);
        }

        if (user.getStatus() != 1) {
            throw new BusinessException("用户已被禁用");
        }

        String encryptedPassword = SecureUtil.md5(loginDTO.getPassword() + user.getSalt());
        if (!encryptedPassword.equals(user.getPassword())) {
            throw new BusinessException(ResultCode.AUTH_PASSWORD_ERROR);
        }

        String token = JwtUtil.generateToken(user.getId(), user.getUsername(), user.getRole());

        Map<String, Object> result = new HashMap<>();
        result.put("token", token);
        result.put("userId", user.getId());
        result.put("username", user.getUsername());
        result.put("realName", user.getRealName());
        result.put("role", user.getRole());

        log.info("用户登录成功: {}", user.getUsername());
        return result;
    }

    public Boolean register(SysUser user) {
        SysUser existUser = sysUserMapper.selectOne(new QueryWrapper<SysUser>()
                .eq("username", user.getUsername()));
        if (existUser != null) {
            throw new BusinessException("用户名已存在");
        }

        String salt = IdUtil.simpleUUID();
        user.setSalt(salt);
        user.setPassword(SecureUtil.md5(user.getPassword() + salt));
        user.setStatus(1);
        user.setCreateTime(LocalDateTime.now());
        user.setUpdateTime(LocalDateTime.now());

        return sysUserMapper.insert(user) > 0;
    }

    public Boolean validateToken(String token) {
        if (token.startsWith("Bearer ")) {
            token = token.substring(7);
        }
        return !JwtUtil.isTokenExpired(token) && JwtUtil.getUsernameFromToken(token) != null;
    }

    public String getUsernameFromToken(String token) {
        if (token.startsWith("Bearer ")) {
            token = token.substring(7);
        }
        return JwtUtil.getUsernameFromToken(token);
    }
}
