<template>
  <div class="protocol-viewer">
    <el-collapse v-model="activeNames" class="protocol-collapse">
      <el-collapse-item name="raw" class="collapse-item">
        <template #title>
          <div class="collapse-title">
            <el-icon><DataLine /></el-icon>
            <span>原始二进制数据</span>
            <el-tag size="small" type="info">{{ rawDataSize }} 字节</el-tag>
          </div>
        </template>
        <div class="raw-data-container">
          <div class="hex-viewer">
            <div class="hex-header">
              <span class="offset">偏移</span>
              <span class="bytes">字节 (Hex)</span>
              <span class="ascii">ASCII</span>
            </div>
            <div class="hex-body">
              <div v-for="(row, idx) in hexRows" :key="idx" class="hex-row">
                <span class="offset">{{ formatOffset(idx * 16) }}</span>
                <span class="bytes">
                  <span
                    v-for="(byte, bIdx) in row.bytes"
                    :key="bIdx"
                    class="byte"
                    :class="{ highlight: isHighlightedByte(idx * 16 + bIdx) }"
                  >
                    {{ byte }}
                  </span>
                  <span v-if="row.bytes.length < 16" class="padding">
                    {{ '   '.repeat(16 - row.bytes.length) }}
                  </span>
                </span>
                <span class="ascii">{{ row.ascii }}</span>
              </div>
            </div>
          </div>
        </div>
      </el-collapse-item>

      <el-collapse-item name="parsed" class="collapse-item">
        <template #title>
          <div class="collapse-title">
            <el-icon><DocumentCopy /></el-icon>
            <span>解析后数据</span>
            <el-tag v-if="protocolData" size="small" :type="parseSuccess ? 'success' : 'danger'">
              {{ parseSuccess ? '解析成功' : '解析失败' }}
            </el-tag>
          </div>
        </template>
        <div v-if="protocolData" class="parsed-data">
          <el-descriptions :column="2" border size="small">
            <el-descriptions-item label="协议头">
              <el-tag type="primary">{{ formatHex(protocolData.header) }}</el-tag>
            </el-descriptions-item>
            <el-descriptions-item label="消息类型">
              <el-tag :type="getMsgTypeTagType(protocolData.msgType)">
                {{ getMsgTypeName(protocolData.msgType) }}
              </el-tag>
            </el-descriptions-item>
            <el-descriptions-item label="设备ID">
              {{ protocolData.deviceId || '-' }}
            </el-descriptions-item>
            <el-descriptions-item label="消息长度">
              {{ protocolData.msgLen || 0 }} 字节
            </el-descriptions-item>
            <el-descriptions-item label="CRC校验">
              <el-tag :type="protocolData.crcValid ? 'success' : 'danger'">
                {{ protocolData.crcValid ? '通过' : '失败' }}
              </el-tag>
            </el-descriptions-item>
            <el-descriptions-item label="协议尾">
              <el-tag type="primary">{{ formatHex(protocolData.tail) }}</el-tag>
            </el-descriptions-item>
            <el-descriptions-item label="时间戳" :span="2">
              {{ formatTime(protocolData.timestamp) }}
            </el-descriptions-item>
          </el-descriptions>

          <div v-if="protocolData.payload" class="payload-section">
            <h4>负载数据</h4>
            <pre class="json-viewer" v-if="typeof protocolData.payload === 'object'">
              {{ JSON.stringify(protocolData.payload, null, 2) }}
            </pre>
            <div v-else class="payload-raw">
              {{ protocolData.payload }}
            </div>
          </div>
        </div>
        <el-empty v-else description="暂无解析数据" />
      </el-collapse-item>

      <el-collapse-item name="structure" class="collapse-item">
        <template #title>
          <div class="collapse-title">
            <el-icon><Grid /></el-icon>
            <span>协议结构说明</span>
          </div>
        </template>
        <div class="protocol-structure">
          <div class="structure-diagram">
            <div
              v-for="(field, idx) in protocolStructure"
              :key="idx"
              class="structure-field"
              :style="{ width: field.width + '%' }"
            >
              <div class="field-name">{{ field.name }}</div>
              <div class="field-bytes">{{ field.bytes }} 字节</div>
              <div class="field-desc">{{ field.description }}</div>
            </div>
          </div>

          <el-table :data="protocolStructure" size="small" border>
            <el-table-column prop="name" label="字段名" width="120" />
            <el-table-column prop="bytes" label="字节数" width="80" align="center" />
            <el-table-column prop="offset" label="偏移" width="80" align="center" />
            <el-table-column prop="description" label="说明" />
            <el-table-column label="示例值" width="140">
              <template #default="{ row }">
                <el-tag size="small" type="info">{{ getSampleValue(row.name) }}</el-tag>
              </template>
            </el-table-column>
          </el-table>
        </div>
      </el-collapse-item>

      <el-collapse-item name="log" class="collapse-item">
        <template #title>
          <div class="collapse-title">
            <el-icon><Tickets /></el-icon>
            <span>通信日志</span>
            <el-badge :value="logs.length" :max="99" class="log-badge" />
          </div>
        </template>
        <div class="communication-log">
          <div class="log-toolbar">
            <el-button size="small" @click="clearLogs">清空日志</el-button>
            <el-button size="small" type="primary" @click="exportLogs">导出日志</el-button>
          </div>
          <div class="log-list" ref="logListRef">
            <div
              v-for="(log, idx) in logs"
              :key="idx"
              class="log-item"
              :class="log.direction"
            >
              <div class="log-header">
                <el-tag size="small" :type="log.direction === 'send' ? 'success' : 'primary'">
                  {{ log.direction === 'send' ? '发送' : '接收' }}
                </el-tag>
                <span class="log-time">{{ formatTime(log.timestamp) }}</span>
                <span class="log-device">{{ log.deviceId }}</span>
              </div>
              <div class="log-content">
                <span class="log-type">{{ getMsgTypeName(log.msgType) }}</span>
                <span class="log-data">{{ truncateData(log.data) }}</span>
              </div>
            </div>
            <el-empty v-if="logs.length === 0" description="暂无通信日志" />
          </div>
        </div>
      </el-collapse-item>
    </el-collapse>
  </div>
</template>

<script setup>
import { ref, computed, watch, nextTick } from 'vue'
import { ElMessage } from 'element-plus'

const props = defineProps({
  rawData: {
    type: [Buffer, Array, String],
    default: null
  },
  protocolData: {
    type: Object,
    default: null
  },
  deviceId: {
    type: String,
    default: ''
  }
})

const emit = defineEmits(['parse', 'export'])

const activeNames = ref(['raw', 'parsed'])
const logs = ref([])
const logListRef = ref(null)

const MSG_TYPE = {
  0x0001: { name: '心跳包', type: 'info' },
  0x0002: { name: '数据上报', type: 'success' },
  0x0003: { name: '设备状态', type: 'primary' },
  0x0004: { name: '告警', type: 'warning' },
  0x0005: { name: '控制命令', type: 'danger' },
  0x0006: { name: '控制应答', type: 'success' },
  0x0007: { name: '注册', type: 'primary' },
  0x0008: { name: '注册应答', type: 'success' }
}

const protocolStructure = [
  { name: 'Header', bytes: 2, offset: 0, width: 12, description: '协议头，固定 0xAA55' },
  { name: 'MsgType', bytes: 2, offset: 2, width: 12, description: '消息类型' },
  { name: 'MsgLen', bytes: 4, offset: 4, width: 20, description: '消息体长度' },
  { name: 'DeviceIdLen', bytes: 1, offset: 8, width: 10, description: '设备ID长度' },
  { name: 'DeviceId', bytes: 'N', offset: 9, width: 20, description: '设备ID' },
  { name: 'Payload', bytes: 'M', offset: '9+N', width: 15, description: '负载数据' },
  { name: 'CRC', bytes: 2, offset: '9+N+M', width: 8, description: 'CRC16 校验' },
  { name: 'Tail', bytes: 2, offset: '11+N+M', width: 12, description: '协议尾，固定 0x55AA' }
]

const rawDataSize = computed(() => {
  if (!props.rawData) return 0
  if (Buffer.isBuffer(props.rawData)) return props.rawData.length
  if (Array.isArray(props.rawData)) return props.rawData.length
  if (typeof props.rawData === 'string') return Math.ceil(props.rawData.length / 2)
  return 0
})

const parseSuccess = computed(() => {
  return props.protocolData && props.protocolData.header === 0xAA55 && props.protocolData.tail === 0x55AA
})

const hexRows = computed(() => {
  if (!props.rawData) return []
  
  let bytes = []
  if (Buffer.isBuffer(props.rawData)) {
    bytes = Array.from(props.rawData)
  } else if (Array.isArray(props.rawData)) {
    bytes = props.rawData
  } else if (typeof props.rawData === 'string') {
    const hex = props.rawData.replace(/\s/g, '')
    for (let i = 0; i < hex.length; i += 2) {
      bytes.push(parseInt(hex.substr(i, 2), 16))
    }
  }

  const rows = []
  for (let i = 0; i < bytes.length; i += 16) {
    const rowBytes = bytes.slice(i, i + 16)
    rows.push({
      bytes: rowBytes.map(b => b.toString(16).padStart(2, '0').toUpperCase()),
      ascii: rowBytes.map(b => (b >= 32 && b <= 126) ? String.fromCharCode(b) : '.').join('')
    })
  }
  return rows
})

const formatOffset = (offset) => {
  return offset.toString(16).padStart(8, '0').toUpperCase()
}

const formatHex = (value) => {
  if (value === undefined || value === null) return '-'
  return '0x' + value.toString(16).toUpperCase().padStart(4, '0')
}

const formatTime = (timestamp) => {
  if (!timestamp) return '-'
  return new Date(timestamp).toLocaleString('zh-CN')
}

const getMsgTypeName = (msgType) => {
  return MSG_TYPE[msgType]?.name || `未知 (0x${msgType?.toString(16)})`
}

const getMsgTypeTagType = (msgType) => {
  return MSG_TYPE[msgType]?.type || 'info'
}

const getSampleValue = (fieldName) => {
  const samples = {
    'Header': '0xAA55',
    'MsgType': '0x0002',
    'MsgLen': '0x00000020',
    'DeviceIdLen': '0x10',
    'DeviceId': 'DEV001',
    'Payload': '{...}',
    'CRC': '0x1234',
    'Tail': '0x55AA'
  }
  return samples[fieldName] || '-'
}

const isHighlightedByte = (index) => {
  return index < 4 || index >= rawDataSize.value - 4
}

const truncateData = (data) => {
  if (!data) return ''
  const str = typeof data === 'string' ? data : JSON.stringify(data)
  return str.length > 50 ? str.substring(0, 50) + '...' : str
}

const addLog = (log) => {
  logs.value.push({
    ...log,
    timestamp: Date.now()
  })
  if (logs.value.length > 100) {
    logs.value.shift()
  }
  nextTick(() => {
    if (logListRef.value) {
      logListRef.value.scrollTop = logListRef.value.scrollHeight
    }
  })
}

const clearLogs = () => {
  logs.value = []
  ElMessage.success('日志已清空')
}

const exportLogs = () => {
  const content = logs.value.map(log => 
    `[${formatTime(log.timestamp)}] [${log.direction === 'send' ? '发送' : '接收'}] [${log.deviceId}] ${getMsgTypeName(log.msgType)}: ${JSON.stringify(log.data)}`
  ).join('\n')
  
  const blob = new Blob([content], { type: 'text/plain' })
  const url = URL.createObjectURL(blob)
  const a = document.createElement('a')
  a.href = url
  a.download = `protocol-log-${Date.now()}.txt`
  a.click()
  URL.revokeObjectURL(url)
  ElMessage.success('日志已导出')
}

defineExpose({
  addLog,
  clearLogs
})
</script>

<style lang="scss" scoped>
.protocol-viewer {
  .protocol-collapse {
    border: none;

    :deep(.el-collapse-item) {
      border: 1px solid #e4e7ed;
      border-radius: 8px;
      margin-bottom: 12px;
      overflow: hidden;

      .el-collapse-item__header {
        background: #f5f7fa;
        padding: 0 16px;
        border-bottom: none;

        &:hover {
          background: #ecf5ff;
        }
      }

      .el-collapse-item__wrap {
        border-top: 1px solid #e4e7ed;
      }

      .el-collapse-item__content {
        padding: 16px;
      }
    }
  }

  .collapse-title {
    display: flex;
    align-items: center;
    gap: 8px;
    font-weight: 500;
  }

  .raw-data-container {
    .hex-viewer {
      background: #1e1e1e;
      border-radius: 8px;
      overflow: hidden;
      font-family: 'Consolas', 'Monaco', monospace;
      font-size: 13px;

      .hex-header {
        display: flex;
        background: #2d2d30;
        padding: 8px 16px;
        color: #858585;
        font-weight: 600;

        .offset { width: 100px; }
        .bytes { flex: 1; letter-spacing: 2px; }
        .ascii { width: 150px; padding-left: 20px; }
      }

      .hex-body {
        max-height: 300px;
        overflow: auto;
        padding: 8px 0;

        .hex-row {
          display: flex;
          padding: 2px 16px;
          color: #d4d4d4;

          &:hover {
            background: #2a2d2e;
          }

          .offset {
            width: 100px;
            color: #569cd6;
          }

          .bytes {
            flex: 1;
            letter-spacing: 2px;

            .byte {
              display: inline-block;
              width: 24px;
              color: #ce9178;

              &.highlight {
                color: #4ec9b0;
                font-weight: bold;
              }
            }
          }

          .ascii {
            width: 150px;
            padding-left: 20px;
            color: #dcdcaa;
          }
        }
      }
    }
  }

  .parsed-data {
    .payload-section {
      margin-top: 20px;

      h4 {
        margin: 0 0 12px;
        font-size: 14px;
        color: #303133;
      }

      .json-viewer {
        background: #f5f7fa;
        padding: 16px;
        border-radius: 8px;
        font-family: 'Consolas', monospace;
        font-size: 13px;
        max-height: 300px;
        overflow: auto;
      }

      .payload-raw {
        background: #f5f7fa;
        padding: 16px;
        border-radius: 8px;
        font-family: 'Consolas', monospace;
        font-size: 13px;
        word-break: break-all;
      }
    }
  }

  .protocol-structure {
    .structure-diagram {
      display: flex;
      margin-bottom: 20px;
      background: #f5f7fa;
      border-radius: 8px;
      overflow: hidden;

      .structure-field {
        padding: 12px 8px;
        text-align: center;
        border-right: 1px solid #e4e7ed;

        &:last-child {
          border-right: none;
        }

        .field-name {
          font-weight: 600;
          color: #409eff;
          margin-bottom: 4px;
        }

        .field-bytes {
          font-size: 12px;
          color: #909399;
          margin-bottom: 4px;
        }

        .field-desc {
          font-size: 12px;
          color: #606266;
        }
      }
    }
  }

  .communication-log {
    .log-toolbar {
      display: flex;
      gap: 8px;
      margin-bottom: 12px;
    }

    .log-list {
      max-height: 400px;
      overflow: auto;
      border: 1px solid #e4e7ed;
      border-radius: 8px;

      .log-item {
        padding: 12px 16px;
        border-bottom: 1px solid #e4e7ed;

        &:last-child {
          border-bottom: none;
        }

        &.send {
          background: #f0f9eb;
        }

        &.receive {
          background: #ecf5ff;
        }

        .log-header {
          display: flex;
          align-items: center;
          gap: 12px;
          margin-bottom: 8px;

          .log-time {
            font-size: 12px;
            color: #909399;
          }

          .log-device {
            font-size: 12px;
            color: #409eff;
          }
        }

        .log-content {
          display: flex;
          gap: 12px;

          .log-type {
            font-weight: 500;
            color: #303133;
          }

          .log-data {
            font-family: 'Consolas', monospace;
            font-size: 12px;
            color: #606266;
            word-break: break-all;
          }
        }
      }
    }
  }
}
</style>
