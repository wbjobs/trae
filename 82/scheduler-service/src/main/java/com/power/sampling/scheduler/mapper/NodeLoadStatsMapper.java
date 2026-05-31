package com.power.sampling.scheduler.mapper;

import com.baomidou.mybatisplus.core.mapper.BaseMapper;
import com.power.sampling.common.entity.NodeLoadStats;
import org.apache.ibatis.annotations.Mapper;

@Mapper
public interface NodeLoadStatsMapper extends BaseMapper<NodeLoadStats> {
}
