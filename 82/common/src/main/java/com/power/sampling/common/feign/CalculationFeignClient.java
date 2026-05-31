package com.power.sampling.common.feign;

import com.power.sampling.common.dto.PowerCalculationDTO;
import com.power.sampling.common.entity.PowerCalculation;
import com.power.sampling.common.result.Result;
import org.springframework.cloud.openfeign.FeignClient;
import org.springframework.web.bind.annotation.PostMapping;
import org.springframework.web.bind.annotation.RequestBody;

@FeignClient(name = "calculation-service", path = "/calculation")
public interface CalculationFeignClient {

    @PostMapping("/execute")
    Result<PowerCalculation> executeCalculation(@RequestBody PowerCalculationDTO calculationDTO);

    @PostMapping("/batch/execute")
    Result<Boolean> batchExecuteCalculation(@RequestBody PowerCalculationDTO calculationDTO);
}
