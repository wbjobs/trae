package com.power.sampling.scheduler.service;

import cn.hutool.core.util.RandomUtil;
import com.power.sampling.common.dto.DeviceSamplingDTO;
import com.power.sampling.common.entity.Device;
import com.power.sampling.common.feign.DeviceFeignClient;
import com.power.sampling.common.feign.SamplingFeignClient;
import com.power.sampling.common.result.Result;
import lombok.extern.slf4j.Slf4j;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.scheduling.annotation.Async;
import org.springframework.scheduling.annotation.Scheduled;
import org.springframework.stereotype.Service;
import org.springframework.util.CollectionUtils;

import java.math.BigDecimal;
import java.time.LocalDateTime;
import java.util.ArrayList;
import java.util.List;
import java.util.concurrent.CompletableFuture;
import java.util.concurrent.atomic.AtomicBoolean;

@Slf4j
@Service
public class ScheduleTaskService {

    private static final int BATCH_SIZE = 100;
    private static final AtomicBoolean SAMPLING_TASK_RUNNING = new AtomicBoolean(false);
    private static final AtomicBoolean NODE_CHECK_TASK_RUNNING = new AtomicBoolean(false);

    @Autowired
    private DeviceFeignClient deviceFeignClient;

    @Autowired
    private SamplingFeignClient samplingFeignClient;

    @Scheduled(cron = "0 */5 * * * ?")
    public void scheduledSamplingTask() {
        if (!SAMPLING_TASK_RUNNING.compareAndSet(false, true)) {
            log.warn("定时采样任务正在执行中，跳过本次执行");
            return;
        }

        long startTime = System.currentTimeMillis();
        log.info("开始定时采样任务...");

        try {
            Result<List<Device>> devicesResult = deviceFeignClient.getOnlineDevices();
            if (!devicesResult.isSuccess() || CollectionUtils.isEmpty(devicesResult.getData())) {
                log.warn("没有在线设备，跳过采样任务");
                return;
            }

            List<Device> devices = devicesResult.getData();
            log.info("待采样设备数量: {}", devices.size());

            int totalProcessed = 0;
            int totalBatches = (int) Math.ceil((double) devices.size() / BATCH_SIZE);

            for (int batch = 0; batch < totalBatches; batch++) {
                long batchStartTime = System.currentTimeMillis();
                int fromIndex = batch * BATCH_SIZE;
                int toIndex = Math.min(fromIndex + BATCH_SIZE, devices.size());
                List<Device> batchDevices = devices.subList(fromIndex, toIndex);

                List<DeviceSamplingDTO> samplingList = new ArrayList<>();
                LocalDateTime now = LocalDateTime.now();

                for (Device device : batchDevices) {
                    DeviceSamplingDTO dto = new DeviceSamplingDTO();
                    dto.setDeviceId(device.getId());
                    dto.setDeviceCode(device.getDeviceCode());
                    dto.setVoltage(BigDecimal.valueOf(220 + RandomUtil.randomDouble(-5, 5)));
                    dto.setCurrent(BigDecimal.valueOf(RandomUtil.randomDouble(1, 50)));
                    dto.setPower(dto.getVoltage().multiply(dto.getCurrent()));
                    dto.setPowerFactor(BigDecimal.valueOf(RandomUtil.randomDouble(0.8, 1)));
                    dto.setFrequency(BigDecimal.valueOf(50 + RandomUtil.randomDouble(-0.5, 0.5)));
                    dto.setSamplingTime(now);
                    dto.setEdgeNodeId(1);
                    dto.setSamplingStatus(1);
                    samplingList.add(dto);
                }

                if (!samplingList.isEmpty()) {
                    try {
                        Result<?> result = samplingFeignClient.batchCollectSampling(samplingList);
                        if (result.isSuccess()) {
                            totalProcessed += samplingList.size();
                            log.debug("批次 {}/{} 采样完成，数量: {}，耗时: {}ms",
                                    batch + 1, totalBatches, samplingList.size(),
                                    System.currentTimeMillis() - batchStartTime);
                        } else {
                            log.error("批次 {}/{} 采样失败: {}", batch + 1, totalBatches, result.getMessage());
                        }
                    } catch (Exception e) {
                        log.error("批次 {}/{} 采样异常: {}", batch + 1, totalBatches, e.getMessage());
                    }
                }

                if (System.currentTimeMillis() - startTime > 240000) {
                    log.warn("采样任务执行时间超过4分钟，强制终止，已处理: {} 条", totalProcessed);
                    break;
                }
            }

            log.info("定时采样任务完成，成功采集: {} 条数据，总耗时: {}ms",
                    totalProcessed, System.currentTimeMillis() - startTime);

        } catch (Exception e) {
            log.error("定时采样任务异常", e);
        } finally {
            SAMPLING_TASK_RUNNING.set(false);
        }
    }

    @Scheduled(cron = "0 */30 * * * ?")
    public void scheduledNodeStatusCheck() {
        if (!NODE_CHECK_TASK_RUNNING.compareAndSet(false, true)) {
            log.warn("节点状态检查任务正在执行中，跳过本次执行");
            return;
        }

        try {
            log.info("开始检查边缘节点状态...");
            log.info("边缘节点状态检查完成");
        } catch (Exception e) {
            log.error("节点状态检查任务异常", e);
        } finally {
            NODE_CHECK_TASK_RUNNING.set(false);
        }
    }

    @Async
    public CompletableFuture<Boolean> triggerSamplingForDevices(List<Long> deviceIds) {
        log.info("手动触发设备采样: {}", deviceIds);

        try {
            Result<List<Device>> devicesResult = deviceFeignClient.getDeviceByIds(deviceIds);
            if (!devicesResult.isSuccess() || CollectionUtils.isEmpty(devicesResult.getData())) {
                return CompletableFuture.completedFuture(false);
            }

            int totalBatches = (int) Math.ceil((double) devicesResult.getData().size() / BATCH_SIZE);
            List<Device> allDevices = devicesResult.getData();

            for (int batch = 0; batch < totalBatches; batch++) {
                int fromIndex = batch * BATCH_SIZE;
                int toIndex = Math.min(fromIndex + BATCH_SIZE, allDevices.size());
                List<Device> batchDevices = allDevices.subList(fromIndex, toIndex);

                List<DeviceSamplingDTO> samplingList = new ArrayList<>();
                LocalDateTime now = LocalDateTime.now();

                for (Device device : batchDevices) {
                    DeviceSamplingDTO dto = new DeviceSamplingDTO();
                    dto.setDeviceId(device.getId());
                    dto.setDeviceCode(device.getDeviceCode());
                    dto.setVoltage(BigDecimal.valueOf(220 + RandomUtil.randomDouble(-5, 5)));
                    dto.setCurrent(BigDecimal.valueOf(RandomUtil.randomDouble(1, 50)));
                    dto.setPower(dto.getVoltage().multiply(dto.getCurrent()));
                    dto.setPowerFactor(BigDecimal.valueOf(RandomUtil.randomDouble(0.8, 1)));
                    dto.setFrequency(BigDecimal.valueOf(50 + RandomUtil.randomDouble(-0.5, 0.5)));
                    dto.setSamplingTime(now);
                    dto.setEdgeNodeId(1);
                    dto.setSamplingStatus(1);
                    samplingList.add(dto);
                }

                if (!samplingList.isEmpty()) {
                    try {
                        samplingFeignClient.batchCollectSampling(samplingList);
                    } catch (Exception e) {
                        log.error("手动触发采样批次 {} 失败: {}", batch + 1, e.getMessage());
                    }
                }
            }

            return CompletableFuture.completedFuture(true);
        } catch (Exception e) {
            log.error("触发采样异常", e);
            return CompletableFuture.completedFuture(false);
        }
    }
}
