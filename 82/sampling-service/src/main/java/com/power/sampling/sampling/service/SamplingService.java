package com.power.sampling.sampling.service;

import cn.hutool.core.util.RandomUtil;
import com.baomidou.mybatisplus.core.conditions.query.QueryWrapper;
import com.baomidou.mybatisplus.core.metadata.IPage;
import com.baomidou.mybatisplus.extension.plugins.pagination.Page;
import com.power.sampling.sampling.mapper.PowerSamplingMapper;
import com.power.sampling.common.dto.BatchSamplingQueryDTO;
import com.power.sampling.common.dto.DeviceSamplingDTO;
import com.power.sampling.common.entity.PowerSampling;
import com.power.sampling.common.exception.BusinessException;
import com.power.sampling.common.feign.DeviceFeignClient;
import com.power.sampling.common.result.Result;
import com.power.sampling.common.result.ResultCode;
import lombok.extern.slf4j.Slf4j;
import org.springframework.beans.BeanUtils;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.scheduling.annotation.Async;
import org.springframework.stereotype.Service;
import org.springframework.util.CollectionUtils;

import java.math.BigDecimal;
import java.time.LocalDateTime;
import java.util.ArrayList;
import java.util.List;
import java.util.concurrent.CompletableFuture;

@Slf4j
@Service
public class SamplingService {

    @Autowired
    private PowerSamplingMapper powerSamplingMapper;

    @Autowired
    private DeviceFeignClient deviceFeignClient;

    public PowerSampling collectSampling(DeviceSamplingDTO samplingDTO) {
        PowerSampling sampling = new PowerSampling();
        BeanUtils.copyProperties(samplingDTO, sampling);
        if (sampling.getSamplingTime() == null) {
            sampling.setSamplingTime(LocalDateTime.now());
        }
        sampling.setCreateTime(LocalDateTime.now());
        sampling.setSamplingStatus(1);
        powerSamplingMapper.insert(sampling);
        return sampling;
    }

    public List<PowerSampling> batchCollectSampling(List<DeviceSamplingDTO> samplingDTOList) {
        if (CollectionUtils.isEmpty(samplingDTOList)) {
            throw new BusinessException(ResultCode.BAD_REQUEST);
        }

        List<PowerSampling> resultList = new ArrayList<>();
        LocalDateTime now = LocalDateTime.now();

        for (DeviceSamplingDTO dto : samplingDTOList) {
            PowerSampling sampling = new PowerSampling();
            BeanUtils.copyProperties(dto, sampling);
            if (sampling.getSamplingTime() == null) {
                sampling.setSamplingTime(now);
            }
            sampling.setCreateTime(now);
            sampling.setSamplingStatus(1);
            powerSamplingMapper.insert(sampling);
            resultList.add(sampling);
        }

        log.info("批量采样数据入库成功, 数量: {}", resultList.size());
        return resultList;
    }

    public List<PowerSampling> batchQuerySampling(BatchSamplingQueryDTO queryDTO) {
        return powerSamplingMapper.batchQuerySampling(queryDTO);
    }

    public IPage<PowerSampling> getSamplingPage(Integer pageNum, Integer pageSize,
                                                Long deviceId, LocalDateTime startTime, LocalDateTime endTime) {
        Page<PowerSampling> page = new Page<>(pageNum, pageSize);
        QueryWrapper<PowerSampling> wrapper = new QueryWrapper<>();
        if (deviceId != null) {
            wrapper.eq("device_id", deviceId);
        }
        if (startTime != null) {
            wrapper.ge("sampling_time", startTime);
        }
        if (endTime != null) {
            wrapper.le("sampling_time", endTime);
        }
        wrapper.orderByDesc("sampling_time");
        return powerSamplingMapper.selectPage(page, wrapper);
    }

    @Async
    public CompletableFuture<PowerSampling> simulateSampling(Long deviceId, String deviceCode) {
        try {
            Thread.sleep(RandomUtil.randomInt(10, 100));
        } catch (InterruptedException e) {
            Thread.currentThread().interrupt();
        }

        DeviceSamplingDTO dto = new DeviceSamplingDTO();
        dto.setDeviceId(deviceId);
        dto.setDeviceCode(deviceCode);
        dto.setVoltage(BigDecimal.valueOf(220 + RandomUtil.randomDouble(-5, 5)));
        dto.setCurrent(BigDecimal.valueOf(RandomUtil.randomDouble(1, 50)));
        dto.setPower(dto.getVoltage().multiply(dto.getCurrent()));
        dto.setPowerFactor(BigDecimal.valueOf(RandomUtil.randomDouble(0.8, 1)));
        dto.setFrequency(BigDecimal.valueOf(50 + RandomUtil.randomDouble(-0.5, 0.5)));
        dto.setSamplingTime(LocalDateTime.now());
        dto.setSamplingStatus(1);

        return CompletableFuture.completedFuture(collectSampling(dto));
    }

    public List<PowerSampling> batchPullSampling(List<Long> deviceIds, LocalDateTime startTime, LocalDateTime endTime) {
        if (CollectionUtils.isEmpty(deviceIds)) {
            throw new BusinessException(ResultCode.BAD_REQUEST);
        }

        if (deviceIds.size() > 500) {
            log.warn("批量拉取设备数量超过500，自动截断前500条");
            deviceIds = deviceIds.subList(0, 500);
        }

        BatchSamplingQueryDTO queryDTO = new BatchSamplingQueryDTO();
        queryDTO.setDeviceIds(new ArrayList<>(deviceIds));
        queryDTO.setStartTime(startTime);
        queryDTO.setEndTime(endTime);
        queryDTO.setPageSize(10000);

        List<PowerSampling> result = powerSamplingMapper.batchQuerySampling(queryDTO);
        log.info("批量拉取采样数据完成，设备数: {}, 结果数: {}", deviceIds.size(), result.size());
        return result;
    }
}
