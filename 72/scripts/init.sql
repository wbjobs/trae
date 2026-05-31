CREATE DATABASE IF NOT EXISTS graphql_gateway;

USE graphql_gateway;

CREATE TABLE IF NOT EXISTS users (
  id INT AUTO_INCREMENT PRIMARY KEY,
  username VARCHAR(50) NOT NULL UNIQUE,
  email VARCHAR(100) NOT NULL UNIQUE,
  city VARCHAR(50) NOT NULL,
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

INSERT INTO users (username, email, city) VALUES
  ('zhangsan', 'zhangsan@example.com', '北京'),
  ('lisi', 'lisi@example.com', '上海'),
  ('wangwu', 'wangwu@example.com', '广州'),
  ('zhaoliu', 'zhaoliu@example.com', '深圳'),
  ('qianqi', 'qianqi@example.com', '杭州'),
  ('sunba', 'sunba@example.com', '成都'),
  ('zhoujiu', 'zhoujiu@example.com', '武汉'),
  ('wushi', 'wushi@example.com', '西安'),
  ('fengshiyi', 'fengshiyi@example.com', '南京'),
  ('chenshier', 'chenshier@example.com', '重庆');
