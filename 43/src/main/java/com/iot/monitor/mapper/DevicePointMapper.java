package com.iot.monitor.mapper;

import com.baomidou.mybatisplus.core.mapper.BaseMapper;
import com.iot.monitor.entity.DevicePoint;
import org.apache.ibatis.annotations.Mapper;
import org.apache.ibatis.annotations.Select;

import java.util.List;

@Mapper
public interface DevicePointMapper extends BaseMapper<DevicePoint> {

    @Select("SELECT * FROM device_point WHERE device_id = #{deviceId} ORDER BY sort_order")
    List<DevicePoint> selectByDeviceId(Long deviceId);
}
