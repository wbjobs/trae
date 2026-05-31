package com.iot.monitor.controller;

import com.baomidou.mybatisplus.core.conditions.query.LambdaQueryWrapper;
import com.baomidou.mybatisplus.extension.plugins.pagination.Page;
import com.iot.monitor.common.Result;
import com.iot.monitor.entity.User;
import com.iot.monitor.mapper.UserMapper;
import lombok.RequiredArgsConstructor;
import org.springframework.web.bind.annotation.*;

import java.time.LocalDateTime;

@RestController
@RequestMapping("/api/user")
@RequiredArgsConstructor
public class UserController {

    private final UserMapper userMapper;

    @GetMapping("/list")
    public Result<Page<User>> list(@RequestParam(defaultValue = "1") int page,
                                   @RequestParam(defaultValue = "10") int size) {
        Page<User> pageResult = userMapper.selectPage(
                new Page<>(page, size),
                new LambdaQueryWrapper<User>().orderByDesc(User::getCreateTime)
        );
        return Result.success(pageResult);
    }

    @PostMapping
    public Result<User> add(@RequestBody User user) {
        user.setCreateTime(LocalDateTime.now());
        user.setUpdateTime(LocalDateTime.now());
        userMapper.insert(user);
        return Result.success(user);
    }

    @PutMapping
    public Result<User> update(@RequestBody User user) {
        user.setUpdateTime(LocalDateTime.now());
        userMapper.updateById(user);
        return Result.success(user);
    }

    @DeleteMapping("/{id}")
    public Result<Void> delete(@PathVariable Long id) {
        userMapper.deleteById(id);
        return Result.success();
    }
}
