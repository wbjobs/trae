package com.power.sampling.sampling.mapper;

import com.baomidou.mybatisplus.core.mapper.BaseMapper;
import com.baomidou.mybatisplus.core.metadata.IPage;
import com.baomidou.mybatisplus.extension.plugins.pagination.Page;
import com.power.sampling.common.dto.BatchSamplingQueryDTO;
import com.power.sampling.common.entity.PowerSampling;
import org.apache.ibatis.annotations.Mapper;
import org.apache.ibatis.annotations.Param;

import java.util.List;

@Mapper
public interface PowerSamplingMapper extends BaseMapper<PowerSampling> {

    List<PowerSampling> batchQuerySampling(@Param("queryDTO") BatchSamplingQueryDTO queryDTO);

    IPage<PowerSampling> selectPageByCondition(Page<PowerSampling> page, @Param("queryDTO") BatchSamplingQueryDTO queryDTO);
}
