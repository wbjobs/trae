# 嵌入式设备 OTA 升级管理平台

一个功能完整的嵌入式设备空中升级（OTA）管理系统，包含设备管理、固件管理、升级任务调度、安全机制和数据统计等核心功能。

## 技术栈

### 后端
- Java 17 + Spring Boot 3.2.0
- Spring Security + JWT 身份认证
- Spring Data JPA + H2 Database（开发环境）
- RSA 签名验证 + AES 加密传输
- 定时任务调度

### 前端
- React 18 + TypeScript
- Ant Design 5.x 组件库
- ECharts 数据可视化
- Vite 构建工具
- Axios HTTP 客户端

## 功能模块

### 1. 设备管理
- 设备注册与身份认证
- 设备分组管理
- 实时状态监控（在线/离线）
- 固件版本跟踪
- 心跳机制与超时检测

### 2. 升级管理
- 固件上传与版本管理
- 固件发布/取消发布
- 升级任务创建与调度
- 灰度发布（按百分比）
- 升级进度实时监控
- 定时执行任务

### 3. 安全机制
- JWT Token 身份认证
- 固件 RSA 签名验证
- 升级包 AES 加密传输
- 设备 API Key 认证
- BCrypt 密码加密

### 4. 数据统计
- 设备状态分布统计
- 固件版本分布统计
- 升级成功率统计
- 升级趋势分析图表
- 各版本升级明细报表

## 项目结构

```
ota-platform/
├── backend/                    # Spring Boot 后端
│   ├── src/main/java/com/ota/platform/
│   │   ├── controller/        # REST API 控制器
│   │   ├── service/           # 业务逻辑层
│   │   ├── repository/        # 数据访问层
│   │   ├── entity/            # JPA 实体类
│   │   ├── dto/               # 数据传输对象
│   │   ├── security/          # 安全相关组件
│   │   ├── config/            # 配置类
│   │   └── OtaPlatformApplication.java
│   ├── src/main/resources/
│   │   └── application.yml    # 应用配置
│   └── pom.xml
└── frontend/                  # React 前端
    ├── src/
    │   ├── pages/             # 页面组件
    │   ├── components/        # 公共组件
    │   ├── services/          # API 服务
    │   ├── App.tsx
    │   ├── main.tsx
    │   └── index.css
    ├── package.json
    └── vite.config.ts
```

## 快速开始

### 环境要求
- JDK 17+
- Node.js 18+
- Maven 3.8+

### 启动后端服务

```bash
cd backend
mvn spring-boot:run
```

后端服务将在 `http://localhost:8080` 启动

- H2 数据库控制台: `http://localhost:8080/h2-console`
  - JDBC URL: `jdbc:h2:mem:otadb`
  - 用户名: `admin`
  - 密码: `admin`

### 启动前端服务

```bash
cd frontend
npm install
npm run dev
```

前端服务将在 `http://localhost:3000` 启动

### 默认账号

| 角色 | 用户名 | 密码 |
|------|--------|------|
| 管理员 | admin | admin123 |
| 普通用户 | user | user123 |

## API 接口

### 认证接口
- `POST /api/auth/login` - 用户登录
- `POST /api/auth/register` - 用户注册
- `GET /api/auth/me` - 获取当前用户信息

### 设备管理
- `GET /api/devices` - 获取设备列表（分页）
- `POST /api/devices` - 创建设备
- `PUT /api/devices/{id}` - 更新设备
- `DELETE /api/devices/{id}` - 删除设备
- `POST /api/devices/{id}/group/{groupId}` - 分配分组
- `POST /api/devices/heartbeat` - 设备心跳

### 设备分组
- `GET /api/device-groups` - 获取分组列表
- `POST /api/device-groups` - 创建分组
- `PUT /api/device-groups/{id}` - 更新分组
- `DELETE /api/device-groups/{id}` - 删除分组

### 固件管理
- `GET /api/firmware` - 获取固件列表
- `POST /api/firmware/upload` - 上传固件
- `POST /api/firmware/{id}/publish` - 发布固件
- `POST /api/firmware/{id}/unpublish` - 取消发布
- `GET /api/firmware/{id}/download` - 下载固件

### 升级任务
- `GET /api/upgrade-tasks` - 获取任务列表
- `POST /api/upgrade-tasks` - 创建升级任务
- `POST /api/upgrade-tasks/{id}/execute` - 执行任务
- `POST /api/upgrade-tasks/{id}/cancel` - 取消任务
- `GET /api/upgrade-tasks/{id}/progress` - 获取升级进度
- `POST /api/upgrade-tasks/{id}/continue-grayscale` - 继续灰度发布

### 数据统计
- `GET /api/statistics/dashboard` - 仪表盘数据
- `GET /api/statistics/device-status` - 设备状态统计
- `GET /api/statistics/firmware-version` - 固件版本分布
- `GET /api/statistics/upgrade-trend` - 升级趋势
- `GET /api/statistics/firmware-upgrade` - 固件升级统计

## 安全机制说明

### 1. 设备身份认证
每个设备注册时生成唯一的 API Key，设备后续请求必须携带该 Key 进行身份验证。

### 2. 固件签名验证
固件上传时自动生成 RSA 签名，设备下载固件后验证签名确保固件完整性和来源可信。

### 3. 加密传输
固件文件在存储和传输过程中使用 AES 加密，防止固件被窃取或篡改。

### 4. JWT Token
管理后台使用 JWT Token 进行用户认证，Token 有效期 24 小时。

## 灰度发布流程

1. 创建升级任务时勾选"灰度发布"并设置灰度比例（如 20%）
2. 任务执行时仅升级指定比例的设备
3. 观察灰度设备升级情况，确认无问题后点击"继续"
4. 系统自动升级下一批设备，直到全部完成

## 开发说明

### 切换数据库
默认使用 H2 内存数据库，如需使用 MySQL，修改 `application.yml`:

```yaml
spring:
  datasource:
    url: jdbc:mysql://localhost:3306/ota_db
    driver-class-name: com.mysql.cj.jdbc.Driver
    username: root
    password: password
  jpa:
    hibernate:
      ddl-auto: update
    properties:
      hibernate:
        dialect: org.hibernate.dialect.MySQLDialect
```

### 配置加密密钥
在 `application.yml` 中修改安全相关配置:

```yaml
ota:
  security:
    jwt-secret: your-secret-key
    jwt-expiration-ms: 86400000
  encryption:
    aes-key: your-encryption-key
```

## License
MIT License
