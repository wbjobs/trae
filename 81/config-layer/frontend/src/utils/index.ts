export function generateId(): string {
  return Date.now().toString(36) + Math.random().toString(36).substr(2);
}

export function formatDate(timestamp: number): string {
  return new Date(timestamp).toLocaleString('zh-CN');
}

export function bufferToHex(buffer: ArrayBuffer | Uint8Array): string {
  return Array.from(new Uint8Array(buffer))
    .map(b => b.toString(16).padStart(2, '0'))
    .join('');
}

export function hexToBuffer(hex: string): Uint8Array {
  const bytes = [];
  for (let i = 0; i < hex.length; i += 2) {
    bytes.push(parseInt(hex.substr(i, 2), 16));
  }
  return new Uint8Array(bytes);
}

export function deepClone<T>(obj: T): T {
  return JSON.parse(JSON.stringify(obj));
}

export function debounce<T extends (...args: any[]) => any>(
  fn: T,
  delay: number
): (...args: Parameters<T>) => void {
  let timer: any;
  return (...args: Parameters<T>) => {
    clearTimeout(timer);
    timer = setTimeout(() => fn(...args), delay);
  };
}

export function validateSchema(data: any, schema: any): boolean {
  try {
    for (const field of schema.fields) {
      if (field.required && !(field.name in data)) {
        return false;
      }
      if (field.name in data) {
        const value = data[field.name];
        switch (field.type) {
          case 'string':
            if (typeof value !== 'string') return false;
            break;
          case 'number':
            if (typeof value !== 'number') return false;
            break;
          case 'boolean':
            if (typeof value !== 'boolean') return false;
            break;
          case 'object':
            if (typeof value !== 'object' || value === null) return false;
            if (field.children && !validateSchema(value, { fields: field.children })) {
              return false;
            }
            break;
        }
      }
    }
    return true;
  } catch {
    return false;
  }
}

export const protocolTypes = ['MQTT', 'HTTP', 'TCP', 'UDP', 'WebSocket', 'Modbus', 'BACnet'];

export const fieldTypes = [
  { value: 'string', label: '字符串' },
  { value: 'number', label: '数字' },
  { value: 'boolean', label: '布尔' },
  { value: 'binary', label: '二进制' },
  { value: 'object', label: '对象' },
  { value: 'array', label: '数组' }
];

export const conditionTypes = [
  { value: 'protocol', label: '协议' },
  { value: 'topic', label: '主题' },
  { value: 'content', label: '内容' },
  { value: 'device', label: '设备' },
  { value: 'time', label: '时间' }
];

export const operators = [
  { value: 'eq', label: '等于' },
  { value: 'ne', label: '不等于' },
  { value: 'contains', label: '包含' },
  { value: 'regex', label: '正则匹配' },
  { value: 'gt', label: '大于' },
  { value: 'lt', label: '小于' }
];

export const targetTypes = [
  { value: 'device', label: '设备' },
  { value: 'group', label: '设备组' },
  { value: 'topic', label: '主题' },
  { value: 'webhook', label: 'Webhook' }
];
