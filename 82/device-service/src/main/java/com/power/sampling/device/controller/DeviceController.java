package com.power.sampling.device.controller;

import com.alibaba.csp.sentinel.annotation.SentinelResource;
import com.alibaba.csp.sentinel.slots.block.BlockException;
import com.baomidou.mybatisplus.core.metadata.IPage;
import com.power.sampling.device.service.DeviceAbnormalService;
import com.power.sampling.device.service.DeviceService;
import com.power.sampling.common.dto.DeviceAbnormalDTO;
import com.power.sampling.common.entity.Device;
import com.power.sampling.common.entity.DeviceAbnormal;
import com.power.sampling.common.result.Result;
import com.power.sampling.common.result.ResultCode;
import lombok.extern.slf4j.Slf4j;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.web.bind.annotation.*;

import java.util.List;

@Slf4j
@RestController
@RequestMapping("/device")
public class DeviceController {

    @Autowired
    private DeviceService deviceService;

    @Autowired
    private DeviceAbnormalService deviceAbnormalService;

    @GetMapping("/{id}")
    @SentinelResource(value = "device-get", blockHandler = "blockHandler")
    public Result<Device> getDeviceById(@PathVariable("id") Long id) {
        return Result.success(deviceService.getDeviceById(id));
    }

    @GetMapping("/code/{deviceCode}")
    @SentinelResource(value = "device-get-code", blockHandler = "blockHandler")
    public Result<Device> getDeviceByCode(@PathVariable("deviceCode") String deviceCode) {
        return Result.success(deviceService.getDeviceByCode(deviceCode));
    }

    @GetMapping("/list/all")
    @SentinelResource(value = "device-list-all", blockHandler = "blockHandler")
    public Result<List<Device>> getAllDevices() {
        return Result.success(deviceService.getAllDevices());
    }

    @GetMapping("/list/online")
    @SentinelResource(value = "device-list-online", blockHandler = "blockHandler")
    public Result<List<Device>> getOnlineDevices() {
        return Result.success(deviceService.getOnlineDevices());
    }

    @PostMapping("/batch/query")
    @SentinelResource(value = "device-batch-query", blockHandler = "blockHandler")
    public Result<List<Device>> getDeviceByIds(@RequestBody List<Long> deviceIds) {
        return Result.success(deviceService.getDeviceByIds(deviceIds));
    }

    @GetMapping("/page")
    @SentinelResource(value = "device-page", blockHandler = "blockHandler")
    public Result<IPage<Device>> getDevicePage(
            @RequestParam(defaultValue = "1") Integer pageNum,
            @RequestParam(defaultValue = "10") Integer pageSize,
            @RequestParam(required = false) String deviceName,
            @RequestParam(required = false) Integer status) {
        return Result.success(deviceService.getDevicePage(pageNum, pageSize, deviceName, status));
    }

    @PostMapping("/add")
    @SentinelResource(value = "device-add", blockHandler = "blockHandler")
    public Result<Boolean> addDevice(@RequestBody Device device) {
        return Result.success(deviceService.addDevice(device));
    }

    @PostMapping("/update")
    @SentinelResource(value = "device-update", blockHandler = "blockHandler")
    public Result<Boolean> updateDevice(@RequestBody Device device) {
        return Result.success(deviceService.updateDevice(device));
    }

    @PostMapping("/delete/{id}")
    @SentinelResource(value = "device-delete", blockHandler = "blockHandler")
    public Result<Boolean> deleteDevice(@PathVariable("id") Long id) {
        return Result.success(deviceService.deleteDevice(id));
    }

    @PostMapping("/heartbeat/{deviceCode}")
    @SentinelResource(value = "device-heartbeat", blockHandler = "heartbeatBlockHandler")
    public Result<Boolean> deviceHeartbeat(@PathVariable("deviceCode") String deviceCode) {
        return Result.success(deviceService.deviceHeartbeat(deviceCode));
    }

    @PostMapping("/status/{deviceCode}/{status}")
    @SentinelResource(value = "device-status", blockHandler = "blockHandler")
    public Result<Boolean> updateDeviceStatus(@PathVariable("deviceCode") String deviceCode,
                                              @PathVariable("status") Integer status) {
        return Result.success(deviceService.updateDeviceStatus(deviceCode, status));
    }

    @PostMapping("/abnormal/report")
    @SentinelResource(value = "device-abnormal-report", blockHandler = "abnormalBlockHandler")
    public Result<Boolean> reportAbnormal(@RequestBody DeviceAbnormalDTO abnormalDTO) {
        return Result.success(deviceService.reportAbnormal(abnormalDTO));
    }

    @GetMapping("/abnormal/page")
    @SentinelResource(value = "device-abnormal-page", blockHandler = "blockHandler")
    public Result<IPage<DeviceAbnormal>> getAbnormalPage(
            @RequestParam(defaultValue = "1") Integer pageNum,
            @RequestParam(defaultValue = "10") Integer pageSize,
            @RequestParam(required = false) String deviceCode,
            @RequestParam(required = false) Integer status,
            @RequestParam(required = false) Integer severity) {
        return Result.success(deviceAbnormalService.getAbnormalPage(pageNum, pageSize, deviceCode, status, severity));
    }

    @PostMapping("/abnormal/handle/{id}")
    @SentinelResource(value = "device-abnormal-handle", blockHandler = "blockHandler")
    public Result<Boolean> handleAbnormal(@PathVariable("id") Long id,
                                          @RequestParam String handler,
                                          @RequestParam(required = false) String handleRemark) {
        return Result.success(deviceAbnormalService.handleAbnormal(id, handler, handleRemark));
    }

    @GetMapping("/edge/{edgeNode}")
    @SentinelResource(value = "device-edge", blockHandler = "blockHandler")
    public Result<List<Device>> getDevicesByEdgeNode(@PathVariable("edgeNode") String edgeNode) {
        return Result.success(deviceService.getDevicesByEdgeNode(edgeNode));
    }

    public Result<?> blockHandler(Object param, BlockException e) {
        log.warn("设备接口限流: {}", e.getMessage());
        return Result.fail(ResultCode.RATE_LIMIT);
    }

    public Result<Boolean> heartbeatBlockHandler(String deviceCode, BlockException e) {
        log.warn("心跳接口限流: deviceCode={}", deviceCode);
        return Result.fail(ResultCode.RATE_LIMIT);
    }

    public Result<Boolean> abnormalBlockHandler(DeviceAbnormalDTO abnormalDTO, BlockException e) {
        log.warn("异常上报接口限流: deviceCode={}", abnormalDTO.getDeviceCode());
        return Result.fail(ResultCode.RATE_LIMIT);
    }
}
