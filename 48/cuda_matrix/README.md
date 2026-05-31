# CUDA Matrix Operations Library

一个基于 CUDA 的高性能矩阵运算库，前端提供易用的 Python API，后端使用 C++ + CUDA 实现核心运算。

## 功能特性

### 核心功能
- **矩阵乘法 (Matrix Multiplication)**: 使用共享内存分块优化的 CUDA 内核
- **矩阵转置 (Matrix Transpose)**: 支持共享内存优化的高效转置
- **矩阵求逆 (Matrix Inversion)**: 使用 Gauss-Jordan 消元法
- **特征值计算 (Eigenvalue Decomposition)**: 使用 QR 迭代算法

### 接口特性
- 无缝 NumPy 数组集成
- Python `@` 运算符重载
- 内存管理：自动 CPU/GPU 内存转换
- 易用的矩阵创建 API（zeros, ones, identity, random）

## 项目结构

```
cuda_matrix/
├── CMakeLists.txt              # CMake 构建配置
├── setup.py                    # Python 包配置
├── build.py                    # 构建脚本
├── test.py                     # 测试用例
├── cpp/
│   ├── include/
│   │   └── matrix.h            # C++ Matrix 类定义
│   ├── src/
│   │   └── matrix.cu           # Matrix 类实现和高级运算
│   ├── kernels/
│   │   ├── matmul.cuh          # 矩阵乘法内核声明
│   │   ├── matmul.cu           # 矩阵乘法内核实现
│   │   ├── transpose.cuh       # 转置内核声明
│   │   └── transpose.cu        # 转置内核实现
│   └── bindings/
│       └── bindings.cpp        # pybind11 绑定
└── python/
    └── cuda_matrix/
        ├── __init__.py         # 包初始化
        ├── matrix.py           # Python Matrix 类和核心 API
        └── linalg.py           # 线性代数工具函数
```

## 系统要求

- CUDA Toolkit 11.0+
- Python 3.8+
- NumPy 1.21+
- pybind11
- CMake 3.18+
- C++17 编译器 (GCC 7+, Visual Studio 2019+)

## 安装和构建

### 方法一：使用 build.py（推荐）

```bash
cd cuda_matrix
python build.py
```

### 方法二：手动 CMake 构建

```bash
cd cuda_matrix
mkdir build
cd build
cmake ..
cmake --build . --config Release
```

### 安装 Python 包

```bash
pip install -e .
```

## 使用示例

### 基础使用

```python
import numpy as np
import cuda_matrix as cm
from cuda_matrix import Matrix

# 创建矩阵
A = Matrix.random(1024, 1024)
B = Matrix.random(1024, 1024)

# 矩阵乘法
C = A @ B

# 转置
A_T = cm.transpose(A)

# 求逆
A_inv = cm.inverse(A)

# 特征值计算
eigenvalues, eigenvectors = cm.eig(A)

# 转换为 NumPy 数组
C_np = C.numpy()

# 从 NumPy 数组创建
arr = np.array([[1, 2], [3, 4]], dtype=np.float32)
M = Matrix(arr)
```

### 线性代数工具

```python
from cuda_matrix import linalg

# 求解线性方程组 Ax = b
x = linalg.solve(A, b)

# 行列式
det_A = linalg.det(A)

# 范数
norm_A = linalg.norm(A)

# SVD 分解
U, S, Vt = linalg.svd(A)

# LU 分解
P, L, U = linalg.lu_decomposition(A)
```

## 性能特性

### 矩阵乘法优化
- 使用共享内存分块 (Tiling) 技术
- 16x16 线程块大小
- 全局内存合并访问
- 共享内存 Bank Conflicts 优化

### 转置优化
- 共享内存缓存
- 避免 Bank Conflicts (padding 技术)

## API 参考

### Matrix 类

| 方法/属性 | 描述 |
|---------|------|
| `Matrix(data)` | 从 NumPy 数组或列表创建 |
| `Matrix(rows, cols)` | 创建指定大小的矩阵 |
| `.shape` | 返回矩阵形状 (rows, cols) |
| `.on_gpu` | 是否在 GPU 上 |
| `.numpy()` | 转换为 NumPy 数组 |
| `.to_gpu()` | 传输到 GPU |
| `.to_cpu()` | 传输到 CPU |
| `@` 运算符 | 矩阵乘法 |

### 核心函数

| 函数 | 描述 |
|-----|------|
| `matmul(A, B)` | 矩阵乘法 |
| `transpose(A)` | 矩阵转置 |
| `inverse(A)` | 矩阵求逆 |
| `eig(A)` | 特征值分解 |

### 创建函数

| 函数 | 描述 |
|-----|------|
| `Matrix.zeros(rows, cols)` | 全零矩阵 |
| `Matrix.ones(rows, cols)` | 全一矩阵 |
| `Matrix.identity(n)` | 单位矩阵 |
| `Matrix.random(rows, cols)` | 随机矩阵 |

## 测试

运行完整的测试套件：

```bash
python test.py
```

测试内容包括：
- 矩阵创建和 NumPy 集成
- 矩阵乘法正确性验证
- 转置操作验证
- 矩阵求逆验证
- 特征值计算验证
- 大规模矩阵性能测试

## 技术细节

### CUDA 内核设计

**矩阵乘法**:
- Grid 维度: ((N + 15) / 16, (M + 15) / 16)
- Block 维度: (16, 16)
- 共享内存: 每个块缓存 16x16 的 A 和 B 子矩阵
- 计算复杂度: O(M*N*K)

**转置**:
- Grid 维度: ((cols + 15) / 16, (rows + 15) / 16)
- Block 维度: (16, 16)
- 共享内存: 16x17 (padding 避免 bank conflicts)

### 内存管理

- 智能内存拷贝：仅在需要时进行 CPU/GPU 数据传输
- RAII 模式：自动释放资源
- 惰性评估：host_data() 按需分配和拷贝

## 注意事项

1. 矩阵默认在 GPU 上创建
2. 对于小矩阵 (< 64x64)，CPU 可能更快
3. 特征值计算目前在 CPU 上执行（QR 迭代）
4. 所有数据使用单精度浮点数 (float32)

## License

MIT License
