# mp4_sei - MP4 SEI 数据注入工具

一个使用 Rust 开发的命令行工具，用于解析 MP4 文件并在 H.264/H.265 视频码流中注入自定义 SEI（Supplemental Enhancement Information）数据，无需重新编码视频。

## 功能特性

- ✅ 解析 MP4 文件结构，显示详细信息
- ✅ 提取 H.264/H.265 原始码流
- ✅ 支持在 SEI 帧中注入自定义二进制数据（如用户 ID、时间戳等）
- ✅ **SEI 水印盲提取** - 无需原始文件即可扫描并恢复 SEI 数据
- ✅ **无损验证** - 生成验证报告，对比视频内容 hash 确认无损
- ✅ 保持原始 PTS/DTS 时间戳不变
- ✅ 支持 H.264 (AVC) 和 H.265 (HEVC) 编码
- ✅ 无需重新编码，处理速度快
- ✅ 支持批量注入（每个关键帧或每 N 帧）

## 构建

```bash
cargo build --release
```

## 使用方法

### 1. 查看 MP4 文件信息

```bash
mp4_sei info --input input.mp4
```

显示文件结构、轨道信息、编码格式、帧数等详细信息。

### 2. 提取原始码流

```bash
mp4_sei extract --input input.mp4 --output output.h264
```

将 MP4 中的视频码流提取为原始 Annex B 格式文件。

### 3. 注入自定义 SEI 数据

```bash
# 在每个关键帧注入十六进制数据
mp4_sei inject --input input.mp4 --output output.mp4 --data "48656C6C6F"

# 每 10 帧注入一次
mp4_sei inject --input input.mp4 --output output.mp4 --data "48656C6C6F" --every 10
```

### 4. 注入用户 ID 和时间戳

```bash
# 使用当前时间戳
mp4_sei inject-user --input input.mp4 --output output.mp4 --user-id 12345

# 指定时间戳
mp4_sei inject-user --input input.mp4 --output output.mp4 --user-id 12345 --timestamp 1715000000
```

## 技术原理

### MP4 文件结构解析

工具解析 MP4 的 Box 层次结构：
- `moov` - Movie box，包含元数据
  - `trak` - Track box，每个轨道一个
    - `mdia` - Media box
      - `minf` - Media information box
        - `stbl` - Sample table box，包含：
          - `stsd` - Sample descriptions（编码格式）
          - `stts` - Decoding time to sample（时间戳）
          - `stss` - Sync samples（关键帧）
          - `stsc` - Sample to chunk（块映射）
          - `stsz` - Sample sizes（样本大小）
          - `stco`/`co64` - Chunk offsets（数据偏移）
- `mdat` - Media data box，实际音视频数据

### SEI 注入流程

1. 解析 MP4 文件，获取所有样本信息
2. 定位视频轨道的样本数据
3. 在选定的样本（关键帧或每 N 帧）前插入 SEI NAL 单元
4. 更新样本大小表 (`stsz`)
5. 更新块偏移表 (`stco`/`co64`)
6. 重建 `moov` box 并写入新文件
7. 写入修改后的 `mdat` 数据

### SEI 数据格式

#### H.264 SEI NAL 单元

```
+-------------+
| NAL Header |  (0x06)
+-------------+
|  SEI Type  |  (0x05 - user_data_unregistered)
+-------------+
| SEI Length |  (payload length)
+-------------+
|  Payload   |  (custom data)
+-------------+
| RBSP Stop  |  (0x80)
+-------------+
```

#### H.265 SEI NAL 单元

```
+-------------+-------------+
|  NAL Header (2 bytes)    |  (type 39 - PREFIX_SEI)
+-------------+-------------+
|  SEI Type  |  (0x05 - user_data_unregistered)
+-------------+
| SEI Length |  (payload length)
+-------------+
|  Payload   |  (custom data)
+-------------+
| RBSP Stop  |  (0x80)
+-------------+
```

### SEI 盲提取原理

1. 解析 MP4 文件，遍历所有视频样本
2. 对每个样本，拆分 AVCC 格式的 NAL 单元
3. 识别 SEI NAL 单元（H.264 type=6, H.265 type=39/40）
4. 解析 SEI payload，提取原始数据
5. 自动识别用户 ID + 时间戳格式（16字节 payload）

### 无损验证原理

1. 计算原始文件和修改后文件的完整 MD5 hash
2. 分别计算两个文件的**视频内容 hash**（排除 SEI NALU）
3. 视频内容 hash 计算方法：
   - 对每个视频样本，拆分 NAL 单元
   - 跳过 SEI NAL 单元，仅对视频编码数据进行 hash
   - 同时包含 PTS/DTS 时间戳以确保时序一致
4. 如果视频内容 hash 匹配，说明 SEI 注入完全无损

#### 验证报告示例

```
Verification Report
===================
Original file: original.mp4
Modified file: modified.mp4

File Hashes:
  Original MD5: a1b2c3d4e5f6...
  Modified MD5: f6e5d4c3b2a1...
  Files differ: true

Video Content Hashes (excluding SEI NALUs):
  Original: 1234567890abcdef...
  Modified: 1234567890abcdef...
  Match: true

SEI Analysis:
  SEI payloads in modified file: 42

Result: ✅ LOSSLESS - Video content is unchanged
```

## 项目结构

```
src/
├── main.rs              # 命令行入口
├── error.rs             # 错误类型定义
├── mp4/
│   ├── mod.rs           # MP4 文件主解析模块
│   ├── boxes.rs         # Box 类型定义和解析
│   └── stbl.rs          # Sample table 解析
├── h26x.rs              # H.264/H.265 码流处理
└── sei_injector.rs      # SEI 注入核心逻辑
```

## 依赖

- `clap` - 命令行参数解析
- `byteorder` - 大端字节序处理
- `anyhow` / `thiserror` - 错误处理
- `hex` - 十六进制编解码

## 注意事项

1. 目前仅支持 AVCC 格式的 MP4（大多数播放器和编辑器使用的格式）
2. 注入 SEI 数据会略微增加文件大小
3. 确保输出文件有足够的磁盘空间
4. 建议在重要文件上操作前先备份

## License

MIT
