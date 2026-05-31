import request from './request';
import type { ProtocolConfig, MessageSchema, RouteRule, Device, ParsedMessage, ForwardLog } from '@/types';

export interface ListResponse<T> {
  list: T[];
  total: number;
}

export function getProtocols(): Promise<ListResponse<ProtocolConfig>> {
  return request.get('/protocols');
}

export function getProtocol(id: string): Promise<ProtocolConfig> {
  return request.get(`/protocols/${id}`);
}

export function createProtocol(data: Omit<ProtocolConfig, 'id' | 'createdAt' | 'updatedAt'>): Promise<ProtocolConfig> {
  return request.post('/protocols', data);
}

export function updateProtocol(id: string, data: Partial<ProtocolConfig>): Promise<ProtocolConfig> {
  return request.put(`/protocols/${id}`, data);
}

export function deleteProtocol(id: string): Promise<void> {
  return request.delete(`/protocols/${id}`);
}

export function getSchemas(): Promise<ListResponse<MessageSchema>> {
  return request.get('/schemas');
}

export function getSchema(id: string): Promise<MessageSchema> {
  return request.get(`/schemas/${id}`);
}

export function createSchema(data: Omit<MessageSchema, 'id' | 'createdAt' | 'updatedAt'>): Promise<MessageSchema> {
  return request.post('/schemas', data);
}

export function updateSchema(id: string, data: Partial<MessageSchema>): Promise<MessageSchema> {
  return request.put(`/schemas/${id}`, data);
}

export function deleteSchema(id: string): Promise<void> {
  return request.delete(`/schemas/${id}`);
}

export function testParse(schemaId: string, rawData: string): Promise<ParsedMessage> {
  return request.post('/parser/test', { schemaId, rawData });
}

export function getRouteRules(): Promise<ListResponse<RouteRule>> {
  return request.get('/routes');
}

export function getRouteRule(id: string): Promise<RouteRule> {
  return request.get(`/routes/${id}`);
}

export function createRouteRule(data: Omit<RouteRule, 'id' | 'createdAt' | 'updatedAt'>): Promise<RouteRule> {
  return request.post('/routes', data);
}

export function updateRouteRule(id: string, data: Partial<RouteRule>): Promise<RouteRule> {
  return request.put(`/routes/${id}`, data);
}

export function deleteRouteRule(id: string): Promise<void> {
  return request.delete(`/routes/${id}`);
}

export function getDevices(): Promise<ListResponse<Device>> {
  return request.get('/devices');
}

export function getDevice(id: string): Promise<Device> {
  return request.get(`/devices/${id}`);
}

export function createDevice(data: Omit<Device, 'id' | 'createdAt' | 'updatedAt'>): Promise<Device> {
  return request.post('/devices', data);
}

export function updateDevice(id: string, data: Partial<Device>): Promise<Device> {
  return request.put(`/devices/${id}`, data);
}

export function deleteDevice(id: string): Promise<void> {
  return request.delete(`/devices/${id}`);
}

export function sendCommand(deviceId: string, command: string): Promise<void> {
  return request.post(`/devices/${id}/command`, { command });
}

export function getParseLogs(params: { page?: number; pageSize?: number; protocol?: string }): Promise<ListResponse<ParsedMessage>> {
  return request.get('/logs/parse', { params });
}

export function getForwardLogs(params: { page?: number; pageSize?: number }): Promise<ListResponse<ForwardLog>> {
  return request.get('/logs/forward', { params });
}

export function getStatistics(): Promise<{
  totalDevices: number;
  onlineDevices: number;
  totalMessages: number;
  todayMessages: number;
  protocols: number;
  routes: number;
}> {
  return request.get('/statistics');
}
