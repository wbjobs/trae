package com.iot.monitor.controller;

import com.baomidou.mybatisplus.core.conditions.query.LambdaQueryWrapper;
import com.baomidou.mybatisplus.extension.plugins.pagination.Page;
import com.iot.monitor.common.Result;
import com.iot.monitor.entity.Device;
import com.iot.monitor.entity.DevicePoint;
import com.iot.monitor.mapper.DeviceMapper;
import com.iot.monitor.mapper.DevicePointMapper;
import lombok.RequiredArgsConstructor;
import org.springframework.web.bind.annotation.*;

import java.time.LocalDateTime;
import java.util.List;

@RestController
@RequestMapping("/api/device")
@RequiredArgsConstructor
public class DeviceController {

    private final DeviceMapper deviceMapper;
    private final DevicePointMapper devicePointMapper;

    @GetMapping("/list")
    public Result<Page<Device>> list(@RequestParam(defaultValue = "1") int page,
                                     @RequestParam(defaultValue = "10") int size) {
        Page<Device> pageResult = deviceMapper.selectPage(
                new Page<>(page, size),
                new LambdaQueryWrapper<Device>().orderByDesc(Device::getCreateTime)
        );
        return Result.success(pageResult);
    }

    @PostMapping
    public Result<Device> add(@RequestBody Device device) {
        device.setCreateTime(LocalDateTime.now());
        device.setUpdateTime(LocalDateTime.now());
        deviceMapper.insert(device);
        return Result.success(device);
    }

    @PutMapping
    public Result<Device> update(@RequestBody Device device) {
        device.setUpdateTime(LocalDateTime.now());
        deviceMapper.updateById(device);
        return Result.success(device);
    }

    @DeleteMapping("/{id}")
    public Result<Void> delete(@PathVariable Long id) {
        deviceMapper.deleteById(id);
        return Result.success();
    }

    @GetMapping("/{id}/points")
    public Result<List<DevicePoint>> getPoints(@PathVariable Long id) {
        List<DevicePoint> points = devicePointMapper.selectByDeviceId(id);
        return Result.success(points);
    }

    @PostMapping("/{id}/point")
    public Result<DevicePoint> addPoint(@PathVariable Long id, @RequestBody DevicePoint point) {
        point.setDeviceId(id);
        point.setCreateTime(LocalDateTime.now());
        devicePointMapper.insert(point);
        return Result.success(point);
    }
}
