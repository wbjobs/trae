import express from 'express';
import { messageParser } from '../../../../parse-layer/message-parser/src';
import { store } from '../model/store';

export async function testParse(req: express.Request, res: express.Response) {
  const { schemaId, rawData } = req.body;
  const schema = store.getSchema(schemaId);
  
  if (schema) {
    messageParser.registerSchema(schema);
  }
  
  const result = messageParser.parse(rawData, schema?.protocolId ? store.getProtocol(schema.protocolId)?.type || 'unknown' : 'unknown', schemaId);
  
  if (result.success) {
    store.addParseLog(result);
  }
  
  res.json(result);
}
