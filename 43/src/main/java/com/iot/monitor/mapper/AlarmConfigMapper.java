package com.iot.monitor.mapper;

import com.baomidou.mybatisplus.core.mapper.BaseMapper;
import com.iot.monitor.entity.AlarmConfig;
import org.apache.ibatis.annotations.Mapper;
import org.apache.ibatis.annotations.Select;

import java.util.List;

@Mapper
public interface AlarmConfigMapper extends BaseMapper<AlarmConfig> {

    @Select("SELECT * FROM alarm_config WHERE device_id = #{deviceId} AND enabled = 1")
    List<AlarmConfig> selectByDeviceId(Long deviceId);
}
