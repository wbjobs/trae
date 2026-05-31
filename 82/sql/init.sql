-- ======================================
-- 分布式功耗采样 API 集群 数据库初始化脚本
-- ======================================

-- 1. 创建权限鉴权数据库
CREATE DATABASE IF NOT EXISTS `power_auth` DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;
USE `power_auth`;

DROP TABLE IF EXISTS `t_sys_user`;
CREATE TABLE `t_sys_user` (
  `id` bigint(20) NOT NULL AUTO_INCREMENT,
  `username` varchar(50) NOT NULL COMMENT '用户名',
  `password` varchar(100) NOT NULL COMMENT '密码',
  `salt` varchar(50) NOT NULL COMMENT '盐值',
  `real_name` varchar(50) DEFAULT NULL COMMENT '真实姓名',
  `phone` varchar(20) DEFAULT NULL COMMENT '手机号',
  `email` varchar(100) DEFAULT NULL COMMENT '邮箱',
  `status` tinyint(1) DEFAULT 1 COMMENT '状态 0禁用 1启用',
  `role` varchar(20) DEFAULT 'user' COMMENT '角色',
  `create_time` datetime DEFAULT NULL COMMENT '创建时间',
  `update_time` datetime DEFAULT NULL COMMENT '更新时间',
  PRIMARY KEY (`id`),
  UNIQUE KEY `uk_username` (`username`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COMMENT='系统用户表';

INSERT INTO `t_sys_user` (`username`, `password`, `salt`, `real_name`, `status`, `role`, `create_time`) VALUES
('admin', 'e10adc3949ba59abbe56e057f20f883e', 'abc123', '系统管理员', 1, 'admin', NOW());

-- 2. 创建设备接入数据库
CREATE DATABASE IF NOT EXISTS `power_device` DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;
USE `power_device`;

DROP TABLE IF EXISTS `t_device`;
CREATE TABLE `t_device` (
  `id` bigint(20) NOT NULL AUTO_INCREMENT,
  `device_code` varchar(50) NOT NULL COMMENT '设备编码',
  `device_name` varchar(100) DEFAULT NULL COMMENT '设备名称',
  `device_type` varchar(50) DEFAULT NULL COMMENT '设备类型',
  `location` varchar(200) DEFAULT NULL COMMENT '位置',
  `ip_address` varchar(50) DEFAULT NULL COMMENT 'IP地址',
  `status` tinyint(1) DEFAULT 0 COMMENT '状态 0离线 1在线 2异常',
  `room_id` int(11) DEFAULT NULL COMMENT '机房ID',
  `rack_id` int(11) DEFAULT NULL COMMENT '机架ID',
  `edge_node` varchar(50) DEFAULT NULL COMMENT '边缘节点',
  `last_heartbeat` datetime DEFAULT NULL COMMENT '最后心跳时间',
  `create_time` datetime DEFAULT NULL COMMENT '创建时间',
  `update_time` datetime DEFAULT NULL COMMENT '更新时间',
  `remark` varchar(500) DEFAULT NULL COMMENT '备注',
  PRIMARY KEY (`id`),
  UNIQUE KEY `uk_device_code` (`device_code`),
  KEY `idx_status` (`status`),
  KEY `idx_edge_node` (`edge_node`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COMMENT='设备表';

DROP TABLE IF EXISTS `t_device_abnormal`;
CREATE TABLE `t_device_abnormal` (
  `id` bigint(20) NOT NULL AUTO_INCREMENT,
  `device_id` bigint(20) NOT NULL COMMENT '设备ID',
  `device_code` varchar(50) DEFAULT NULL COMMENT '设备编码',
  `abnormal_type` int(11) DEFAULT NULL COMMENT '异常类型',
  `abnormal_message` varchar(500) DEFAULT NULL COMMENT '异常信息',
  `severity` int(11) DEFAULT 1 COMMENT '严重程度 1低 2中 3高',
  `status` tinyint(1) DEFAULT 0 COMMENT '状态 0未处理 1已处理',
  `report_time` datetime DEFAULT NULL COMMENT '上报时间',
  `handle_time` datetime DEFAULT NULL COMMENT '处理时间',
  `handler` varchar(50) DEFAULT NULL COMMENT '处理人',
  `handle_remark` varchar(500) DEFAULT NULL COMMENT '处理备注',
  `create_time` datetime DEFAULT NULL COMMENT '创建时间',
  PRIMARY KEY (`id`),
  KEY `idx_device_id` (`device_id`),
  KEY `idx_status` (`status`),
  KEY `idx_report_time` (`report_time`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COMMENT='设备异常表';

INSERT INTO `t_device` (`device_code`, `device_name`, `device_type`, `location`, `status`, `create_time`, `update_time`) VALUES
('DEV001', '服务器A', 'server', 'A机房-1排-1机架', 1, NOW(), NOW()),
('DEV002', '服务器B', 'server', 'A机房-1排-2机架', 1, NOW(), NOW()),
('DEV003', '服务器C', 'server', 'A机房-2排-1机架', 0, NOW(), NOW()),
('DEV004', '交换机A', 'switch', 'A机房-1排-3机架', 1, NOW(), NOW()),
('DEV005', '交换机B', 'switch', 'B机房-1排-1机架', 1, NOW(), NOW());

DROP TABLE IF EXISTS `t_device_threshold`;
CREATE TABLE `t_device_threshold` (
  `id` bigint(20) NOT NULL AUTO_INCREMENT,
  `device_id` bigint(20) NOT NULL COMMENT '设备ID',
  `device_code` varchar(50) DEFAULT NULL COMMENT '设备编码',
  `voltage_max` decimal(10,2) DEFAULT NULL COMMENT '电压上限(V)',
  `voltage_min` decimal(10,2) DEFAULT NULL COMMENT '电压下限(V)',
  `current_max` decimal(10,2) DEFAULT NULL COMMENT '电流上限(A)',
  `current_min` decimal(10,2) DEFAULT NULL COMMENT '电流下限(A)',
  `power_max` decimal(12,2) DEFAULT NULL COMMENT '功率上限(W)',
  `power_min` decimal(12,2) DEFAULT NULL COMMENT '功率下限(W)',
  `temperature_max` decimal(10,2) DEFAULT NULL COMMENT '温度上限(°C)',
  `enable_status` tinyint(1) DEFAULT 1 COMMENT '启用状态 0禁用 1启用',
  `alert_level` tinyint(1) DEFAULT 1 COMMENT '告警等级 1低 2中 3高',
  `create_time` datetime DEFAULT NULL COMMENT '创建时间',
  `update_time` datetime DEFAULT NULL COMMENT '更新时间',
  PRIMARY KEY (`id`),
  KEY `idx_device_id` (`device_id`),
  KEY `idx_enable_status` (`enable_status`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COMMENT='设备阈值配置表';

DROP TABLE IF EXISTS `t_device_alert`;
CREATE TABLE `t_device_alert` (
  `id` bigint(20) NOT NULL AUTO_INCREMENT,
  `device_id` bigint(20) NOT NULL COMMENT '设备ID',
  `device_code` varchar(50) DEFAULT NULL COMMENT '设备编码',
  `alert_type` int(11) DEFAULT NULL COMMENT '告警类型 1电压 2电流 3功率 4温度',
  `alert_level` tinyint(1) DEFAULT 1 COMMENT '告警等级 1低 2中 3高',
  `alert_message` varchar(500) DEFAULT NULL COMMENT '告警信息',
  `threshold_value` decimal(12,2) DEFAULT NULL COMMENT '阈值',
  `actual_value` decimal(12,2) DEFAULT NULL COMMENT '实际值',
  `status` tinyint(1) DEFAULT 0 COMMENT '状态 0未处理 1已处理',
  `alert_time` datetime DEFAULT NULL COMMENT '告警时间',
  `resolve_time` datetime DEFAULT NULL COMMENT '处理时间',
  `resolver` varchar(50) DEFAULT NULL COMMENT '处理人',
  `resolve_remark` varchar(500) DEFAULT NULL COMMENT '处理备注',
  `create_time` datetime DEFAULT NULL COMMENT '创建时间',
  PRIMARY KEY (`id`),
  KEY `idx_device_id` (`device_id`),
  KEY `idx_status` (`status`),
  KEY `idx_alert_time` (`alert_time`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COMMENT='设备告警表';

DROP TABLE IF EXISTS `t_api_request_log`;
CREATE TABLE `t_api_request_log` (
  `id` bigint(20) NOT NULL AUTO_INCREMENT,
  `trace_id` varchar(64) DEFAULT NULL COMMENT '链路追踪ID',
  `service_name` varchar(100) DEFAULT NULL COMMENT '服务名称',
  `request_method` varchar(10) DEFAULT NULL COMMENT '请求方法',
  `request_path` varchar(500) DEFAULT NULL COMMENT '请求路径',
  `request_params` text DEFAULT NULL COMMENT '请求参数',
  `request_body` text DEFAULT NULL COMMENT '请求体',
  `request_ip` varchar(50) DEFAULT NULL COMMENT '请求IP',
  `user_agent` varchar(500) DEFAULT NULL COMMENT '用户代理',
  `user_id` varchar(64) DEFAULT NULL COMMENT '用户ID',
  `username` varchar(50) DEFAULT NULL COMMENT '用户名',
  `response_status` int(11) DEFAULT NULL COMMENT '响应状态码',
  `response_body` text DEFAULT NULL COMMENT '响应体',
  `cost_time` bigint(20) DEFAULT NULL COMMENT '耗时(ms)',
  `log_level` tinyint(1) DEFAULT 1 COMMENT '日志级别 1DEBUG 2WARN 3ERROR',
  `error_message` text DEFAULT NULL COMMENT '错误信息',
  `create_time` datetime DEFAULT NULL COMMENT '创建时间',
  PRIMARY KEY (`id`),
  KEY `idx_trace_id` (`trace_id`),
  KEY `idx_service_name` (`service_name`),
  KEY `idx_log_level` (`log_level`),
  KEY `idx_create_time` (`create_time`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COMMENT='API请求日志表';

-- 3. 创建采样数据库0（分库分表）
CREATE DATABASE IF NOT EXISTS `power_sampling_0` DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;
USE `power_sampling_0`;

DROP TABLE IF EXISTS `t_power_sampling_0`;
CREATE TABLE `t_power_sampling_0` (
  `id` bigint(20) NOT NULL,
  `device_id` bigint(20) NOT NULL COMMENT '设备ID',
  `device_code` varchar(50) DEFAULT NULL COMMENT '设备编码',
  `voltage` decimal(10,2) DEFAULT NULL COMMENT '电压(V)',
  `current` decimal(10,2) DEFAULT NULL COMMENT '电流(A)',
  `power` decimal(12,2) DEFAULT NULL COMMENT '功率(W)',
  `power_factor` decimal(5,4) DEFAULT NULL COMMENT '功率因数',
  `frequency` decimal(10,4) DEFAULT NULL COMMENT '频率(Hz)',
  `sampling_time` datetime NOT NULL COMMENT '采样时间',
  `edge_node_id` int(11) DEFAULT NULL COMMENT '边缘节点ID',
  `sampling_status` tinyint(1) DEFAULT 1 COMMENT '采样状态 0失败 1成功',
  `create_time` datetime DEFAULT NULL COMMENT '创建时间',
  PRIMARY KEY (`id`),
  KEY `idx_device_id` (`device_id`),
  KEY `idx_sampling_time` (`sampling_time`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COMMENT='功耗采样表0';

DROP TABLE IF EXISTS `t_power_sampling_1`;
CREATE TABLE `t_power_sampling_1` (
  `id` bigint(20) NOT NULL,
  `device_id` bigint(20) NOT NULL COMMENT '设备ID',
  `device_code` varchar(50) DEFAULT NULL COMMENT '设备编码',
  `voltage` decimal(10,2) DEFAULT NULL COMMENT '电压(V)',
  `current` decimal(10,2) DEFAULT NULL COMMENT '电流(A)',
  `power` decimal(12,2) DEFAULT NULL COMMENT '功率(W)',
  `power_factor` decimal(5,4) DEFAULT NULL COMMENT '功率因数',
  `frequency` decimal(10,4) DEFAULT NULL COMMENT '频率(Hz)',
  `sampling_time` datetime NOT NULL COMMENT '采样时间',
  `edge_node_id` int(11) DEFAULT NULL COMMENT '边缘节点ID',
  `sampling_status` tinyint(1) DEFAULT 1 COMMENT '采样状态 0失败 1成功',
  `create_time` datetime DEFAULT NULL COMMENT '创建时间',
  PRIMARY KEY (`id`),
  KEY `idx_device_id` (`device_id`),
  KEY `idx_sampling_time` (`sampling_time`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COMMENT='功耗采样表1';

DROP TABLE IF EXISTS `t_power_sampling_2`;
CREATE TABLE `t_power_sampling_2` (
  `id` bigint(20) NOT NULL,
  `device_id` bigint(20) NOT NULL COMMENT '设备ID',
  `device_code` varchar(50) DEFAULT NULL COMMENT '设备编码',
  `voltage` decimal(10,2) DEFAULT NULL COMMENT '电压(V)',
  `current` decimal(10,2) DEFAULT NULL COMMENT '电流(A)',
  `power` decimal(12,2) DEFAULT NULL COMMENT '功率(W)',
  `power_factor` decimal(5,4) DEFAULT NULL COMMENT '功率因数',
  `frequency` decimal(10,4) DEFAULT NULL COMMENT '频率(Hz)',
  `sampling_time` datetime NOT NULL COMMENT '采样时间',
  `edge_node_id` int(11) DEFAULT NULL COMMENT '边缘节点ID',
  `sampling_status` tinyint(1) DEFAULT 1 COMMENT '采样状态 0失败 1成功',
  `create_time` datetime DEFAULT NULL COMMENT '创建时间',
  PRIMARY KEY (`id`),
  KEY `idx_device_id` (`device_id`),
  KEY `idx_sampling_time` (`sampling_time`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COMMENT='功耗采样表2';

DROP TABLE IF EXISTS `t_power_sampling_3`;
CREATE TABLE `t_power_sampling_3` (
  `id` bigint(20) NOT NULL,
  `device_id` bigint(20) NOT NULL COMMENT '设备ID',
  `device_code` varchar(50) DEFAULT NULL COMMENT '设备编码',
  `voltage` decimal(10,2) DEFAULT NULL COMMENT '电压(V)',
  `current` decimal(10,2) DEFAULT NULL COMMENT '电流(A)',
  `power` decimal(12,2) DEFAULT NULL COMMENT '功率(W)',
  `power_factor` decimal(5,4) DEFAULT NULL COMMENT '功率因数',
  `frequency` decimal(10,4) DEFAULT NULL COMMENT '频率(Hz)',
  `sampling_time` datetime NOT NULL COMMENT '采样时间',
  `edge_node_id` int(11) DEFAULT NULL COMMENT '边缘节点ID',
  `sampling_status` tinyint(1) DEFAULT 1 COMMENT '采样状态 0失败 1成功',
  `create_time` datetime DEFAULT NULL COMMENT '创建时间',
  PRIMARY KEY (`id`),
  KEY `idx_device_id` (`device_id`),
  KEY `idx_sampling_time` (`sampling_time`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COMMENT='功耗采样表3';

-- 4. 创建采样数据库1（分库分表）
CREATE DATABASE IF NOT EXISTS `power_sampling_1` DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;
USE `power_sampling_1`;

DROP TABLE IF EXISTS `t_power_sampling_0`;
CREATE TABLE `t_power_sampling_0` (
  `id` bigint(20) NOT NULL,
  `device_id` bigint(20) NOT NULL COMMENT '设备ID',
  `device_code` varchar(50) DEFAULT NULL COMMENT '设备编码',
  `voltage` decimal(10,2) DEFAULT NULL COMMENT '电压(V)',
  `current` decimal(10,2) DEFAULT NULL COMMENT '电流(A)',
  `power` decimal(12,2) DEFAULT NULL COMMENT '功率(W)',
  `power_factor` decimal(5,4) DEFAULT NULL COMMENT '功率因数',
  `frequency` decimal(10,4) DEFAULT NULL COMMENT '频率(Hz)',
  `sampling_time` datetime NOT NULL COMMENT '采样时间',
  `edge_node_id` int(11) DEFAULT NULL COMMENT '边缘节点ID',
  `sampling_status` tinyint(1) DEFAULT 1 COMMENT '采样状态 0失败 1成功',
  `create_time` datetime DEFAULT NULL COMMENT '创建时间',
  PRIMARY KEY (`id`),
  KEY `idx_device_id` (`device_id`),
  KEY `idx_sampling_time` (`sampling_time`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COMMENT='功耗采样表0';

DROP TABLE IF EXISTS `t_power_sampling_1`;
CREATE TABLE `t_power_sampling_1` (
  `id` bigint(20) NOT NULL,
  `device_id` bigint(20) NOT NULL COMMENT '设备ID',
  `device_code` varchar(50) DEFAULT NULL COMMENT '设备编码',
  `voltage` decimal(10,2) DEFAULT NULL COMMENT '电压(V)',
  `current` decimal(10,2) DEFAULT NULL COMMENT '电流(A)',
  `power` decimal(12,2) DEFAULT NULL COMMENT '功率(W)',
  `power_factor` decimal(5,4) DEFAULT NULL COMMENT '功率因数',
  `frequency` decimal(10,4) DEFAULT NULL COMMENT '频率(Hz)',
  `sampling_time` datetime NOT NULL COMMENT '采样时间',
  `edge_node_id` int(11) DEFAULT NULL COMMENT '边缘节点ID',
  `sampling_status` tinyint(1) DEFAULT 1 COMMENT '采样状态 0失败 1成功',
  `create_time` datetime DEFAULT NULL COMMENT '创建时间',
  PRIMARY KEY (`id`),
  KEY `idx_device_id` (`device_id`),
  KEY `idx_sampling_time` (`sampling_time`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COMMENT='功耗采样表1';

DROP TABLE IF EXISTS `t_power_sampling_2`;
CREATE TABLE `t_power_sampling_2` (
  `id` bigint(20) NOT NULL,
  `device_id` bigint(20) NOT NULL COMMENT '设备ID',
  `device_code` varchar(50) DEFAULT NULL COMMENT '设备编码',
  `voltage` decimal(10,2) DEFAULT NULL COMMENT '电压(V)',
  `current` decimal(10,2) DEFAULT NULL COMMENT '电流(A)',
  `power` decimal(12,2) DEFAULT NULL COMMENT '功率(W)',
  `power_factor` decimal(5,4) DEFAULT NULL COMMENT '功率因数',
  `frequency` decimal(10,4) DEFAULT NULL COMMENT '频率(Hz)',
  `sampling_time` datetime NOT NULL COMMENT '采样时间',
  `edge_node_id` int(11) DEFAULT NULL COMMENT '边缘节点ID',
  `sampling_status` tinyint(1) DEFAULT 1 COMMENT '采样状态 0失败 1成功',
  `create_time` datetime DEFAULT NULL COMMENT '创建时间',
  PRIMARY KEY (`id`),
  KEY `idx_device_id` (`device_id`),
  KEY `idx_sampling_time` (`sampling_time`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COMMENT='功耗采样表2';

DROP TABLE IF EXISTS `t_power_sampling_3`;
CREATE TABLE `t_power_sampling_3` (
  `id` bigint(20) NOT NULL,
  `device_id` bigint(20) NOT NULL COMMENT '设备ID',
  `device_code` varchar(50) DEFAULT NULL COMMENT '设备编码',
  `voltage` decimal(10,2) DEFAULT NULL COMMENT '电压(V)',
  `current` decimal(10,2) DEFAULT NULL COMMENT '电流(A)',
  `power` decimal(12,2) DEFAULT NULL COMMENT '功率(W)',
  `power_factor` decimal(5,4) DEFAULT NULL COMMENT '功率因数',
  `frequency` decimal(10,4) DEFAULT NULL COMMENT '频率(Hz)',
  `sampling_time` datetime NOT NULL COMMENT '采样时间',
  `edge_node_id` int(11) DEFAULT NULL COMMENT '边缘节点ID',
  `sampling_status` tinyint(1) DEFAULT 1 COMMENT '采样状态 0失败 1成功',
  `create_time` datetime DEFAULT NULL COMMENT '创建时间',
  PRIMARY KEY (`id`),
  KEY `idx_device_id` (`device_id`),
  KEY `idx_sampling_time` (`sampling_time`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COMMENT='功耗采样表3';

-- 5. 创建功耗运算数据库
CREATE DATABASE IF NOT EXISTS `power_calculation` DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;
USE `power_calculation`;

DROP TABLE IF EXISTS `t_power_calculation`;
CREATE TABLE `t_power_calculation` (
  `id` bigint(20) NOT NULL AUTO_INCREMENT,
  `device_id` bigint(20) NOT NULL COMMENT '设备ID',
  `device_code` varchar(50) DEFAULT NULL COMMENT '设备编码',
  `calculation_type` int(11) DEFAULT 1 COMMENT '运算类型 1小时 2日 3月',
  `avg_power` decimal(12,2) DEFAULT NULL COMMENT '平均功率(W)',
  `max_power` decimal(12,2) DEFAULT NULL COMMENT '最大功率(W)',
  `min_power` decimal(12,2) DEFAULT NULL COMMENT '最小功率(W)',
  `total_energy` decimal(15,4) DEFAULT NULL COMMENT '总能耗(kWh)',
  `start_time` datetime DEFAULT NULL COMMENT '开始时间',
  `end_time` datetime DEFAULT NULL COMMENT '结束时间',
  `create_time` datetime DEFAULT NULL COMMENT '创建时间',
  PRIMARY KEY (`id`),
  KEY `idx_device_id` (`device_id`),
  KEY `idx_calculation_type` (`calculation_type`),
  KEY `idx_start_time` (`start_time`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COMMENT='功耗运算表';

-- 6. 创建调度数据库
CREATE DATABASE IF NOT EXISTS `power_scheduler` DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;
USE `power_scheduler`;

DROP TABLE IF EXISTS `t_edge_node`;
CREATE TABLE `t_edge_node` (
  `id` bigint(20) NOT NULL AUTO_INCREMENT,
  `node_code` varchar(50) NOT NULL COMMENT '节点编码',
  `node_name` varchar(100) DEFAULT NULL COMMENT '节点名称',
  `node_ip` varchar(50) DEFAULT NULL COMMENT '节点IP',
  `node_port` int(11) DEFAULT NULL COMMENT '节点端口',
  `data_center` varchar(50) DEFAULT NULL COMMENT '数据中心',
  `room` varchar(50) DEFAULT NULL COMMENT '机房',
  `status` tinyint(1) DEFAULT 0 COMMENT '状态 0离线 1在线',
  `load_level` tinyint(1) DEFAULT 1 COMMENT '负载等级 1-4',
  `max_devices` int(11) DEFAULT 100 COMMENT '最大设备数',
  `current_devices` int(11) DEFAULT 0 COMMENT '当前设备数',
  `last_heartbeat` datetime DEFAULT NULL COMMENT '最后心跳时间',
  `create_time` datetime DEFAULT NULL COMMENT '创建时间',
  `update_time` datetime DEFAULT NULL COMMENT '更新时间',
  PRIMARY KEY (`id`),
  UNIQUE KEY `uk_node_code` (`node_code`),
  KEY `idx_status` (`status`),
  KEY `idx_data_center` (`data_center`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COMMENT='边缘节点表';

INSERT INTO `t_edge_node` (`node_code`, `node_name`, `node_ip`, `node_port`, `data_center`, `room`, `status`, `max_devices`, `create_time`, `update_time`) VALUES
('EDGE001', '边缘节点A', '192.168.1.101', 8090, 'DC1', 'A机房', 1, 100, NOW(), NOW()),
('EDGE002', '边缘节点B', '192.168.1.102', 8091, 'DC1', 'B机房', 1, 100, NOW(), NOW()),
('EDGE003', '边缘节点C', '192.168.2.101', 8090, 'DC2', 'C机房', 0, 100, NOW(), NOW());

DROP TABLE IF EXISTS `t_node_load_stats`;
CREATE TABLE `t_node_load_stats` (
  `id` bigint(20) NOT NULL AUTO_INCREMENT,
  `node_id` bigint(20) NOT NULL COMMENT '节点ID',
  `node_code` varchar(50) DEFAULT NULL COMMENT '节点编码',
  `cpu_usage` decimal(10,2) DEFAULT NULL COMMENT 'CPU使用率(%)',
  `memory_usage` decimal(10,2) DEFAULT NULL COMMENT '内存使用率(%)',
  `disk_usage` decimal(10,2) DEFAULT NULL COMMENT '磁盘使用率(%)',
  `network_in` decimal(12,2) DEFAULT NULL COMMENT '网络入流量(Mbps)',
  `network_out` decimal(12,2) DEFAULT NULL COMMENT '网络出流量(Mbps)',
  `connection_count` int(11) DEFAULT NULL COMMENT '连接数',
  `request_count` int(11) DEFAULT NULL COMMENT '请求数',
  `error_count` int(11) DEFAULT NULL COMMENT '错误数',
  `avg_response_time` decimal(10,2) DEFAULT NULL COMMENT '平均响应时间(ms)',
  `device_count` int(11) DEFAULT NULL COMMENT '设备数',
  `sampling_count` int(11) DEFAULT NULL COMMENT '采样数',
  `load_score` decimal(10,2) DEFAULT NULL COMMENT '负载得分(0-100)',
  `stats_time` datetime DEFAULT NULL COMMENT '统计时间',
  `create_time` datetime DEFAULT NULL COMMENT '创建时间',
  PRIMARY KEY (`id`),
  KEY `idx_node_id` (`node_id`),
  KEY `idx_node_code` (`node_code`),
  KEY `idx_stats_time` (`stats_time`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COMMENT='节点负载统计表';
