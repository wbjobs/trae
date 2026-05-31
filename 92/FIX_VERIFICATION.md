# 配置漂移检测假阳性问题修复验证

## 修复概述

修复了 `ConfigComparisonService` 中当配置值包含多行文本或特殊字符时出现假阳性漂移检测的问题。

## 问题场景

### 1. 多行文本换行符差异
**问题**：Windows（CRLF `\r\n`）与 Unix（LF `\n`）换行符导致相同内容被判定为不同
**示例**：
```yaml
# 服务A配置（LF）
description: |
  line1
  line2

# 服务B配置（CRLF）  
description: |
  line1\r\n
  line2\r\n
```
**修复**：统一规范化为 `\n`

### 2. 多行文本缩进差异
**问题**：YAML块标量的共同前置缩进导致假阳性
**修复**：自动去除多行文本的共同最小缩进

### 3. 特殊字符处理
**问题**：`!@#$%^&*()` 等特殊字符可能因编码或转义导致差异
**修复**：直接比较原始字符串内容，不做额外转义处理

### 4. 数值类型差异
**问题**：SnakeYAML可能将 `42` 解析为 `Integer` 或 `Long`
**修复**：比较数值大小而非类型

### 5. 浮点数精度
**问题**：`0.1 + 0.2 != 0.3` 的浮点精度问题
**修复**：使用 epsilon（1e-9）容差比较

### 6. 列表/Map深度比较
**问题**：原实现只比较引用，相同内容不同对象被判定为不同
**修复**：递归深度比较所有元素

## 核心修复代码

### `deepEquals()` 方法
- 字符串：规范化后逐字符比较
- 数值：统一比较数值大小
- 列表：递归逐元素深度比较
- Map：递归逐键值对深度比较

### `normalizeString()` 方法
- 统一换行符为 `\n`
- 去除多行文本共同前置缩进
- 去除多行文本首尾空白（保留空字符串）

### `compareNumbers()` 方法
- 浮点数使用 epsilon 容差
- 整数统一比较 longValue 或 intValue

## 测试覆盖

`ConfigComparisonServiceTest.java` 包含14个测试用例：

| 测试用例 | 验证场景 |
|---------|---------|
| `testMultilineTextWithDifferentLineEndings` | LF vs CRLF vs CR |
| `testMultilineTextWithLeadingTrailingWhitespace` | 多行文本首尾空白 |
| `testSpecialCharacters` | !@#$%^&*() 等特殊字符 |
| `testNumericTypeDifferences` | int/long/float/double 类型差异 |
| `testFloatingPointPrecision` | 浮点数精度问题 |
| `testListDeepComparison` | 列表深度比较 |
| `testListWithDifferentOrderIsDrift` | 列表顺序差异（应检测为漂移） |
| `testNestedMapDeepComparison` | 嵌套Map深度比较 |
| `testActualValueDifferenceIsDetected` | 真实差异应被检测 |
| `testAddedAndRemovedKeys` | 新增/删除key检测 |
| `testEmptyStringVsWhitespace` | 空字符串vs空白（应检测为漂移） |
| `testNullVsNonNullIsDrift` | null vs 非null |
| `testBooleanTypeDifferences` | boolean类型差异 |
| `testComplexMultilineYamlContent` | 复杂YAML内容 |
| `testUnicodeAndEmojiCharacters` | Unicode和emoji |

## 验证方法

### 1. 运行单元测试
```bash
mvn test -Dtest=ConfigComparisonServiceTest
```

### 2. 手动验证场景

**场景1：多行文本换行符差异**
```java
String baseline = "line1\nline2";
String current = "line1\r\nline2";
// 修复后：no drift
```

**场景2：特殊字符**
```java
String baseline = "P@ssw0rd!@#$%";
String current = "P@ssw0rd!@#$%";
// 修复后：no drift
```

**场景3：数值类型差异**
```java
int baseline = 42;
long current = 42L;
// 修复后：no drift
```

## 注意事项

1. **单行字符串首尾空白不处理**：避免误判真正的配置差异
2. **空字符串与空白字符串视为不同**：`""` vs `"   "` 会被检测为漂移
3. **列表顺序敏感**：`["a","b"]` vs `["b","a"]` 会被检测为漂移
4. **多行文本仅处理换行和缩进**：不改变内容语义

## 回归风险

- 低风险：所有修改都有测试覆盖
- 向后兼容：不改变API接口
- 性能影响：规范化和深度比较增加了少量计算开销
