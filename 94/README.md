# 矩阵乘法性能对比工具

WebAssembly (C++) vs JavaScript 矩阵乘法性能对比测试工具。

## 项目结构

```
├── cpp/                    # C++ 源代码目录
│   ├── matmul.cpp         # 矩阵乘法 C++ 实现
│   ├── build.bat          # Windows 编译脚本
│   └── Makefile           # Linux/Mac 编译脚本
├── frontend/              # 前端目录
│   ├── index.html         # 主页面
│   ├── app.js             # 主逻辑脚本
│   └── matmul_js.js       # JavaScript 矩阵乘法实现
├── backend/               # 后端目录
│   ├── main.py            # FastAPI 后端
│   └── requirements.txt   # Python 依赖
├── start_backend.bat      # 后端启动脚本 (Windows)
└── start_frontend.bat     # 前端启动脚本 (Windows)
```

## 功能特性

- ✅ **双版本对比**: 同时运行 WebAssembly (C++) 和 JavaScript 版本的矩阵乘法
- ✅ **性能指标**: 展示耗时、GFLOPS、最快/最慢单次等指标
- ✅ **可视化图表**: 使用 Chart.js 展示性能对比柱状图和折线图
- ✅ **历史记录**: FastAPI 后端存储测试历史，支持历史趋势对比
- ✅ **灵活配置**: 支持 256/512/1024/2048 四种矩阵大小
- ✅ **多种算法**: 普通版本、优化版本、分块版本 (8/16/32/64)
- ✅ **🤖 自动调优**: 自动测试所有算法，选择最优配置并缓存到 LocalStorage
- ✅ **结果验证**: 自动验证 WASM 和 JS 计算结果一致性
- ✅ **Safari 兼容**: 多层降级加载机制，确保在 Safari 上正常运行
- ✅ **错误处理**: 完善的错误提示和降级策略

## 快速开始

### 1. 编译 WASM 模块 (可选)

如果需要使用 WASM 版本，需要先安装 Emscripten：

**Windows:**
```bash
cd cpp
build.bat
```

**Linux/Mac:**
```bash
cd cpp
make
```

编译成功后会在 `frontend/` 目录下生成 `matmul.js` 和 `matmul.wasm`。

> **注意**: 如果不编译 WASM，页面仍然可以运行，只会显示 JavaScript 版本的性能数据。

### 2. 启动后端服务

```bash
cd backend
pip install -r requirements.txt
python main.py
```

后端将在 `http://localhost:8000` 启动。

API 文档: `http://localhost:8000/docs`

### 3. 启动前端服务

```bash
cd frontend
python -m http.server 8080
```

然后在浏览器中访问: `http://localhost:8080`

## API 接口

### 保存测试结果
```
POST /api/results
Content-Type: application/json

{
  "matrix_size": 1024,
  "iterations": 3,
  "optimized": true,
  "wasm_time_avg": 123.45,
  "wasm_gflops": 17.3,
  "js_time_avg": 456.78,
  "js_gflops": 4.7
}
```

### 获取所有结果
```
GET /api/results?skip=0&limit=100&matrix_size=1024
```

### 获取统计信息
```
GET /api/stats?matrix_size=1024
```

### 清空所有结果
```
DELETE /api/results
```

## FLOPS 计算

对于 N×N 矩阵乘法，总浮点运算次数为:

- 乘法: N³ 次
- 加法: N³ 次
- 总计: 2 × N³ 次 FLOPs

GFLOPS (每秒十亿次浮点运算) 计算公式:
```
GFLOPS = (2 × N³) / (时间(秒) × 10⁹)
```

## 性能优化说明

### 普通版本 (ijk 顺序)
```cpp
for (i = 0; i < N; i++)
    for (j = 0; j < N; j++)
        for (k = 0; k < N; k++)
            C[i][j] += A[i][k] * B[k][j]
```
- 问题: 访问 B[k][j] 时跨步访问，缓存命中率低

### 优化版本 (ikj 顺序)
```cpp
for (i = 0; i < N; i++)
    for (k = 0; k < N; k++) {
        a = A[i][k];
        for (j = 0; j < N; j++)
            C[i][j] += a * B[k][j]
    }
```
- 优势: 连续访问内存，充分利用 CPU 缓存
- 性能提升: 通常比普通版本快 2-3 倍

### 分块版本 (Tiled)
```cpp
for (i = 0; i < N; i += block_size)
    for (j = 0; j < N; j += block_size)
        for (k = 0; k < N; k += block_size)
            for (ii = i; ii < i + block_size; ii++)
                for (kk = k; kk < k + block_size; kk++) {
                    a = A[ii][kk];
                    for (jj = j; jj < j + block_size; jj++)
                        C[ii][jj] += a * B[kk][jj]
                }
```
- 优势: 将矩阵分成小块，进一步提高缓存命中率
- 分块大小: 支持 8x8, 16x16, 32x32, 64x64
- 最佳分块大小取决于 CPU 缓存大小和矩阵尺寸

## 🤖 自动调优功能

### 使用方法
1. 在页面中选择"自动调优"作为算法类型
2. 点击"🔍 自动调优"按钮
3. 系统会自动测试所有算法（6种）并选择最优配置
4. 最优配置会被缓存到 LocalStorage，后续测试自动使用

### 测试的算法
- 普通版本 (ijk)
- 优化版本 (ikj)
- 分块 8x8
- 分块 16x16
- 分块 32x32
- 分块 64x64

### 缓存机制
- 缓存 Key: `matmul_autotune_config`
- 缓存内容: 最优算法、所有算法的测试结果、时间戳
- 缓存按矩阵大小区分，不同尺寸有独立的最优配置
- 如需清除缓存，可在浏览器控制台执行 `localStorage.removeItem('matmul_autotune_config')`

## 预期性能对比

在现代 CPU 上的典型性能表现 (1024×1024, 优化版本):

| 实现方式 | 耗时 (ms) | GFLOPS | 加速比 |
|---------|----------|--------|--------|
| JavaScript | 400-800 | 2.7-5.4 | 1x |
| WebAssembly | 100-200 | 10.7-21.5 | 3-5x |

> **注意**: 实际性能取决于 CPU 型号、浏览器版本和系统负载。

## 技术栈

- **前端**: HTML5, JavaScript (ES6+), Chart.js
- **WASM**: C++17, Emscripten
- **后端**: Python 3.8+, FastAPI, SQLAlchemy, SQLite

## 常见问题

### Q: 为什么 WASM 模块加载失败？
A: 确保已正确编译 WASM，并且 `matmul.js` 和 `matmul.wasm` 文件在 `frontend/` 目录下。

### Q: 可以不启动后端直接使用吗？
A: 可以！前端可以独立运行进行性能测试，只是无法保存和查看历史记录。

### Q: 如何清除历史记录？
A: 点击页面上的"清空历史记录"按钮，或调用 `DELETE /api/results` 接口。

### Q: 支持更大的矩阵吗？
A: 代码理论上支持任意大小，但 2048×2048 以上可能会导致浏览器内存不足。

## License

MIT License
