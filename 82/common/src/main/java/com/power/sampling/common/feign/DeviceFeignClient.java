package com.power.sampling.common.feign;

import com.power.sampling.common.entity.Device;
import com.power.sampling.common.result.Result;
import org.springframework.cloud.openfeign.FeignClient;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.PathVariable;
import org.springframework.web.bind.annotation.PostMapping;
import org.springframework.web.bind.annotation.RequestBody;

import java.util.List;

@FeignClient(name = "device-service", path = "/device")
public interface DeviceFeignClient {

    @GetMapping("/{id}")
    Result<Device> getDeviceById(@PathVariable("id") Long id);

    @GetMapping("/code/{deviceCode}")
    Result<Device> getDeviceByCode(@PathVariable("deviceCode") String deviceCode);

    @GetMapping("/list/all")
    Result<List<Device>> getAllDevices();

    @GetMapping("/list/online")
    Result<List<Device>> getOnlineDevices();

    @PostMapping("/batch/query")
    Result<List<Device>> getDeviceByIds(@RequestBody List<Long> deviceIds);

    @PostMapping("/heartbeat/{deviceCode}")
    Result<Boolean> deviceHeartbeat(@PathVariable("deviceCode") String deviceCode);

    @PostMapping("/status/{deviceCode}/{status}")
    Result<Boolean> updateDeviceStatus(@PathVariable("deviceCode") String deviceCode, @PathVariable("status") Integer status);
}
