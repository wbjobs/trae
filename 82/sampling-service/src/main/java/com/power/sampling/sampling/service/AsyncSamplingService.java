package com.power.sampling.sampling.service;

import cn.hutool.core.util.IdUtil;
import com.power.sampling.common.dto.DeviceSamplingDTO;
import com.power.sampling.common.entity.PowerSampling;
import com.power.sampling.sampling.dto.AsyncBatchResult;
import com.power.sampling.sampling.mapper.PowerSamplingMapper;
import lombok.extern.slf4j.Slf4j;
import org.springframework.beans.BeanUtils;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.scheduling.annotation.Async;
import org.springframework.stereotype.Service;
import org.springframework.util.CollectionUtils;

import java.time.LocalDateTime;
import java.util.ArrayList;
import java.util.List;
import java.util.Map;
import java.util.concurrent.ConcurrentHashMap;
import java.util.concurrent.CountDownLatch;
import java.util.concurrent.atomic.AtomicInteger;

@Slf4j
@Service
public class AsyncSamplingService {

    private static final int BATCH_SIZE = 200;

    private final Map<String, AsyncBatchResult> resultCache = new ConcurrentHashMap<>();

    @Autowired
    private PowerSamplingMapper powerSamplingMapper;

    @Async("batchSamplingExecutor")
    public AsyncBatchResult asyncBatchCollect(List<DeviceSamplingDTO> samplingDTOList) {
        String taskId = IdUtil.simpleUUID();
        AsyncBatchResult result = new AsyncBatchResult();
        result.setTaskId(taskId);
        result.setTotalCount(samplingDTOList.size());
        resultCache.put(taskId, result);

        try {
            int totalBatches = (int) Math.ceil((double) samplingDTOList.size() / BATCH_SIZE);
            CountDownLatch latch = new CountDownLatch(totalBatches);
            AtomicInteger successCount = new AtomicInteger(0);
            AtomicInteger failCount = new AtomicInteger(0);
            List<String> failMessages = new ArrayList<>();

            for (int i = 0; i < totalBatches; i++) {
                int fromIndex = i * BATCH_SIZE;
                int toIndex = Math.min(fromIndex + BATCH_SIZE, samplingDTOList.size());
                List<DeviceSamplingDTO> batch = samplingDTOList.subList(fromIndex, toIndex);

                processBatch(batch, latch, successCount, failCount, failMessages, result);
            }

            try {
                latch.await();
            } catch (InterruptedException e) {
                Thread.currentThread().interrupt();
                log.error("异步批量采样被中断", e);
            }

            result.setSuccessCount(successCount.get());
            result.setFailCount(failCount.get());
            result.setFailMessages(failMessages);
            result.setStatus(1);
            result.setEndTime(LocalDateTime.now());

            log.info("异步批量采样完成: taskId={}, total={}, success={}, fail={}",
                    taskId, result.getTotalCount(), successCount.get(), failCount.get());

        } catch (Exception e) {
            log.error("异步批量采样异常: taskId={}", taskId, e);
            result.setStatus(2);
            result.setEndTime(LocalDateTime.now());
        }

        return result;
    }

    private void processBatch(List<DeviceSamplingDTO> batch, CountDownLatch latch,
                             AtomicInteger successCount, AtomicInteger failCount,
                             List<String> failMessages, AsyncBatchResult result) {
        try {
            List<PowerSampling> samplingList = new ArrayList<>();
            LocalDateTime now = LocalDateTime.now();

            for (DeviceSamplingDTO dto : batch) {
                try {
                    PowerSampling sampling = new PowerSampling();
                    BeanUtils.copyProperties(dto, sampling);
                    if (sampling.getSamplingTime() == null) {
                        sampling.setSamplingTime(now);
                    }
                    sampling.setCreateTime(now);
                    sampling.setSamplingStatus(1);
                    samplingList.add(sampling);
                } catch (Exception e) {
                    failCount.incrementAndGet();
                    failMessages.add("设备 " + dto.getDeviceCode() + " 处理失败: " + e.getMessage());
                    result.getDeviceStatus().put(dto.getDeviceId(), false);
                }
            }

            if (!CollectionUtils.isEmpty(samplingList)) {
                for (PowerSampling sampling : samplingList) {
                    try {
                        powerSamplingMapper.insert(sampling);
                        successCount.incrementAndGet();
                        result.getDeviceStatus().put(sampling.getDeviceId(), true);
                    } catch (Exception e) {
                        failCount.incrementAndGet();
                        failMessages.add("设备 " + sampling.getDeviceCode() + " 入库失败: " + e.getMessage());
                    }
                }
            }
        } finally {
            latch.countDown();
        }
    }

    public AsyncBatchResult getAsyncResult(String taskId) {
        return resultCache.get(taskId);
    }

    @Async("samplingAsyncExecutor")
    public void processSamplingAsync(DeviceSamplingDTO dto) {
        try {
            PowerSampling sampling = new PowerSampling();
            BeanUtils.copyProperties(dto, sampling);
            if (sampling.getSamplingTime() == null) {
                sampling.setSamplingTime(LocalDateTime.now());
            }
            sampling.setCreateTime(LocalDateTime.now());
            sampling.setSamplingStatus(1);
            powerSamplingMapper.insert(sampling);
            log.debug("异步采样完成: deviceCode={}", dto.getDeviceCode());
        } catch (Exception e) {
            log.error("异步采样失败: deviceCode={}", dto.getDeviceCode(), e);
        }
    }
}
