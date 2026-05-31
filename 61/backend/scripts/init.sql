-- 创建数据库
CREATE DATABASE IF NOT EXISTS iot_platform DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

USE iot_platform;

-- 用户表
CREATE TABLE IF NOT EXISTS users (
  id INT PRIMARY KEY AUTO_INCREMENT,
  username VARCHAR(50) NOT NULL UNIQUE,
  password VARCHAR(255) NOT NULL,
  real_name VARCHAR(50) NOT NULL,
  email VARCHAR(100),
  phone VARCHAR(20),
  role VARCHAR(50) NOT NULL,
  factory VARCHAR(50),
  status TINYINT DEFAULT 1,
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

-- 角色表
CREATE TABLE IF NOT EXISTS roles (
  id INT PRIMARY KEY AUTO_INCREMENT,
  name VARCHAR(50) NOT NULL,
  code VARCHAR(50) NOT NULL UNIQUE,
  type VARCHAR(20) DEFAULT 'custom',
  description VARCHAR(255),
  permissions TEXT,
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

-- 设备表
CREATE TABLE IF NOT EXISTS devices (
  id INT PRIMARY KEY AUTO_INCREMENT,
  device_id VARCHAR(100) NOT NULL UNIQUE,
  device_name VARCHAR(100) NOT NULL,
  factory VARCHAR(50) NOT NULL,
  type VARCHAR(50),
  model VARCHAR(50),
  status VARCHAR(20) DEFAULT 'offline',
  temperature DECIMAL(10,2),
  pressure DECIMAL(10,2),
  runtime INT DEFAULT 0,
  last_report TIMESTAMP NULL,
  last_heartbeat TIMESTAMP NULL,
  ip_address VARCHAR(50),
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  INDEX idx_device_id (device_id),
  INDEX idx_factory (factory),
  INDEX idx_status (status)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

-- 设备日志表
CREATE TABLE IF NOT EXISTS device_logs (
  id BIGINT PRIMARY KEY AUTO_INCREMENT,
  device_id VARCHAR(100) NOT NULL,
  device_name VARCHAR(100),
  level VARCHAR(20) DEFAULT 'info',
  module VARCHAR(50),
  content TEXT,
  source VARCHAR(50),
  raw_data JSON,
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  INDEX idx_device_id (device_id),
  INDEX idx_level (level),
  INDEX idx_created_at (created_at)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

-- 离线记录表
CREATE TABLE IF NOT EXISTS offline_records (
  id BIGINT PRIMARY KEY AUTO_INCREMENT,
  device_id VARCHAR(100) NOT NULL,
  device_name VARCHAR(100),
  factory VARCHAR(50),
  offline_time TIMESTAMP NOT NULL,
  last_online_time TIMESTAMP NULL,
  offline_duration INT DEFAULT 0,
  last_heartbeat TIMESTAMP NULL,
  offline_reason VARCHAR(255),
  status VARCHAR(20) DEFAULT 'offline',
  analysis_result TEXT,
  recovered_at TIMESTAMP NULL,
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  INDEX idx_device_id (device_id),
  INDEX idx_status (status),
  INDEX idx_offline_time (offline_time)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

-- 操作审计表
CREATE TABLE IF NOT EXISTS audit_logs (
  id BIGINT PRIMARY KEY AUTO_INCREMENT,
  user_id INT,
  username VARCHAR(50),
  action VARCHAR(50) NOT NULL,
  module VARCHAR(50),
  target VARCHAR(100),
  description TEXT,
  ip VARCHAR(50),
  success TINYINT DEFAULT 1,
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  INDEX idx_username (username),
  INDEX idx_action (action),
  INDEX idx_created_at (created_at)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

-- 厂区表
CREATE TABLE IF NOT EXISTS factories (
  id INT PRIMARY KEY AUTO_INCREMENT,
  code VARCHAR(50) NOT NULL UNIQUE,
  name VARCHAR(100) NOT NULL,
  address VARCHAR(255),
  contact VARCHAR(50),
  phone VARCHAR(20),
  status TINYINT DEFAULT 1,
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

-- 插入初始数据
INSERT IGNORE INTO users (username, password, real_name, email, phone, role, factory, status) VALUES
('admin', '$2a$10$7EqJtq98hPqEX7fNZaFWoO1tKdX7G5e6b8c7a6b5a4s3d2f1e0d9c8b7a6s5d4f3e2', '超级管理员', 'admin@iot.com', '13800138000', 'admin', NULL, 1),
('manager_a', '$2a$10$7EqJtq98hPqEX7fNZaFWoO1tKdX7G5e6b8c7a6b5a4s3d2f1e0d9c8b7a6s5d4f3e2', '厂区A管理员', 'manager_a@iot.com', '13800138001', 'manager', 'factory-a', 1),
('operator_a', '$2a$10$7EqJtq98hPqEX7fNZaFWoO1tKdX7G5e6b8c7a6b5a4s3d2f1e0d9c8b7a6s5d4f3e2', '厂区A操作员', 'operator_a@iot.com', '13800138002', 'operator', 'factory-a', 1);

INSERT IGNORE INTO roles (name, code, type, description, permissions) VALUES
('超级管理员', 'admin', 'primary', '拥有系统所有权限', '["*"]'),
('管理员', 'manager', 'success', '拥有厂区管理权限', '["device:view","device:control","log:view","user:view"]'),
('操作员', 'operator', 'primary', '拥有设备操作权限', '["device:view","device:control"]'),
('查看员', 'viewer', 'info', '仅拥有查看权限', '["device:view"]');

INSERT IGNORE INTO factories (code, name, address, contact, phone) VALUES
('factory-a', '厂区A', '北京市朝阳区xxx路xxx号', '张经理', '13800138001'),
('factory-b', '厂区B', '上海市浦东新区xxx路xxx号', '李经理', '13800138002'),
('factory-c', '厂区C', '广州市天河区xxx路xxx号', '王经理', '13800138003');

INSERT IGNORE INTO devices (device_id, device_name, factory, type, model, status, temperature, pressure, ip_address) VALUES
('DEV-A-001', 'CNC加工中心-A01', 'factory-a', 'cnc', 'DMG-MORI-5X', 'online', 45.5, 0.85, '192.168.1.101'),
('DEV-A-002', '工业机器人-A02', 'factory-a', 'robot', 'FANUC-R2000', 'online', 38.2, 0.72, '192.168.1.102'),
('DEV-A-003', 'AGV小车-A03', 'factory-a', 'agv', 'MiR-200', 'offline', 0, 0, '192.168.1.103'),
('DEV-B-001', '注塑机-B01', 'factory-b', 'injection', 'HAITIAN-MA1600', 'online', 220.5, 1.25, '192.168.2.101'),
('DEV-B-002', '冲压机-B02', 'factory-b', 'press', 'SCHULER-HSP', 'warning', 65.8, 0.95, '192.168.2.102'),
('DEV-C-001', '焊接机器人-C01', 'factory-c', 'welding', 'KUKA-KR16', 'online', 85.3, 0.68, '192.168.3.101');
