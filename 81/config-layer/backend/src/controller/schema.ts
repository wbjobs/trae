import express from 'express';
import { store } from '../model/store';
import { validateSchema } from '../../../../common/utils';

export async function listSchemas(req: express.Request, res: express.Response) {
  const list = store.getSchemas();
  res.json({ list, total: list.length });
}

export async function getSchema(req: express.Request, res: express.Response) {
  const { id } = req.params;
  const schema = store.getSchema(id);
  if (!schema) {
    return res.status(404).json({ message: 'Schema not found' });
  }
  res.json(schema);
}

export async function createSchema(req: express.Request, res: express.Response) {
  const data = req.body;
  const schema = store.addSchema(data);
  res.status(201).json(schema);
}

export async function updateSchema(req: express.Request, res: express.Response) {
  const { id } = req.params;
  const data = req.body;
  const schema = store.updateSchema(id, data);
  if (!schema) {
    return res.status(404).json({ message: 'Schema not found' });
  }
  res.json(schema);
}

export async function deleteSchema(req: express.Request, res: express.Response) {
  const { id } = req.params;
  const success = store.deleteSchema(id);
  if (!success) {
    return res.status(404).json({ message: 'Schema not found' });
  }
  res.json({ message: 'Deleted successfully' });
}

export async function testParse(req: express.Request, res: express.Response) {
  const { schemaId, rawData } = req.body;
  const schema = store.getSchema(schemaId);
  if (!schema) {
    return res.status(404).json({ message: 'Schema not found' });
  }

  try {
    let parsedData: Record<string, any> = {};
    
    if (rawData.startsWith('{') || rawData.startsWith('[')) {
      parsedData = JSON.parse(rawData);
    } else {
      const buffer = Buffer.from(rawData, 'hex');
      let offset = 0;
      for (const field of schema.fields) {
        const length = field.length || 4;
        if (offset + length > buffer.length) break;
        
        const fieldBuffer = buffer.slice(offset, offset + length);
        switch (field.type) {
          case 'string':
            parsedData[field.name] = fieldBuffer.toString(field.encoding as BufferEncoding || 'utf8').replace(/\0/g, '');
            break;
          case 'number':
            parsedData[field.name] = length === 4 ? fieldBuffer.readInt32BE(0) : fieldBuffer.readInt16BE(0);
            break;
          case 'boolean':
            parsedData[field.name] = fieldBuffer[0] !== 0;
            break;
          default:
            parsedData[field.name] = fieldBuffer.toString('hex');
        }
        offset += length;
      }
    }

    const isValid = validateSchema(parsedData, schema);
    
    const result = {
      id: 'test',
      rawData,
      protocol: store.getProtocol(schema.protocolId)?.type || 'unknown',
      schemaId,
      timestamp: Date.now(),
      parsedData,
      success: isValid,
      error: isValid ? undefined : 'Schema validation failed'
    };

    res.json(result);
  } catch (error: any) {
    res.json({
      id: 'test',
      rawData,
      protocol: 'unknown',
      schemaId,
      timestamp: Date.now(),
      parsedData: {},
      success: false,
      error: error.message
    });
  }
}
