CREATE DATABASE IF NOT EXISTS device_monitor DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

USE device_monitor;

CREATE TABLE IF NOT EXISTS device (
    id BIGINT AUTO_INCREMENT PRIMARY KEY,
    device_code VARCHAR(64) NOT NULL UNIQUE COMMENT '设备编码',
    device_name VARCHAR(128) NOT NULL COMMENT '设备名称',
    protocol_type VARCHAR(32) NOT NULL DEFAULT 'MODBUS' COMMENT '协议类型',
    connection_type VARCHAR(16) NOT NULL DEFAULT 'TCP' COMMENT '连接方式: TCP/RTU',
    host VARCHAR(64) COMMENT 'TCP主机地址',
    port INT COMMENT 'TCP端口',
    serial_port VARCHAR(32) COMMENT 'RTU串口',
    baud_rate INT DEFAULT 9600 COMMENT '波特率',
    slave_id INT NOT NULL DEFAULT 1 COMMENT '从站地址',
    collect_interval INT DEFAULT 5000 COMMENT '采集间隔(ms)',
    status TINYINT DEFAULT 1 COMMENT '状态: 0-禁用, 1-启用',
    last_online_time DATETIME COMMENT '最后在线时间',
    create_time DATETIME DEFAULT CURRENT_TIMESTAMP,
    update_time DATETIME DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
    INDEX idx_device_code (device_code),
    INDEX idx_status (status)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COMMENT='设备表';

CREATE TABLE IF NOT EXISTS device_point (
    id BIGINT AUTO_INCREMENT PRIMARY KEY,
    device_id BIGINT NOT NULL COMMENT '设备ID',
    point_code VARCHAR(64) NOT NULL COMMENT '点位编码',
    point_name VARCHAR(128) NOT NULL COMMENT '点位名称',
    data_type VARCHAR(32) NOT NULL DEFAULT 'INT16' COMMENT '数据类型',
    register_address INT NOT NULL COMMENT '寄存器地址',
    register_count INT NOT NULL DEFAULT 1 COMMENT '寄存器数量',
    unit VARCHAR(32) COMMENT '单位',
    scale DECIMAL(10,4) DEFAULT 1.0 COMMENT '缩放系数',
    offset DECIMAL(10,4) DEFAULT 0.0 COMMENT '偏移量',
    sort_order INT DEFAULT 0 COMMENT '排序',
    create_time DATETIME DEFAULT CURRENT_TIMESTAMP,
    INDEX idx_device_id (device_id)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COMMENT='设备点位表';

CREATE TABLE IF NOT EXISTS sys_user (
    id BIGINT AUTO_INCREMENT PRIMARY KEY,
    username VARCHAR(64) NOT NULL UNIQUE,
    password VARCHAR(128) NOT NULL,
    email VARCHAR(128),
    phone VARCHAR(32),
    wechat VARCHAR(64),
    status TINYINT DEFAULT 1,
    create_time DATETIME DEFAULT CURRENT_TIMESTAMP,
    update_time DATETIME DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COMMENT='用户表';

CREATE TABLE IF NOT EXISTS alarm_config (
    id BIGINT AUTO_INCREMENT PRIMARY KEY,
    device_id BIGINT NOT NULL COMMENT '设备ID',
    point_id BIGINT COMMENT '点位ID',
    alarm_type VARCHAR(32) NOT NULL COMMENT '告警类型: THRESHOLD-阈值, OFFLINE-离线',
    threshold_min DECIMAL(18,4) COMMENT '最小值阈值',
    threshold_max DECIMAL(18,4) COMMENT '最大值阈值',
    alarm_level VARCHAR(8) DEFAULT 'P3' COMMENT '告警级别: P0-紧急, P1-高危, P2-中危, P3-低危',
    auto_escalate TINYINT DEFAULT 0 COMMENT '是否自动升级: 0-否, 1-是',
    escalate_after_minutes INT DEFAULT 30 COMMENT '自动升级时间(分钟)',
    notify_type VARCHAR(64) DEFAULT 'WECHAT' COMMENT '通知方式: EMAIL,WECHAT',
    enabled TINYINT DEFAULT 1 COMMENT '是否启用',
    create_time DATETIME DEFAULT CURRENT_TIMESTAMP,
    update_time DATETIME DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
    INDEX idx_device_id (device_id)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COMMENT='告警配置表';

CREATE TABLE IF NOT EXISTS alarm_record (
    id BIGINT AUTO_INCREMENT PRIMARY KEY,
    device_id BIGINT NOT NULL,
    point_id BIGINT,
    alarm_type VARCHAR(32) NOT NULL,
    alarm_content VARCHAR(1024) NOT NULL,
    alarm_level VARCHAR(8) DEFAULT 'P3' COMMENT '告警级别: P0-P3',
    alarm_count INT DEFAULT 1 COMMENT '告警触发次数(聚合)',
    first_alarm_time DATETIME NOT NULL COMMENT '首次告警时间',
    last_alarm_time DATETIME NOT NULL COMMENT '最后告警时间',
    status TINYINT DEFAULT 1 COMMENT '状态: 0-恢复, 1-告警中, 2-已确认',
    recover_time DATETIME,
    create_time DATETIME DEFAULT CURRENT_TIMESTAMP,
    update_time DATETIME DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
    INDEX idx_device_id (device_id),
    INDEX idx_alarm_time (first_alarm_time),
    INDEX idx_status (status),
    INDEX idx_level (alarm_level)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COMMENT='告警记录表';

INSERT INTO sys_user (username, password, email, phone) VALUES
('admin', 'admin123', 'admin@example.com', '13800138000');

INSERT INTO device (device_code, device_name, protocol_type, connection_type, host, port, slave_id, status) VALUES
('Pump001', '1号水泵', 'MODBUS', 'TCP', '192.168.1.101', 502, 1, 1),
('Compressor001', '1号压缩机', 'MODBUS', 'TCP', '192.168.1.102', 502, 1, 1);

INSERT INTO device_point (device_id, point_code, point_name, data_type, register_address, register_count, unit, scale) VALUES
(1, 'temperature', '温度', 'FLOAT32', 0, 2, '°C', 1.0),
(1, 'pressure', '压力', 'FLOAT32', 2, 2, 'MPa', 1.0),
(1, 'speed', '转速', 'INT32', 4, 2, 'rpm', 1.0),
(2, 'temperature', '温度', 'FLOAT32', 0, 2, '°C', 1.0),
(2, 'pressure', '压力', 'FLOAT32', 2, 2, 'MPa', 1.0),
(2, 'speed', '转速', 'INT32', 4, 2, 'rpm', 1.0);

INSERT INTO alarm_config (device_id, point_id, alarm_type, threshold_min, threshold_max, alarm_level, auto_escalate, escalate_after_minutes, notify_type, enabled) VALUES
(1, 1, 'THRESHOLD', NULL, 80.0, 'P2', 1, 30, 'EMAIL,WECHAT', 1),
(1, 2, 'THRESHOLD', NULL, 1.6, 'P1', 1, 15, 'EMAIL,WECHAT', 1),
(1, NULL, 'OFFLINE', NULL, NULL, 'P1', 1, 10, 'EMAIL,WECHAT', 1),
(2, 4, 'THRESHOLD', NULL, 85.0, 'P2', 1, 30, 'WECHAT', 1),
(2, NULL, 'OFFLINE', NULL, NULL, 'P2', 1, 15, 'WECHAT', 1);
