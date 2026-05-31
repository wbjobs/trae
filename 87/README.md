# 水文流域生态径流时序分析可视化系统

## 修复记录 (v1.0.1)

### 已修复的问题：

1. **海量时序数据清洗模块内存溢出问题**
   - 优化了数据清洗流程，增加分块流式处理机制
   - 新增 `cleanStreaming` 方法，支持5万条以上数据分块处理
   - 优化噪声降低算法，使用 `moving-average` 作为默认算法
   - 修复了 `Math.min(...values)` 和 `Math.max(...values)` 在大数据量下的栈溢出问题
   - 新增分块大小配置 `chunkSize`，默认50000条

2. **流域分区联动图表渲染错位故障**
   - 修复了多流域对比图表的时间轴对齐问题
   - 统一时间轴字符串排序逻辑，使用 `new Date()` 正确排序
   - 新增图表销毁机制 `dispose()`，避免重复渲染导致的错位
   - 修复图表切换时的内存泄漏问题

3. **径流系数演算模块统计结果偏差漏洞**
   - 修复了 `tennantMethod` 中未传递 `data` 参数导致 `seasonalFlows` 计算失败的问题
   - 修复了年度/月度数据过滤逻辑，使用 `Date` 对象正确解析日期
   - 新增数据有效性验证，过滤负值和空值
   - 修复除零错误，增加分母保护
   - 新增空数据保护，返回合理的默认值

4. **离线报表导出格式错乱运行异常**
   - 修复所有数值字段的格式化，统一转换为Number类型
   - 新增空数据处理，所有工作表支持空数据场景
   - 新增冻结表头 `!freeze` 配置，提升大表格浏览体验
   - 修复空值调用 `toFixed()` 导致的报错
   - 新增异常时段和生态分析的空数据保护

5. **系统各模块关联问题**
   - 修复 `anomaly-period-detector.js` 中的多处语法错误（缺少右括号）
   - 修复 `anomaly-period-aggregator.js` 中的偏差计算逻辑
   - 修复统计图表组件缺少 `echarts` 导入的问题
   - 修复Vite路径别名配置，使用ESM标准的 `fileURLToPath`
   - 修复主应用图表初始化逻辑，避免重复创建实例
   - 新增 `disposeAllCharts()` 方法，统一管理图表资源

### 性能优化：

- 统计工具类：减少数组重复排序，复用已排序数组
- 数据清洗：分块处理，降低内存峰值
- 图表渲染：按需创建和销毁，避免内存泄漏
- 报表导出：流式生成，优化大文件导出

## 新增功能 (v1.1.0)

### 1. **极端气候下径流推演分析模块**

**文件位置：`src/modules/extreme-climate/`

- **极端气候模拟器** (`extreme-climate-simulator.js`)
  - 支持6种极端气候类型：特大洪水、极端干旱、高温热浪、寒潮低温、台风暴雨、暴雨洪涝
  - 4种强度级别：轻度、中度、重度、极端
  - 风险评估与影响分析
  - 重现期计算（五年一遇至千年一遇）
  - 多情景对比分析功能
  - 经济损失估算与生态影响评估
  - 防灾减灾措施建议

- **径流预测模型** (`runoff-prediction-model.js`)
  - 基于历史数据的短期径流预测（支持30天预测）
  - 季节性模式识别与年际趋势分析
  - 气候情景耦合预测
  - 置信区间评估
  - 峰值预测与趋势分析

### 2. **流域监测点位热力图层渲染功能**

**文件位置：`src/components/charts/station-heatmap-chart.js`

- 监测点位经纬度热力分布可视化
- 支持按指标值的渐变色热力渲染
- 点位大小反映数据量或监测频率
- 多类型热力图支持：
  - 单点热力分布图
  - 时间序列动态热力图
  - 密度热力图
  - 流域分区对比图
- 流域分区中心标注与涟漪效果
- 交互提示与详情展示

### 3. **时序数据分片读取处理**

**文件位置：`src/utils/time-series-chunk-reader.js`

- 大数据量分块读取处理
- 支持同步/异步分片迭代器
- 窗口化数据处理
- 分片重叠处理，保证数据连续性
- 内存使用预估与处理时间估算
- 进度回调与延迟控制
- 分片结果聚合功能

### 4. **径流生态平衡评估打分子模块**

**文件位置：`src/modules/ecological-calculation/ecological-balance-evaluator.js`

- 8项生态指标综合评估：
  - 流量稳定性评估
  - 生态流量满足度
  - 水质状况评估
  - 生境适宜性评估
  - 物种多样性评估
  - 河岸带植被评估
  - 洪泛平原连通性
  - 泥沙输运评估

- 五级评估等级：优秀(≥90)、良好(≥75)、中等(≥60)、较差(≥40)、严重(<40)
- 雷达图可视化支持
- 多流域对比评估
- 趋势分析与改进建议生成
- 历史趋势对比功能

**生态评估雷达图组件** (`src/components/charts/ecological-radar-chart.js`)
- 单流域评估雷达图
- 多流域对比雷达图
- 指标评分柱状图
- 历史趋势折线图

### 5. **不同流域地域数据适配校准文件**

**配置文件：`config/region-calibration.config.js`

支持7个典型流域区域配置：
- 北方平原区（温带季风气候）
- 南方丘陵区（亚热带季风气候）
- 西南山区（高原季风气候）
- 西北干旱区（温带干旱气候）
- 东部沿海区（亚热带海洋性气候）
- 东北森林区（温带大陆性气候）
- 黄土高原区（温带半干旱气候）

每个区域配置包含：
- 气候类型与气象参数
- 降雨径流特征
- 季节性模式
- 径流系数（按土地利用类型）
- 洪水/干旱特征
- 生态参数
- 数据质量标准

**地域数据适配器** (`src/modules/data-source/region-data-adapter.js`)
- 地域数据校准与标准化
- 缺失值估算与填补
- 异常值检测与处理
- 区域间数据迁移适配
- 数据质量验证
- 基准数据生成

## 系统架构

```
watershed-analysis-system/
├── config/                          # 配置文件目录
│   ├── database.config.js          # 数据库连接配置
│   ├── watershed-zones.config.js   # 流域分区配置
│   ├── monitoring-stations.config.js # 监测站点配置
│   ├── system.config.js            # 系统全局配置
│   └── index.js                    # 配置统一导出
├── data/                           # 数据目录
│   ├── raw/                        # 原始数据
│   ├── cleaned/                    # 清洗后数据
│   └── export/                     # 导出数据
├── scripts/                        # 命令行脚本目录
│   ├── clean-runoff-data.js        # 数据清洗脚本
│   ├── generate-batch-reports.js   # 批量报表生成脚本
│   ├── calculate-ecological-coefficient.js # 生态系数演算脚本
│   └── detect-anomaly-periods.js   # 异常时段检测脚本
├── src/
│   ├── components/                 # 组件目录
│   │   └── charts/                 # 图表组件
│   │       ├── chart-base.js       # 图表基类
│   │       ├── timeseries-chart.js # 时序图表
│   │       ├── multizone-comparison-chart.js # 多流域对比图
│   │       ├── statistical-chart.js # 统计图表
│   │       ├── ecological-flow-chart.js # 生态流量图表
│   │       └── index.js            # 图表组件统一导出
│   ├── modules/                    # 业务模块
│   │   ├── data-source/            # 数据源接入模块
│   │   ├── data-cleaning/          # 数据清洗模块
│   │   ├── ecological-calculation/ # 生态演算模块
│   │   ├── anomaly-detection/      # 异常检测模块
│   │   └── report-generation/      # 报表生成模块
│   ├── utils/                      # 工具类目录
│   │   ├── statistics.utils.js     # 统计运算工具
│   │   ├── time-series.utils.js    # 时序分析工具
│   │   ├── hydrology.utils.js      # 水文计算工具
│   │   └── index.js                # 工具类统一导出
│   ├── app.js                      # 主应用逻辑
│   ├── main.js                     # 应用入口
│   └── style.css                   # 全局样式
├── reports/                        # 报表输出目录
├── index.html                      # 主页面
├── package.json                    # 项目依赖
├── vite.config.js                  # Vite配置
└── index.js                        # 库统一导出
```

## 五大核心模块

### 1. 流域数据源接入模块 (`src/modules/data-source/`)
- 数据库连接管理
- 多维度数据查询（日/月/年）
- 流域分区数据获取
- 监测站点数据接入
- 模拟数据生成（开发环境）

### 2. 时序径流数据清洗模块 (`src/modules/data-cleaning/`)
- 缺失值处理（线性插值、样条插值）
- 噪声降低（Savitzky-Golay滤波、移动平均、高斯滤波）
- 异常值检测（Z-score、IQR、修正Z-score）
- 数据质量验证

### 3. 生态径流系数演算模块 (`src/modules/ecological-calculation/`)
- Tennant法生态流量计算
- Q90法生态流量计算
- 水文频率分析
- 逐月生态流量分析
- 生态径流系数趋势分析

### 4. 多维流域图表渲染模块 (`src/components/charts/`)
- 时序变化图表
- 多流域对比图表
- 统计分布图表
- 生态流量满足度图表
- 异常时段可视化

### 5. 异常径流时段归集模块 (`src/modules/anomaly-detection/`)
- 异常时段检测
- 异常严重程度评估
- 生态影响分析
- 时空分布统计
- 多时段对比分析

## 功能特性

- ✅ 多维度径流统计（日/月/年）
- ✅ 流域分区数据联动可视化
- ✅ 时序数据降噪处理
- ✅ 离线分析报表批量生成
- ✅ 生态流量评估
- ✅ 异常时段自动检测与告警
- ✅ 响应式设计，支持多终端访问

## 快速开始

### 安装依赖
```bash
npm install
```

### 启动开发服务器
```bash
npm run dev
```

### 构建生产版本
```bash
npm run build
```

### 命令行工具

#### 数据清洗
```bash
npm run clean-data -- --zoneId zone_a --startTime 2023-01-01 --endTime 2023-12-31
```

#### 生态系数演算
```bash
npm run calc-coefficient -- --zoneId zone_a --startTime 2020-01-01 --endTime 2023-12-31
```

#### 异常时段检测
```bash
npm run detect-anomaly -- --zoneId zone_a --startTime 2023-01-01 --endTime 2023-12-31
```

#### 批量报表生成
```bash
npm run generate-report -- --mode all --startTime 2023-01-01 --endTime 2023-12-31
```

## 技术栈

- **前端框架**: 原生 JavaScript + ESM
- **构建工具**: Vite
- **图表库**: ECharts 5.x
- **日期处理**: Day.js
- **数学计算**: Math.js
- **报表导出**: SheetJS (xlsx)
- **文件保存**: FileSaver.js

## 配置说明

### 数据库配置 (`config/database.config.js`)
配置PostgreSQL数据库连接参数，支持连接池管理。

### 流域分区配置 (`config/watershed-zones.config.js`)
定义流域分区信息，包括：
- 分区ID、名称、面积
- 包含的监测站点
- 生态流量阈值
- 分区颜色编码

### 系统配置 (`config/system.config.js`)
全局系统参数配置：
- 时区设置
- 数据保留年限
- 图表主题
- 分析参数

## 数据格式

### 径流量数据格式
```javascript
{
  record_time: '2023-01-01 08:00:00',  // 记录时间
  runoff_value: 12.5,                  // 径流量 (m³/s)
  water_level: 3.2,                    // 水位 (m)
  velocity: 1.8,                       // 流速 (m/s)
  station_id: 'ST001',                 // 站点ID
  quality_flag: 'normal'               // 数据质量标记
}
```

## 许可证

MIT License
