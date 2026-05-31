import { EventEmitter } from 'events';
import type { ProtocolVersion, GrayRelease, DeviceVersion } from '../../../common/types';
import { generateId } from '../../../common/utils';

export class VersionManager extends EventEmitter {
  private versions: Map<string, ProtocolVersion> = new Map();
  private grayReleases: Map<string, GrayRelease> = new Map();
  private deviceVersions: Map<string, DeviceVersion> = new Map();
  private activeReleases: Map<string, GrayRelease> = new Map();

  createVersion(data: Omit<ProtocolVersion, 'id' | 'createdAt' | 'updatedAt'>): ProtocolVersion {
    const now = Date.now();
    const version: ProtocolVersion = {
      ...data,
      id: generateId(),
      createdAt: now,
      updatedAt: now
    };
    
    this.versions.set(version.id, version);
    this.emit('versionCreated', version);
    console.log(`[VersionManager] Created version ${version.version} for protocol ${version.protocolId}`);
    
    return version;
  }

  getVersion(id: string): ProtocolVersion | undefined {
    return this.versions.get(id);
  }

  getVersionsByProtocol(protocolId: string): ProtocolVersion[] {
    return Array.from(this.versions.values())
      .filter(v => v.protocolId === protocolId)
      .sort((a, b) => b.createdAt - a.createdAt);
  }

  updateVersion(id: string, data: Partial<ProtocolVersion>): ProtocolVersion | undefined {
    const version = this.versions.get(id);
    if (!version) return undefined;
    
    const updated: ProtocolVersion = {
      ...version,
      ...data,
      updatedAt: Date.now()
    };
    
    this.versions.set(id, updated);
    this.emit('versionUpdated', updated);
    
    return updated;
  }

  deleteVersion(id: string): boolean {
    const version = this.versions.get(id);
    if (!version) return false;
    
    this.versions.delete(id);
    this.emit('versionDeleted', id);
    
    return true;
  }

  createGrayRelease(data: Omit<GrayRelease, 'id' | 'status' | 'successRate' | 'errorCount' | 'totalCount' | 'createdAt' | 'updatedAt'>): GrayRelease {
    const now = Date.now();
    const release: GrayRelease = {
      ...data,
      id: generateId(),
      status: 'pending',
      successRate: 0,
      errorCount: 0,
      totalCount: 0,
      createdAt: now,
      updatedAt: now
    };
    
    this.grayReleases.set(release.id, release);
    this.emit('releaseCreated', release);
    console.log(`[VersionManager] Created gray release: ${release.name}`);
    
    return release;
  }

  startGrayRelease(releaseId: string): GrayRelease | undefined {
    const release = this.grayReleases.get(releaseId);
    if (!release || release.status !== 'pending') return undefined;
    
    release.status = 'running';
    release.startedAt = Date.now();
    release.updatedAt = Date.now();
    
    this.activeReleases.set(releaseId, release);
    this.emit('releaseStarted', release);
    console.log(`[VersionManager] Started gray release: ${release.name}`);
    
    this.processRelease(release);
    
    return release;
  }

  private async processRelease(release: GrayRelease): Promise<void> {
    const version = this.versions.get(release.versionId);
    if (!version) return;

    const targetDevices = this.getTargetDevices(release);
    
    for (const deviceId of targetDevices) {
      if (release.status !== 'running') break;
      
      try {
        await this.upgradeDevice(deviceId, version);
        release.totalCount++;
        release.successRate = Math.round(((release.totalCount - release.errorCount) / release.totalCount) * 100);
        this.emit('deviceUpgraded', { releaseId: release.id, deviceId, version: version.version });
      } catch (error) {
        release.errorCount++;
        release.successRate = Math.round(((release.totalCount - release.errorCount) / Math.max(release.totalCount, 1)) * 100);
        this.emit('deviceUpgradeFailed', { releaseId: release.id, deviceId, error: error as Error });
      }
      
      release.updatedAt = Date.now();
      
      if (release.successRate < 80 && release.totalCount >= 10) {
        this.pauseGrayRelease(release.id);
        console.log(`[VersionManager] Release paused due to low success rate: ${release.successRate}%`);
        break;
      }
    }

    if (release.status === 'running') {
      release.status = 'completed';
      release.completedAt = Date.now();
      this.activeReleases.delete(release.id);
      this.emit('releaseCompleted', release);
      console.log(`[VersionManager] Completed gray release: ${release.name}`);
    }
  }

  private getTargetDevices(release: GrayRelease): string[] {
    const { deviceManager } = require('../../device-manager/src');
    const allDevices = deviceManager.listDevices().map(d => d.id);
    
    switch (release.strategy) {
      case 'deviceList':
        return release.deviceIds || [];
      
      case 'deviceGroup':
        const groupDevices: string[] = [];
        (release.groupIds || []).forEach(gid => {
          groupDevices.push(...deviceManager.getGroupDevices(gid).map(d => d.id));
        });
        return groupDevices;
      
      case 'canary':
        return release.canaryDevices || [];
      
      case 'percentage':
        const pct = release.percentage || 10;
        const count = Math.ceil(allDevices.length * pct / 100);
        return allDevices.slice(0, count);
      
      default:
        return allDevices;
    }
  }

  private async upgradeDevice(deviceId: string, version: ProtocolVersion): Promise<void> {
    const { longPollingService } = require('../../long-polling/src');
    
    const deviceVersion: DeviceVersion = {
      deviceId,
      protocolId: version.protocolId,
      currentVersion: this.deviceVersions.get(deviceId)?.currentVersion || 'unknown',
      targetVersion: version.version,
      upgradeStatus: 'pending',
      createdAt: Date.now(),
      updatedAt: Date.now()
    };
    
    this.deviceVersions.set(deviceId, deviceVersion);
    
    const command = {
      type: 'protocol_upgrade',
      version: version.version,
      config: version.config,
      schemaId: version.schemaId
    };
    
    longPollingService.sendToDevice(deviceId, JSON.stringify(command));
    
    deviceVersion.upgradeStatus = 'upgrading';
    deviceVersion.updatedAt = Date.now();
    
    await new Promise(resolve => setTimeout(resolve, 1000));
    
    deviceVersion.upgradeStatus = 'success';
    deviceVersion.currentVersion = version.version;
    deviceVersion.lastUpgradeAt = Date.now();
    deviceVersion.updatedAt = Date.now();
    
    this.deviceVersions.set(deviceId, deviceVersion);
    
    console.log(`[VersionManager] Device ${deviceId} upgraded to ${version.version}`);
  }

  pauseGrayRelease(releaseId: string): GrayRelease | undefined {
    const release = this.grayReleases.get(releaseId);
    if (!release || release.status !== 'running') return undefined;
    
    release.status = 'paused';
    release.updatedAt = Date.now();
    this.activeReleases.delete(releaseId);
    
    this.emit('releasePaused', release);
    console.log(`[VersionManager] Paused gray release: ${release.name}`);
    
    return release;
  }

  resumeGrayRelease(releaseId: string): GrayRelease | undefined {
    const release = this.grayReleases.get(releaseId);
    if (!release || release.status !== 'paused') return undefined;
    
    release.status = 'running';
    release.updatedAt = Date.now();
    this.activeReleases.set(releaseId, release);
    
    this.emit('releaseResumed', release);
    console.log(`[VersionManager] Resumed gray release: ${release.name}`);
    
    this.processRelease(release);
    
    return release;
  }

  rollbackGrayRelease(releaseId: string): GrayRelease | undefined {
    const release = this.grayReleases.get(releaseId);
    if (!release) return undefined;
    
    release.status = 'rolledback';
    release.updatedAt = Date.now();
    this.activeReleases.delete(releaseId);
    
    this.emit('releaseRolledback', release);
    console.log(`[VersionManager] Rolled back gray release: ${release.name}`);
    
    return release;
  }

  getGrayRelease(id: string): GrayRelease | undefined {
    return this.grayReleases.get(id);
  }

  listGrayReleases(protocolId?: string): GrayRelease[] {
    let releases = Array.from(this.grayReleases.values());
    
    if (protocolId) {
      releases = releases.filter(r => {
        const version = this.versions.get(r.versionId);
        return version?.protocolId === protocolId;
      });
    }
    
    return releases.sort((a, b) => b.createdAt - a.createdAt);
  }

  getDeviceVersion(deviceId: string): DeviceVersion | undefined {
    return this.deviceVersions.get(deviceId);
  }

  getDeviceVersionsByProtocol(protocolId: string): DeviceVersion[] {
    return Array.from(this.deviceVersions.values())
      .filter(dv => dv.protocolId === protocolId);
  }

  getStatistics(): {
    totalVersions: number;
    totalReleases: number;
    runningReleases: number;
    deviceUpgradeStats: Record<string, number>;
  } {
    const deviceUpgradeStats: Record<string, number> = {};
    this.deviceVersions.forEach(dv => {
      deviceUpgradeStats[dv.upgradeStatus] = (deviceUpgradeStats[dv.upgradeStatus] || 0) + 1;
    });

    return {
      totalVersions: this.versions.size,
      totalReleases: this.grayReleases.size,
      runningReleases: this.activeReleases.size,
      deviceUpgradeStats
    };
  }
}

export const versionManager = new VersionManager();
