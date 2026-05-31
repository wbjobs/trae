package com.power.sampling.common.feign;

import com.power.sampling.common.dto.BatchSamplingQueryDTO;
import com.power.sampling.common.dto.DeviceSamplingDTO;
import com.power.sampling.common.entity.PowerSampling;
import com.power.sampling.common.result.Result;
import org.springframework.cloud.openfeign.FeignClient;
import org.springframework.web.bind.annotation.PostMapping;
import org.springframework.web.bind.annotation.RequestBody;

import java.util.List;

@FeignClient(name = "sampling-service", path = "/sampling")
public interface SamplingFeignClient {

    @PostMapping("/collect")
    Result<PowerSampling> collectSampling(@RequestBody DeviceSamplingDTO samplingDTO);

    @PostMapping("/batch/collect")
    Result<List<PowerSampling>> batchCollectSampling(@RequestBody List<DeviceSamplingDTO> samplingDTOList);

    @PostMapping("/batch/query")
    Result<List<PowerSampling>> batchQuerySampling(@RequestBody BatchSamplingQueryDTO queryDTO);
}
