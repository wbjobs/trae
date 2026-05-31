import { EventEmitter } from 'events';
import type { Device } from '../../../common/types';
import { generateId } from '../../../common/utils';

export class DeviceManager extends EventEmitter {
  private devices: Map<string, Device> = new Map();
  private deviceGroups: Map<string, Set<string>> = new Map();
  private deviceStatus: Map<string, { lastSeen: number; status: Device['status'] }> = new Map();
  private heartbeatTimeout = 2 * 60 * 1000;
  private checkInterval: NodeJS.Timeout;

  constructor() {
    super();
    this.checkInterval = setInterval(() => this.checkDeviceStatus(), 30000);
  }

  registerDevice(device: Omit<Device, 'id' | 'createdAt' | 'updatedAt'>): Device {
    const now = Date.now();
    const newDevice: Device = {
      ...device,
      id: generateId(),
      createdAt: now,
      updatedAt: now
    };
    
    this.devices.set(newDevice.id, newDevice);
    this.deviceStatus.set(newDevice.id, { lastSeen: now, status: newDevice.status });
    
    this.emit('deviceRegistered', newDevice);
    console.log(`[DeviceManager] Registered device: ${newDevice.name} (${newDevice.id})`);
    
    return newDevice;
  }

  unregisterDevice(deviceId: string): boolean {
    const device = this.devices.get(deviceId);
    if (!device) return false;
    
    this.devices.delete(deviceId);
    this.deviceStatus.delete(deviceId);
    
    for (const [groupId, devices] of this.deviceGroups) {
      devices.delete(deviceId);
    }
    
    this.emit('deviceUnregistered', deviceId);
    console.log(`[DeviceManager] Unregistered device: ${deviceId}`);
    
    return true;
  }

  updateDevice(deviceId: string, data: Partial<Device>): Device | undefined {
    const device = this.devices.get(deviceId);
    if (!device) return undefined;
    
    const updated: Device = {
      ...device,
      ...data,
      updatedAt: Date.now()
    };
    
    this.devices.set(deviceId, updated);
    this.emit('deviceUpdated', updated);
    
    return updated;
  }

  getDevice(deviceId: string): Device | undefined {
    return this.devices.get(deviceId);
  }

  listDevices(filters?: {
    type?: string;
    protocol?: string;
    status?: Device['status'];
  }): Device[] {
    let devices = Array.from(this.devices.values());
    
    if (filters?.type) {
      devices = devices.filter(d => d.type === filters.type);
    }
    if (filters?.protocol) {
      devices = devices.filter(d => d.protocol === filters.protocol);
    }
    if (filters?.status) {
      devices = devices.filter(d => d.status === filters.status);
    }
    
    return devices;
  }

  heartbeat(deviceId: string): void {
    const status = this.deviceStatus.get(deviceId);
    if (status) {
      status.lastSeen = Date.now();
      status.status = 'online';
      this.updateDevice(deviceId, { status: 'online', lastHeartbeat: Date.now() });
      this.emit('deviceHeartbeat', deviceId);
    }
  }

  setDeviceStatus(deviceId: string, status: Device['status']): void {
    const device = this.devices.get(deviceId);
    if (device) {
      device.status = status;
      device.updatedAt = Date.now();
      this.devices.set(deviceId, device);
      
      const statusInfo = this.deviceStatus.get(deviceId);
      if (statusInfo) {
        statusInfo.status = status;
      }
      
      this.emit('deviceStatusChanged', { deviceId, status });
    }
  }

  addToGroup(groupId: string, deviceId: string): boolean {
    if (!this.devices.has(deviceId)) return false;
    
    if (!this.deviceGroups.has(groupId)) {
      this.deviceGroups.set(groupId, new Set());
    }
    
    this.deviceGroups.get(groupId)!.add(deviceId);
    this.emit('deviceAddedToGroup', { groupId, deviceId });
    
    return true;
  }

  removeFromGroup(groupId: string, deviceId: string): boolean {
    const group = this.deviceGroups.get(groupId);
    if (!group) return false;
    
    const result = group.delete(deviceId);
    if (result) {
      this.emit('deviceRemovedFromGroup', { groupId, deviceId });
    }
    
    return result;
  }

  getGroupDevices(groupId: string): Device[] {
    const group = this.deviceGroups.get(groupId);
    if (!group) return [];
    
    return Array.from(group)
      .map(id => this.devices.get(id))
      .filter(Boolean) as Device[];
  }

  listGroups(): string[] {
    return Array.from(this.deviceGroups.keys());
  }

  deleteGroup(groupId: string): boolean {
    return this.deviceGroups.delete(groupId);
  }

  private checkDeviceStatus(): void {
    const now = Date.now();
    
    for (const [deviceId, status] of this.deviceStatus) {
      if (status.status === 'online' && now - status.lastSeen > this.heartbeatTimeout) {
        this.setDeviceStatus(deviceId, 'offline');
        console.log(`[DeviceManager] Device ${deviceId} marked as offline due to timeout`);
      }
    }
  }

  getStatistics(): {
    total: number;
    online: number;
    offline: number;
    error: number;
    byProtocol: Record<string, number>;
    byType: Record<string, number>;
  } {
    const devices = Array.from(this.devices.values());
    const byProtocol: Record<string, number> = {};
    const byType: Record<string, number> = {};
    
    for (const device of devices) {
      byProtocol[device.protocol] = (byProtocol[device.protocol] || 0) + 1;
      byType[device.type] = (byType[device.type] || 0) + 1;
    }
    
    return {
      total: devices.length,
      online: devices.filter(d => d.status === 'online').length,
      offline: devices.filter(d => d.status === 'offline').length,
      error: devices.filter(d => d.status === 'error').length,
      byProtocol,
      byType
    };
  }

  destroy(): void {
    clearInterval(this.checkInterval);
    this.devices.clear();
    this.deviceGroups.clear();
    this.deviceStatus.clear();
  }
}

export const deviceManager = new DeviceManager();
