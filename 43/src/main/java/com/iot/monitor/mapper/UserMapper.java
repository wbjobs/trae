package com.iot.monitor.mapper;

import com.baomidou.mybatisplus.core.mapper.BaseMapper;
import com.iot.monitor.entity.User;
import org.apache.ibatis.annotations.Mapper;

@Mapper
public interface UserMapper extends BaseMapper<User> {
}
