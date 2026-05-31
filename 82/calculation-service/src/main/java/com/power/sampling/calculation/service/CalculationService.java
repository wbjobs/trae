package com.power.sampling.calculation.service;

import com.baomidou.mybatisplus.core.conditions.query.QueryWrapper;
import com.baomidou.mybatisplus.core.metadata.IPage;
import com.baomidou.mybatisplus.extension.plugins.pagination.Page;
import com.power.sampling.calculation.mapper.PowerCalculationMapper;
import com.power.sampling.common.dto.BatchSamplingQueryDTO;
import com.power.sampling.common.dto.PowerCalculationDTO;
import com.power.sampling.common.entity.PowerCalculation;
import com.power.sampling.common.entity.PowerSampling;
import com.power.sampling.common.exception.BusinessException;
import com.power.sampling.common.feign.SamplingFeignClient;
import com.power.sampling.common.result.Result;
import com.power.sampling.common.result.ResultCode;
import lombok.extern.slf4j.Slf4j;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.scheduling.annotation.Async;
import org.springframework.stereotype.Service;
import org.springframework.util.CollectionUtils;

import java.math.BigDecimal;
import java.math.RoundingMode;
import java.time.LocalDateTime;
import java.util.List;

@Slf4j
@Service
public class CalculationService {

    @Autowired
    private PowerCalculationMapper powerCalculationMapper;

    @Autowired
    private SamplingFeignClient samplingFeignClient;

    public PowerCalculation executeCalculation(PowerCalculationDTO calculationDTO) {
        if (calculationDTO.getDeviceId() == null) {
            throw new BusinessException(ResultCode.BAD_REQUEST);
        }

        BatchSamplingQueryDTO queryDTO = new BatchSamplingQueryDTO();
        queryDTO.getDeviceIds().add(calculationDTO.getDeviceId());
        queryDTO.setStartTime(calculationDTO.getStartTime());
        queryDTO.setEndTime(calculationDTO.getEndTime());

        Result<List<PowerSampling>> samplingResult = samplingFeignClient.batchQuerySampling(queryDTO);
        if (!samplingResult.isSuccess() || CollectionUtils.isEmpty(samplingResult.getData())) {
            throw new BusinessException(ResultCode.CALCULATION_FAILED);
        }

        return calculateAndSave(calculationDTO.getDeviceId(), null,
                calculationDTO.getCalculationType(), samplingResult.getData(),
                calculationDTO.getStartTime(), calculationDTO.getEndTime());
    }

    @Async
    public Boolean batchExecuteCalculation(PowerCalculationDTO calculationDTO) {
        if (CollectionUtils.isEmpty(calculationDTO.getDeviceIds())) {
            throw new BusinessException(ResultCode.BAD_REQUEST);
        }

        for (Long deviceId : calculationDTO.getDeviceIds()) {
            try {
                BatchSamplingQueryDTO queryDTO = new BatchSamplingQueryDTO();
                queryDTO.getDeviceIds().add(deviceId);
                queryDTO.setStartTime(calculationDTO.getStartTime());
                queryDTO.setEndTime(calculationDTO.getEndTime());

                Result<List<PowerSampling>> samplingResult = samplingFeignClient.batchQuerySampling(queryDTO);
                if (samplingResult.isSuccess() && !CollectionUtils.isEmpty(samplingResult.getData())) {
                    calculateAndSave(deviceId, null, calculationDTO.getCalculationType(),
                            samplingResult.getData(), calculationDTO.getStartTime(), calculationDTO.getEndTime());
                }
            } catch (Exception e) {
                log.error("批量运算失败, deviceId: {}", deviceId, e);
            }
        }

        return true;
    }

    private PowerCalculation calculateAndSave(Long deviceId, String deviceCode, Integer calculationType,
                                              List<PowerSampling> samplingList,
                                              LocalDateTime startTime, LocalDateTime endTime) {
        if (CollectionUtils.isEmpty(samplingList)) {
            return null;
        }

        BigDecimal sumPower = BigDecimal.ZERO;
        BigDecimal maxPower = BigDecimal.ZERO;
        BigDecimal minPower = new BigDecimal("99999999");
        BigDecimal totalEnergy = BigDecimal.ZERO;

        for (PowerSampling sampling : samplingList) {
            BigDecimal power = sampling.getPower();
            if (power == null) continue;

            sumPower = sumPower.add(power);
            if (power.compareTo(maxPower) > 0) {
                maxPower = power;
            }
            if (power.compareTo(minPower) < 0) {
                minPower = power;
            }
        }

        BigDecimal avgPower = sumPower.divide(BigDecimal.valueOf(samplingList.size()), 2, RoundingMode.HALF_UP);

        if (startTime != null && endTime != null) {
            long hours = java.time.Duration.between(startTime, endTime).toHours();
            if (hours > 0) {
                totalEnergy = avgPower.multiply(BigDecimal.valueOf(hours))
                        .divide(BigDecimal.valueOf(1000), 4, RoundingMode.HALF_UP);
            }
        }

        if (minPower.compareTo(new BigDecimal("99999999")) == 0) {
            minPower = BigDecimal.ZERO;
        }

        PowerCalculation calculation = new PowerCalculation();
        calculation.setDeviceId(deviceId);
        calculation.setDeviceCode(deviceCode);
        calculation.setCalculationType(calculationType);
        calculation.setAvgPower(avgPower);
        calculation.setMaxPower(maxPower);
        calculation.setMinPower(minPower);
        calculation.setTotalEnergy(totalEnergy);
        calculation.setStartTime(startTime);
        calculation.setEndTime(endTime);
        calculation.setCreateTime(LocalDateTime.now());

        powerCalculationMapper.insert(calculation);
        log.info("功耗运算完成, deviceId: {}, avgPower: {}, totalEnergy: {}",
                deviceId, avgPower, totalEnergy);

        return calculation;
    }

    public IPage<PowerCalculation> getCalculationPage(Integer pageNum, Integer pageSize,
                                                       Long deviceId, Integer calculationType,
                                                       LocalDateTime startTime, LocalDateTime endTime) {
        Page<PowerCalculation> page = new Page<>(pageNum, pageSize);
        QueryWrapper<PowerCalculation> wrapper = new QueryWrapper<>();
        if (deviceId != null) {
            wrapper.eq("device_id", deviceId);
        }
        if (calculationType != null) {
            wrapper.eq("calculation_type", calculationType);
        }
        if (startTime != null) {
            wrapper.ge("start_time", startTime);
        }
        if (endTime != null) {
            wrapper.le("end_time", endTime);
        }
        wrapper.orderByDesc("create_time");
        return powerCalculationMapper.selectPage(page, wrapper);
    }

    public PowerCalculation getById(Long id) {
        return powerCalculationMapper.selectById(id);
    }
}
