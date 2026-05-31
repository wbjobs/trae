package com.iot.monitor.mapper;

import com.baomidou.mybatisplus.core.mapper.BaseMapper;
import com.iot.monitor.entity.AlarmRecord;
import org.apache.ibatis.annotations.Mapper;

@Mapper
public interface AlarmRecordMapper extends BaseMapper<AlarmRecord> {
}
