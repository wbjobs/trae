# wasm-lz4

LZ4 压缩算法的原创实现，支持 WebAssembly 和纯 JavaScript 版本。

## 项目特性

- ✅ **原创实现**：从零开始实现 LZ4 压缩算法，未调用任何现成库
- 🚀 **双版本支持**：WebAssembly 版和纯 JavaScript 版
- ⚡ **极速性能**：WASM 版本相比纯 JS 有显著性能提升
- 📦 **CLI 工具**：提供 `wasm-lz4` 命令行工具
- 📊 **基准测试**：内置性能对比，生成可视化图表

## 项目结构

```
wasm-lz4/
├── src/
│   ├── lz4.h          # C 头文件
│   ├── lz4.c          # LZ4 核心算法实现 (C)
│   └── lz4_wasm.c     # Emscripten 绑定
├── lib/
│   ├── wasm-lz4.js    # WASM 包装器 (Node.js)
│   └── js-lz4.js      # 纯 JavaScript 实现
├── bin/
│   └── wasm-lz4.js    # 命令行工具
├── scripts/
│   └── benchmark.js   # 基准测试脚本
├── tests/
│   └── test.js        # 测试用例
├── build/             # WASM 编译输出目录
├── Makefile           # 构建脚本
├── package.json
└── README.md
```

## 算法原理

本实现基于 LZ77 算法原理，核心特性：

1. **哈希表匹配查找**：使用 65536 项哈希表快速定位重复序列
2. **最小匹配长度**：4 字节
3. **最大回溯距离**：65535 字节
4. **可变长度编码**：使用 token + 扩展字节方案编码长度

### 压缩格式

```
[token][literal length ext][literals...][offset][match length ext]
```

- **token (1字节)**: 高4位 = 字面量长度，低4位 = 匹配长度-4
- **offset (2字节)**: 匹配回溯距离 (小端序)
- **扩展字节**: 当长度 >= 15 时，使用 0xFF 续接

## 构建

### 前置要求

- Emscripten SDK (用于编译 WASM)
- Node.js >= 14.0.0

### 编译 WebAssembly

```bash
# 安装 Emscripten (如果未安装)
# 参考: https://emscripten.org/docs/getting_started/downloads.html

# 编译 WASM
npm run build:wasm
# 或
make
```

编译成功后将生成：
- `build/lz4.js` - Emscripten 运行时
- `build/lz4.wasm` - WebAssembly 模块

## 使用

### 命令行工具

```bash
# 压缩文件
node bin/wasm-lz4.js compress input.txt output.lz4

# 解压文件
node bin/wasm-lz4.js decompress input.lz4 output.txt

# 查看帮助
node bin/wasm-lz4.js --help
```

### API 使用

```javascript
const { compress, decompress } = require('./lib/wasm-lz4');

// 压缩
const input = Buffer.from('Hello, World! Hello, World!');
const compressed = await compress(input);

// 解压
const decompressed = await decompress(compressed);
console.log(decompressed.toString());
```

### 纯 JavaScript 版本

```javascript
const { compress, decompress } = require('./lib/js-lz4');

const input = Buffer.from('Test data');
const compressed = compress(input);
const decompressed = decompress(compressed);
```

## 测试

```bash
npm test
```

测试内容：
- 基本压缩/解压验证
- 小数据边界测试
- 随机数据测试
- 重复模式测试
- 大数据测试 (1MB)

## 基准测试

```bash
npm run benchmark
```

将生成：
- `benchmark.json` - 详细性能数据
- `benchmark_chart.html` - 可视化对比图表
- `benchmark_data/test_10mb.txt` - 测试数据

基准测试对比 WASM 与纯 JS 版本在 10MB 文本上的：
- 压缩/解压耗时
- 内存占用 (RSS)
- 压缩率

## 压缩率说明

本原创实现的压缩率略低于标准 LZ4 库，主要差异：
- 使用简化的哈希函数 (乘法哈希)
- 未实现最优解析 (lazy matching)
- 未支持 LZ4 帧格式
- 哈希表大小限制为 65536 项

## 许可证

MIT
