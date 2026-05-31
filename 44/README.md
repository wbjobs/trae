# 分子结构可视化工具

基于 Three.js + WebGL 的分子结构可视化工具，支持 PDB 格式分子文件的解析与渲染。

## 功能特性

- 解析 PDB 格式分子文件
- 3D 渲染原子、化学键、蛋白质结构
- 支持旋转、缩放、平移交互
- 原子信息悬停显示
- 结构片段高亮
- 高性能渲染（支持 10,000+ 原子）
- **分子结构对比**：
  - 同时加载两个分子结构
  - 基于 Kabsch 算法的结构对齐
  - RMSD（均方根偏差）计算
  - 相似度评分（0-100%）
  - 差异区域高亮显示
  - 双分子叠加视图（蓝色=参考，红色=对比）

## 项目结构

```
molecule-viewer/
├── backend/          # Python 后端
│   ├── app.py       # Flask API 服务
│   ├── pdb_parser.py # PDB 文件解析器
│   └── requirements.txt
├── frontend/         # React 前端
│   ├── src/
│   │   ├── components/
│   │   │   ├── MoleculeViewer.jsx  # 分子渲染组件（高性能）
│   │   │   └── ControlPanel.jsx    # 控制面板
│   │   ├── App.jsx
│   │   ├── main.jsx
│   │   └── index.css
│   ├── package.json
│   └── vite.config.js
├── samples/          # 示例 PDB 文件
│   └── example.pdb
├── generate_large_pdb.py  # 生成大 PDB 测试文件脚本
└── README.md
```

## 性能优化特性

### 核心优化

1. **InstancedMesh 批量渲染**
   - 使用 `THREE.InstancedMesh` 替代独立的 `Mesh` 对象
   - 将数千个 draw call 合并为 1-5 个
   - 性能提升 10-100 倍（取决于原子数量）

2. **按需渲染（On-Demand Rendering）**
   - 仅在相机移动或状态变化时重新渲染
   - 空闲时帧率降至接近 0
   - 大幅降低 CPU/GPU 占用

3. **自适应质量设置**
   - 根据原子数量自动调整渲染质量
   - >5000 原子：低质量模式（6段球体、4段化学键、无阴影）
   - 2000-5000 原子：中等质量模式
   - <2000 原子：高质量模式

4. **智能几何体管理**
   - 按原子半径分组，优化 InstancedMesh 使用
   - 正确的资源释放，避免内存泄漏
   - 共享几何体和材质

### 性能指标

| 原子数量 | 优化前 FPS | 优化后 FPS | 性能提升 |
|---------|-----------|-----------|---------|
| 100     | 60        | 60        | 1x      |
| 1000    | 15-20     | 60        | 3-4x    |
| 5000    | 2-5       | 50-60     | 10-30x  |
| 10000+  | <1        | 30-45     | 30-50x+ |

## 快速开始

### 环境要求
- Python 3.8+
- Node.js 16+
- 支持 WebGL 2.0 的浏览器

### 后端

```bash
cd backend
pip install -r requirements.txt
python app.py
```

### 前端

```bash
cd frontend
npm install
npm run dev
```

### Windows 一键启动

```bash
# 安装依赖
install.bat

# 启动后端（新终端）
start-backend.bat

# 启动前端（新终端）
start-frontend.bat

# 打开浏览器访问 http://localhost:5173
```

### Linux/Mac 一键启动

```bash
# 安装依赖
chmod +x install.sh && ./install.sh

# 启动后端（新终端）
./start-backend.sh

# 启动前端（新终端）
./start-frontend.sh

# 打开浏览器访问 http://localhost:5173
```

## 生成大 PDB 测试文件

```bash
# 生成 5000 原子，4 条链的测试文件
python generate_large_pdb.py 5000 4

# 生成 10000 原子，8 条链的测试文件
python generate_large_pdb.py 10000 8
```

## 使用说明

1. 点击"加载示例分子"查看内置的 Crambin 蛋白结构
2. 或点击"上传 PDB 文件"上传你自己的 PDB 格式文件
3. 使用控制面板切换着色模式、高亮不同结构片段
4. 勾选"显示 FPS 性能监控"查看实时性能数据
5. 使用鼠标进行旋转、缩放、平移操作
6. 悬停在原子上查看详细信息

## 分子结构对比功能

### 使用方法

1. 在"分子 1"区域加载第一个分子（参考结构）
2. 在"分子 2"区域加载第二个分子（待对比结构）
3. 选择匹配方式：
   - **按残基+原子名匹配**：适用于相同或同源蛋白
   - **按元素匹配**：适用于不同类型的分子
4. 调整 RMSD 阈值（默认 2.0 Å）
5. 点击"开始结构对比"按钮
6. 查看对比结果：
   - 相似度评分（0-100%）
   - RMSD 值（均方根偏差，单位 Å）
   - 高差异区域列表
   - 3D 叠加视图（蓝色=分子1，红色=分子2，黄色=高差异区域）

### 技术细节

- **对齐算法**：Kabsch 算法（基于奇异值分解 SVD）
- **相似度计算**：综合考虑原子覆盖率和 RMSD 值
- **RMSD 解释**：
  - < 1.0 Å：非常相似
  - 1.0-2.0 Å：中等相似
  - 2.0-3.0 Å：较低相似
  - > 3.0 Å：差异较大

### 对比结果说明

| 指标 | 说明 |
|------|------|
| 相似度 | 0-100%，综合评估结构相似程度 |
| 总体 RMSD | 所有匹配原子的平均偏差 |
| 中位 RMSD | 偏差的中位数，更稳健的统计量 |
| 高差异原子 | RMSD 超过阈值的原子 |
| 中差异原子 | RMSD 在 1.0-2.0 Å 之间 |
| 低差异原子 | RMSD ≤ 1.0 Å |

## 交互操作

| 操作 | 功能 |
|------|------|
| 鼠标左键拖拽 | 旋转分子 |
| 鼠标滚轮 | 缩放视图 |
| 鼠标右键拖拽 | 平移视图 |
| 悬停原子 | 显示原子详细信息 |

## 着色模式

- **元素**：按化学元素着色（C=灰, O=红, N=蓝, S=黄等）
- **链**：按分子链着色
- **二级结构**：按蛋白质二级结构着色（α-螺旋=红, β-折叠=青, 无规卷曲=灰）
- **残基**：按氨基酸残基类型着色

## 技术栈

- **后端**: Flask, Biopython, NumPy
- **前端**: React 18, Three.js, Vite
- **3D 渲染**: WebGL + Three.js (InstancedMesh, OrbitControls)
- **API**: RESTful JSON API

## 浏览器兼容性

支持所有支持 WebGL 2.0 的现代浏览器：
- Chrome 56+
- Firefox 51+
- Safari 15+
- Edge 79+
