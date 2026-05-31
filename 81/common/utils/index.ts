export function generateId(): string {
  return Date.now().toString(36) + Math.random().toString(36).substr(2);
}

export function formatDate(timestamp: number): string {
  return new Date(timestamp).toLocaleString('zh-CN');
}

export function bufferToHex(buffer: Buffer | Uint8Array): string {
  return Buffer.from(buffer).toString('hex');
}

export function hexToBuffer(hex: string): Buffer {
  return Buffer.from(hex, 'hex');
}

export function deepClone<T>(obj: T): T {
  return JSON.parse(JSON.stringify(obj));
}

export function debounce<T extends (...args: any[]) => any>(
  fn: T,
  delay: number
): (...args: Parameters<T>) => void {
  let timer: NodeJS.Timeout;
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
