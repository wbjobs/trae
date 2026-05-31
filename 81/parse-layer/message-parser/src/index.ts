import type { MessageSchema, MessageField, ParsedMessage } from '../../../common/types';
import { generateId, validateSchema } from '../../../common/utils';
import { parseResultCache } from '../../cache-pool/src';

export class MessageParser {
  private schemas: Map<string, MessageSchema> = new Map();
  private enableCache = true;

  registerSchema(schema: MessageSchema): void {
    this.schemas.set(schema.id, schema);
  }

  unregisterSchema(schemaId: string): void {
    this.schemas.delete(schemaId);
  }

  getSchema(schemaId: string): MessageSchema | undefined {
    return this.schemas.get(schemaId);
  }

  parse(rawData: string, protocol: string, schemaId?: string, deviceId?: string): ParsedMessage {
    if (this.enableCache) {
      const cached = parseResultCache.get(rawData, protocol, schemaId);
      if (cached) {
        return { ...cached, deviceId: deviceId || cached.deviceId };
      }
    }

    const timestamp = Date.now();
    
    try {
      let parsedData: Record<string, any> = {};
      let usedSchemaId = schemaId;

      if (schemaId) {
        const schema = this.schemas.get(schemaId);
        if (schema) {
          parsedData = this.parseWithSchema(rawData, schema);
          const isValid = validateSchema(parsedData, schema);
          if (!isValid) {
            throw new Error('Schema validation failed');
          }
        } else {
          throw new Error(`Schema not found: ${schemaId}`);
        }
      } else {
        parsedData = this.autoParse(rawData, protocol);
      }

      const result: ParsedMessage = {
        id: generateId(),
        rawData,
        protocol,
        deviceId,
        timestamp,
        parsedData,
        schemaId: usedSchemaId,
        success: true
      };

      if (this.enableCache && result.success) {
        parseResultCache.put(result);
      }

      return result;
    } catch (error: any) {
      const result: ParsedMessage = {
        id: generateId(),
        rawData,
        protocol,
        deviceId,
        timestamp,
        parsedData: {},
        schemaId,
        success: false,
        error: error.message
      };
      return result;
    }
  }

  setCacheEnabled(enabled: boolean): void {
    this.enableCache = enabled;
  }

  getCacheStats() {
    return parseResultCache.getStats();
  }

  private parseWithSchema(rawData: string, schema: MessageSchema): Record<string, any> {
    if (rawData.startsWith('{') || rawData.startsWith('[')) {
      return JSON.parse(rawData);
    }

    const buffer = Buffer.from(rawData, 'hex');
    const result: Record<string, any> = {};
    let offset = schema.headerPattern ? Buffer.byteLength(schema.headerPattern) : 0;

    for (const field of schema.fields) {
      if (offset >= buffer.length) break;
      
      const fieldLength = field.length || this.getFieldDefaultLength(field);
      const endOffset = Math.min(offset + fieldLength, buffer.length);
      const fieldBuffer = buffer.slice(offset, endOffset);
      
      result[field.name] = this.parseField(fieldBuffer, field);
      offset += fieldLength;

      if (field.children && field.type === 'object') {
        result[field.name] = {};
        for (const child of field.children) {
          const childLength = child.length || this.getFieldDefaultLength(child);
          const childEnd = Math.min(offset + childLength, buffer.length);
          const childBuffer = buffer.slice(offset, childEnd);
          result[field.name][child.name] = this.parseField(childBuffer, child);
          offset += childLength;
        }
      }
    }

    return result;
  }

  private parseField(buffer: Buffer, field: MessageField): any {
    const encoding = (field.encoding as BufferEncoding) || 'utf8';
    
    switch (field.type) {
      case 'string':
        return buffer.toString(encoding).replace(/\0/g, '').trim();
      case 'number':
        if (buffer.length >= 4) return buffer.readInt32BE(0);
        if (buffer.length >= 2) return buffer.readInt16BE(0);
        return buffer.readInt8(0);
      case 'boolean':
        return buffer[0] !== 0;
      case 'binary':
        return buffer.toString('hex');
      case 'array':
        return buffer.toJSON().data;
      case 'object':
        return {};
      default:
        return buffer.toString(encoding);
    }
  }

  private getFieldDefaultLength(field: MessageField): number {
    switch (field.type) {
      case 'number': return 4;
      case 'boolean': return 1;
      case 'binary': return 8;
      default: return 32;
    }
  }

  private autoParse(rawData: string, protocol: string): Record<string, any> {
    try {
      if (rawData.startsWith('{') || rawData.startsWith('[')) {
        return JSON.parse(rawData);
      }
    } catch {}

    try {
      const buffer = Buffer.from(rawData, 'hex');
      return {
        hex: rawData,
        length: buffer.length,
        ascii: buffer.toString('ascii'),
        utf8: buffer.toString('utf8')
      };
    } catch {
      return { raw: rawData };
    }
  }

  serialize(data: Record<string, any>, schemaId: string): string {
    const schema = this.schemas.get(schemaId);
    if (!schema) {
      return JSON.stringify(data);
    }

    const buffers: Buffer[] = [];
    
    if (schema.headerPattern) {
      buffers.push(Buffer.from(schema.headerPattern));
    }

    for (const field of schema.fields) {
      const value = data[field.name] ?? field.defaultValue;
      buffers.push(this.serializeField(value, field));
    }

    if (schema.footerPattern) {
      buffers.push(Buffer.from(schema.footerPattern));
    }

    return Buffer.concat(buffers).toString('hex');
  }

  private serializeField(value: any, field: MessageField): Buffer {
    const length = field.length || this.getFieldDefaultLength(field);
    const buffer = Buffer.alloc(length);
    
    switch (field.type) {
      case 'string':
        buffer.write(String(value || ''), 0, length, field.encoding as BufferEncoding || 'utf8');
        break;
      case 'number':
        if (length >= 4) buffer.writeInt32BE(Number(value) || 0, 0);
        else if (length >= 2) buffer.writeInt16BE(Number(value) || 0, 0);
        else buffer.writeInt8(Number(value) || 0, 0);
        break;
      case 'boolean':
        buffer[0] = value ? 1 : 0;
        break;
      case 'binary':
        Buffer.from(String(value || ''), 'hex').copy(buffer);
        break;
    }
    
    return buffer;
  }
}

export const messageParser = new MessageParser();
