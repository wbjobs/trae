-- 分布式 API 密钥管理集群 数据库初始化脚本

CREATE DATABASE IF NOT EXISTS `api_key_cluster` DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

USE `api_key_cluster`;

-- 初始管理员密钥（首次启动后请替换）
-- 密码: admin123 (level=3 管理员权限)
INSERT INTO api_keys (id, `key`, name, `level`, status, createdAt, expiresAt, createdBy, metadata) 
VALUES (
    '00000000-0000-0000-0000-000000000001',
    'ak_admin_master_key_2024',
    '系统管理员密钥',
    3,
    1,
    NOW(),
    DATE_ADD(NOW(), INTERVAL 365 DAY),
    'system_init',
    '{"role": "super_admin", "note": "首次启动后请立即更换此密钥"}'
) ON DUPLICATE KEY UPDATE id=id;
