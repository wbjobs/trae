# 天体轨道摄动偏差计算平台

## 项目概述

本项目是一个多文件模块化的天体轨道摄动偏差计算平台，实现了高精度的轨道计算、摄动分析、偏差预测和数据可视化功能。

## 目录结构

```
project/
├── core/                          # 计算核心层
│   ├── __init__.py
│   ├── unit_conversion.py         # 天文单位换算模块
│   ├── orbit_parameters.py        # 轨道参数导入模块
│   ├── perturbation.py            # 摄动因子运算模块
│   ├── deviation_fitting.py       # 偏差拟合推演模块
│   ├── batch_processor.py         # 批量数据迭代计算模块
│   └── numerical_engine.py        # 高精度数值计算引擎
├── data_io/                       # 数据接入层
│   ├── __init__.py
│   ├── data_loader.py             # 数据加载器
│   └── observation_parser.py      # 观测数据解析器
├── output/                        # 结果输出层
│   ├── __init__.py
│   ├── result_exporter.py         # 结果导出器
│   └── visualization.py           # 可视化模块
├── data/
│   ├── raw/                       # 原始观测数据
│   └── processed/                 # 处理后数据
├── config.py                      # 全局配置
├── main.py                        # 主入口程序
└── README.md                      # 项目文档
```

## 核心功能模块

### 1. 天文单位换算模块 (`unit_conversion.py`)
- 物理常数集合（高精度）
- 长度、质量、时间单位换算
- 角度单位换算（度、弧度、角秒）
- 时间系统转换（儒略日、MJD、ISO时间）
- 轨道根数与位置速度矢量相互转换

### 2. 轨道参数导入模块 (`orbit_parameters.py`)
- 轨道根数数据结构定义
- 天体数据模型
- 支持从TLE、开普勒根数、CSV等格式导入
- 太阳系天体模型创建

### 3. 摄动因子运算模块 (`perturbation.py`)
- 地球非球形引力摄动（J2/J3/J4）
- 第三体摄动（太阳、月球、行星）
- 大气阻力摄动
- 太阳辐射压力摄动
- 相对论效应摄动

### 4. 偏差拟合推演模块 (`deviation_fitting.py`)
- 数据预处理（异常值剔除、平滑处理）
- 多种拟合方法（多项式、傅里叶、样条等）
- 周期性分析（FFT、Lomb-Scargle）
- 长期趋势预测（ARIMA、指数趋势等）

### 5. 批量数据迭代计算模块 (`batch_processor.py`)
- 多种数值积分方法（Euler、RK4、RK78、Verlet）
- 自适应步长控制
- 多体并行计算
- 长周期轨道传播
- 偏差计算与分析

### 6. 高精度数值计算引擎 (`numerical_engine.py`)
- 统一计算接口
- 多精度级别配置（低/中/高/超高）
- 多星体同步演算
- 长周期偏差预测
- 多维校准功能

## 数据接入层

### 数据加载器 (`data_loader.py`)
- 支持CSV、JSON、TLE格式
- 观测数据批量导入
- 结果数据保存

### 观测数据解析器 (`observation_parser.py`)
- 光学观测数据解析（赤经赤纬）
- 雷达观测数据解析（距离、角度）
- 激光测距数据解析
- 坐标系统转换

## 结果输出层

### 结果导出器 (`result_exporter.py`)
- 支持CSV、JSON格式导出
- 自动生成分析报告（文本/Markdown/HTML）
- 批量结果导出

### 可视化模块 (`visualization.py`)
- 3D轨道可视化
- 位置-时间曲线
- 偏差趋势图
- 周期图谱分析
- 残差分析图
- 多体对比图
- 综合仪表盘

## 安装依赖

```bash
pip install numpy pandas scipy matplotlib h5py
```

## 使用方法

### 基础模拟

```bash
python main.py basic
```

### 长期预测

```bash
python main.py longterm
```

### 多体模拟

```bash
python main.py multibody
```

### 观测校准

```bash
python main.py calibration
```

### 运行所有模块

```bash
python main.py all
```

### 自定义精度级别

```bash
python main.py basic --precision high
```

### 精度级别说明

| 级别 | 积分方法 | 步长 | 摄动模型 |
|------|----------|------|----------|
| LOW | RK4 | 600s | J2 + 日月 |
| MEDIUM | RK4 | 300s | J2/J3/J4 + 日月 |
| HIGH | RK78 | 自适应 | 全部摄动 |
| ULTRA | RK78 | 自适应 | 全部摄动 + 更高精度 |

## 输入数据格式

### CSV观测数据格式

```csv
time_mjd,pos_x,pos_y,pos_z,vel_x,vel_y,vel_z,pos_uncertainty
51544.5,6959437.32,-174281.56,357452.89,123.45,-7567.89,1234.56,10.0
...
```

### TLE格式

支持标准Two-Line Element格式。

## 输出结果

运行完成后，结果将保存在 `output/` 目录下，包括：

- CSV数据文件
- JSON数据文件
- PNG图像文件
- Markdown分析报告

## 技术特点

1. **模块化设计**：清晰的三层架构，各模块独立可替换
2. **高精度计算**：支持多种数值积分方法和精度级别
3. **并行处理**：多核CPU并行计算，提高效率
4. **灵活配置**：丰富的配置选项，满足不同需求
5. **可视化展示**：多种图表类型，直观展示计算结果
6. **离线计算**：完全离线运行，保护数据安全

## 扩展开发

### 添加新的摄动模型

在 `core/perturbation.py` 中：
1. 在 `PerturbationType` 枚举中添加新类型
2. 实现对应的计算方法
3. 在 `_calculate_perturbation` 中添加调用

### 添加新的拟合方法

在 `core/deviation_fitting.py` 中：
1. 在 `FittingMethod` 枚举中添加新类型
2. 实现拟合函数
3. 在 `auto_fit` 中添加调用

## 许可证

本项目仅供科学研究使用。
