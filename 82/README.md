# 分布式功耗采样 API 集群

## 项目架构

基于 Spring Cloud 微服务架构搭建的分布式功耗采样 API 集群，包含五大独立服务模块：

```
┌─────────────────────────────────────────────────────────────────┐
│                     API Gateway (8080)                           │
│               ┌──────────────────────────────┐                    │
│               │  Sentinel 限流熔断 + JWT鉴权  │                    │
│               └──────────────────────────────┘                    │
└─────────────────────────────────────────────────────────────────┘
                                │
    ┌───────────┬───────────┬───────────┬───────────┬───────────┐
    │           │           │           │           │           │
┌───────┐   ┌───────┐   ┌───────┐   ┌───────┐   ┌───────┐
│ Auth  │   │Device │   │Sampling│   │Calcul.│   │Scheduler│
│(8081) │   │(8082) │   │(8083) │   │(8084) │   │(8085) │
└───────┘   └───────┘   └───────┘   └───────┘   └───────┘
                                │
                        ┌───────────────┐
                        │   Eureka      │
                        │ 集群(8761/8762)│
                        └───────────────┘
```

## 服务模块说明

| 服务名称 | 端口 | 功能说明 | 数据库 |
|---------|------|---------|--------|
| eureka-server | 8761/8762 | 服务注册中心，支持双机房跨机房部署 | - |
| gateway | 8080 | API网关，统一入口、限流熔断、权限校验 | - |
| auth-service | 8081 | 权限鉴权服务，JWT Token生成与校验 | power_auth |
| device-service | 8082 | 设备接入服务，设备管理、心跳、异常上报 | power_device |
| sampling-service | 8083 | 数据采样服务，分库分表存储采样数据 | power_sampling_0/1 |
| calculation-service | 8084 | 功耗运算服务，统计分析功耗数据 | power_calculation |
| scheduler-service | 8085 | 边缘节点调度服务，定时采样任务调度 | power_scheduler |

## 核心功能

### 1. 设备接入
- 设备注册、更新、删除
- 设备心跳保活
- 设备状态监控
- 设备异常上报接口

### 2. 数据采样
- 单设备功耗采样数据上报
- 批量设备功耗采样数据上报
- 批量设备功耗数据拉取查询
- 分库分表存储（2库4表，按device_id取模）

### 3. 功耗运算
- 单设备功耗统计（平均/最大/最小功率）
- 批量设备功耗统计
- 能耗计算
- 按时段统计分析

### 4. 权限鉴权
- JWT Token 认证
- 用户登录/注册
- Token 校验与刷新
- 网关统一鉴权

### 5. 边缘节点调度
- 边缘节点管理
- 负载感知的节点分配
- 定时采样任务调度
- 手动触发采样任务

### 6. 服务治理
- Eureka 跨机房服务注册发现
- Sentinel 接口限流熔断
- Feign 服务间 RPC 调用
- Hystrix 服务降级

## 数据库设计

### 分库分表策略（采样数据）
- 分库键：device_id % 2 → ds0, ds1
- 分表键：device_id % 4 → t_power_sampling_0~3
- 总共：2个数据库 × 4张表 = 8张分片表

### 数据库初始化
```bash
mysql -u root -p < sql/init.sql
```

## 快速启动

### 1. 启动顺序
```bash
# 1. 启动 Eureka 集群 (两个节点)
cd eureka-server
mvn spring-boot:run -Dspring.profiles.active=dc1
# 另开窗口
mvn spring-boot:run -Dspring.profiles.active=dc2

# 2. 启动 Gateway
cd gateway
mvn spring-boot:run

# 3. 启动业务服务
cd auth-service && mvn spring-boot:run
cd device-service && mvn spring-boot:run
cd sampling-service && mvn spring-boot:run
cd calculation-service && mvn spring-boot:run
cd scheduler-service && mvn spring-boot:run
```

### 2. 测试接口

#### 登录获取 Token
```bash
curl -X POST http://localhost:8080/auth/login \
  -H "Content-Type: application/json" \
  -d '{"username":"admin","password":"123456"}'
```

#### 设备心跳
```bash
curl -X POST http://localhost:8080/device/heartbeat/DEV001
```

#### 上报采样数据
```bash
curl -X POST http://localhost:8080/sampling/collect \
  -H "Content-Type: application/json" \
  -H "Authorization: Bearer {token}" \
  -d '{
    "deviceId": 1,
    "deviceCode": "DEV001",
    "voltage": 220.5,
    "current": 10.5,
    "power": 2315.25,
    "powerFactor": 0.95,
    "frequency": 50.02
  }'
```

#### 批量拉取采样数据
```bash
curl -X POST http://localhost:8080/sampling/batch/pull \
  -H "Content-Type: application/json" \
  -H "Authorization: Bearer {token}" \
  -d '{
    "deviceIds": [1, 2, 3],
    "startTime": "2024-01-01 00:00:00",
    "endTime": "2024-01-02 00:00:00"
  }'
```

#### 设备异常上报
```bash
curl -X POST http://localhost:8080/device/abnormal/report \
  -H "Content-Type: application/json" \
  -d '{
    "deviceCode": "DEV001",
    "abnormalType": 1,
    "abnormalMessage": "电压过高",
    "severity": 2
  }'
```

#### 执行功耗运算
```bash
curl -X POST http://localhost:8080/calculation/execute \
  -H "Content-Type: application/json" \
  -H "Authorization: Bearer {token}" \
  -d '{
    "deviceId": 1,
    "calculationType": 1,
    "startTime": "2024-01-01 00:00:00",
    "endTime": "2024-01-02 00:00:00"
  }'
```

## 默认账号

| 用户名 | 密码 | 角色 |
|-------|------|------|
| admin | 123456 | admin |

## 监控地址

- Eureka控制台: http://localhost:8761
- 服务实例列表: http://localhost:8761/eureka/apps

## 技术栈

- **框架**: Spring Boot 2.3.12 + Spring Cloud Hoxton
- **服务注册**: Eureka (双机房集群)
- **API网关**: Spring Cloud Gateway
- **限流熔断**: Alibaba Sentinel
- **RPC调用**: OpenFeign + Hystrix
- **ORM**: MyBatis-Plus
- **分库分表**: Apache ShardingSphere 4.1.1
- **认证**: JWT
- **工具库**: Hutool
- **数据库**: MySQL 8.0
