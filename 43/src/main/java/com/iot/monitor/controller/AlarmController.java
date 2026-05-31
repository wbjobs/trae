package com.iot.monitor.controller;

import com.baomidou.mybatisplus.core.conditions.query.LambdaQueryWrapper;
import com.baomidou.mybatisplus.extension.plugins.pagination.Page;
import com.iot.monitor.common.Result;
import com.iot.monitor.entity.AlarmConfig;
import com.iot.monitor.entity.AlarmRecord;
import com.iot.monitor.enums.AlarmLevel;
import com.iot.monitor.mapper.AlarmConfigMapper;
import com.iot.monitor.mapper.AlarmRecordMapper;
import lombok.RequiredArgsConstructor;
import org.springframework.web.bind.annotation.*;

import java.time.LocalDateTime;
import java.util.HashMap;
import java.util.List;
import java.util.Map;

@RestController
@RequestMapping("/api/alarm")
@RequiredArgsConstructor
public class AlarmController {

    private final AlarmConfigMapper alarmConfigMapper;
    private final AlarmRecordMapper alarmRecordMapper;

    @GetMapping("/config/list")
    public Result<List<AlarmConfig>> getConfigList(@RequestParam Long deviceId) {
        List<AlarmConfig> configs = alarmConfigMapper.selectByDeviceId(deviceId);
        return Result.success(configs);
    }

    @PostMapping("/config")
    public Result<AlarmConfig> addConfig(@RequestBody AlarmConfig config) {
        if (config.getAlarmLevel() == null) {
            config.setAlarmLevel(AlarmLevel.P3.getCode());
        }
        config.setCreateTime(LocalDateTime.now());
        config.setUpdateTime(LocalDateTime.now());
        alarmConfigMapper.insert(config);
        return Result.success(config);
    }

    @PutMapping("/config")
    public Result<AlarmConfig> updateConfig(@RequestBody AlarmConfig config) {
        config.setUpdateTime(LocalDateTime.now());
        alarmConfigMapper.updateById(config);
        return Result.success(config);
    }

    @DeleteMapping("/config/{id}")
    public Result<Void> deleteConfig(@PathVariable Long id) {
        alarmConfigMapper.deleteById(id);
        return Result.success();
    }

    @GetMapping("/record/list")
    public Result<Page<AlarmRecord>> getRecordList(
            @RequestParam(defaultValue = "1") int page,
            @RequestParam(defaultValue = "10") int size,
            @RequestParam(required = false) Long deviceId,
            @RequestParam(required = false) String alarmLevel,
            @RequestParam(required = false) Integer status) {

        LambdaQueryWrapper<AlarmRecord> wrapper = new LambdaQueryWrapper<>();
        if (deviceId != null) {
            wrapper.eq(AlarmRecord::getDeviceId, deviceId);
        }
        if (alarmLevel != null) {
            wrapper.eq(AlarmRecord::getAlarmLevel, alarmLevel);
        }
        if (status != null) {
            wrapper.eq(AlarmRecord::getStatus, status);
        }
        wrapper.orderByDesc(AlarmRecord::getFirstAlarmTime);

        Page<AlarmRecord> pageResult = alarmRecordMapper.selectPage(new Page<>(page, size), wrapper);
        return Result.success(pageResult);
    }

    @PutMapping("/record/{id}/ack")
    public Result<Void> ackRecord(@PathVariable Long id) {
        AlarmRecord record = alarmRecordMapper.selectById(id);
        if (record != null) {
            record.setStatus(2);
            record.setUpdateTime(LocalDateTime.now());
            alarmRecordMapper.updateById(record);
        }
        return Result.success();
    }

    @GetMapping("/statistics")
    public Result<Map<String, Object>> getAlarmStatistics(
            @RequestParam(required = false) Long deviceId) {
        Map<String, Object> result = new HashMap<>();

        LambdaQueryWrapper<AlarmRecord> activeWrapper = new LambdaQueryWrapper<>();
        activeWrapper.eq(AlarmRecord::getStatus, 1);
        if (deviceId != null) {
            activeWrapper.eq(AlarmRecord::getDeviceId, deviceId);
        }
        Long activeCount = alarmRecordMapper.selectCount(activeWrapper);
        result.put("activeCount", activeCount);

        for (AlarmLevel level : AlarmLevel.values()) {
            LambdaQueryWrapper<AlarmRecord> levelWrapper = new LambdaQueryWrapper<>();
            levelWrapper.eq(AlarmRecord::getStatus, 1)
                    .eq(AlarmRecord::getAlarmLevel, level.getCode());
            if (deviceId != null) {
                levelWrapper.eq(AlarmRecord::getDeviceId, deviceId);
            }
            Long count = alarmRecordMapper.selectCount(levelWrapper);
            result.put("level" + level.getCode() + "Count", count);
        }

        LambdaQueryWrapper<AlarmRecord> todayWrapper = new LambdaQueryWrapper<>();
        todayWrapper.ge(AlarmRecord::getFirstAlarmTime, LocalDateTime.now().withHour(0).withMinute(0).withSecond(0));
        if (deviceId != null) {
            todayWrapper.eq(AlarmRecord::getDeviceId, deviceId);
        }
        Long todayCount = alarmRecordMapper.selectCount(todayWrapper);
        result.put("todayCount", todayCount);

        return Result.success(result);
    }

    @GetMapping("/levels")
    public Result<List<Map<String, String>>> getAlarmLevels() {
        List<Map<String, String>> levels = new java.util.ArrayList<>();
        for (AlarmLevel level : AlarmLevel.values()) {
            Map<String, String> map = new HashMap<>();
            map.put("code", level.getCode());
            map.put("name", level.getName());
            map.put("description", level.getDescription());
            map.put("priority", String.valueOf(level.getPriority()));
            levels.add(map);
        }
        return Result.success(levels);
    }
}
