package com.iot.monitor.mapper;

import com.baomidou.mybatisplus.core.mapper.BaseMapper;
import com.iot.monitor.entity.Device;
import org.apache.ibatis.annotations.Mapper;

@Mapper
public interface DeviceMapper extends BaseMapper<Device> {
}
