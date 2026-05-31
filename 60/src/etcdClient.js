const { Etcd3 } = require('etcd3');

class EtcdClient {
  constructor(endpoints = ['127.0.0.1:2379']) {
    this.client = new Etcd3({ hosts: endpoints });
  }

  getGlobalKey(service, key) {
    return `/config/${service}/global/${key}`;
  }

  getInstanceKey(service, instanceId, key) {
    return `/config/${service}/instance/${instanceId}/${key}`;
  }

  getServicePrefix(service) {
    return `/config/${service}/`;
  }

  async setGlobalConfig(service, key, value) {
    const fullKey = this.getGlobalKey(service, key);
    await this.client.put(fullKey).value(value);
    return { key: fullKey, value };
  }

  async setInstanceConfig(service, instanceId, key, value) {
    const fullKey = this.getInstanceKey(service, instanceId, key);
    await this.client.put(fullKey).value(value);
    return { key: fullKey, value };
  }

  async getGlobalConfig(service, key) {
    const fullKey = this.getGlobalKey(service, key);
    return this.client.get(fullKey).string();
  }

  async getInstanceConfig(service, instanceId, key) {
    const fullKey = this.getInstanceKey(service, instanceId, key);
    return this.client.get(fullKey).string();
  }

  async getAllGlobalConfigs(service) {
    const prefix = `/config/${service}/global/`;
    const result = await this.client.getAll().prefix(prefix).strings();
    const configs = {};
    for (const [fullKey, value] of Object.entries(result)) {
      const key = fullKey.replace(prefix, '');
      configs[key] = value;
    }
    return configs;
  }

  async getAllInstanceConfigs(service, instanceId) {
    const prefix = `/config/${service}/instance/${instanceId}/`;
    const result = await this.client.getAll().prefix(prefix).strings();
    const configs = {};
    for (const [fullKey, value] of Object.entries(result)) {
      const key = fullKey.replace(prefix, '');
      configs[key] = value;
    }
    return configs;
  }

  async getResolvedConfig(service, instanceId = null) {
    const globalConfigs = await this.getAllGlobalConfigs(service);
    if (!instanceId) {
      return {
        type: 'global',
        config: globalConfigs
      };
    }

    const instanceConfigs = await this.getAllInstanceConfigs(service, instanceId);
    const merged = { ...globalConfigs, ...instanceConfigs };
    const overriddenKeys = Object.keys(instanceConfigs);

    return {
      type: instanceId ? (overriddenKeys.length > 0 ? 'merged' : 'global') : 'global',
      instanceId,
      overriddenKeys,
      config: merged
    };
  }

  async getConfigSnapshot(service, instanceId = null) {
    const prefix = instanceId
      ? `/config/${service}/instance/${instanceId}/`
      : `/config/${service}/global/`;
    const result = await this.client.getAll().prefix(prefix).strings();
    const configs = {};
    for (const [fullKey, value] of Object.entries(result)) {
      const key = fullKey.replace(prefix, '');
      configs[key] = value;
    }
    return configs;
  }

  watch(service, instanceId = null, callback) {
    const prefix = instanceId
      ? `/config/${service}/instance/${instanceId}/`
      : `/config/${service}/global/`;

    const watcher = this.client.watch()
      .prefix(prefix)
      .create()
      .then(watcher => {
        watcher.on('put', (req) => {
          const key = req.key.toString();
          const value = req.value.toString();
          callback({
            type: 'put',
            scope: instanceId ? 'instance' : 'global',
            instanceId,
            key: key.replace(prefix, ''),
            fullKey: key,
            value
          });
        });

        watcher.on('delete', (req) => {
          const key = req.key.toString();
          callback({
            type: 'delete',
            scope: instanceId ? 'instance' : 'global',
            instanceId,
            key: key.replace(prefix, ''),
            fullKey: key
          });
        });

        return watcher;
      })
      .catch(err => {
        console.error('Watch error:', err.message);
      });

    return watcher;
  }

  getVersionPrefix(service, instanceId = null) {
    if (instanceId) {
      return `/config/${service}/versions/instance/${instanceId}/`;
    }
    return `/config/${service}/versions/global/`;
  }

  getVersionKey(service, version, instanceId = null) {
    const versionStr = String(version).padStart(6, '0');
    return `${this.getVersionPrefix(service, instanceId)}${versionStr}`;
  }

  async getLatestVersionNumber(service, instanceId = null) {
    const prefix = this.getVersionPrefix(service, instanceId);
    const result = await this.client.getAll().prefix(prefix).keys();
    if (result.length === 0) return 0;

    const versionNumbers = result.map(key => {
      const parts = key.split('/');
      return parseInt(parts[parts.length - 1], 10);
    });

    return Math.max(...versionNumbers);
  }

  async saveVersionSnapshot(service, instanceId = null, message = '') {
    const currentConfig = await this.getConfigSnapshot(service, instanceId);
    const version = await this.getLatestVersionNumber(service, instanceId) + 1;
    const versionKey = this.getVersionKey(service, version, instanceId);

    const snapshot = {
      version,
      timestamp: new Date().toISOString(),
      config: currentConfig,
      message,
      instanceId
    };

    await this.client.put(versionKey).value(JSON.stringify(snapshot));
    await this.trimOldVersions(service, instanceId, 20);

    return { version, key: versionKey, snapshot };
  }

  async trimOldVersions(service, instanceId = null, keepCount = 20) {
    const prefix = this.getVersionPrefix(service, instanceId);
    const result = await this.client.getAll().prefix(prefix).keys();

    if (result.length <= keepCount) return;

    const versionNumbers = result.map(key => {
      const parts = key.split('/');
      return { key, version: parseInt(parts[parts.length - 1], 10) };
    });

    versionNumbers.sort((a, b) => a.version - b.version);
    const toDelete = versionNumbers.slice(0, versionNumbers.length - keepCount);

    for (const item of toDelete) {
      await this.client.delete().key(item.key);
    }
  }

  async listVersions(service, instanceId = null) {
    const prefix = this.getVersionPrefix(service, instanceId);
    const result = await this.client.getAll().prefix(prefix).strings();

    const versions = Object.entries(result).map(([key, value]) => {
      const snapshot = JSON.parse(value);
      return snapshot;
    });

    versions.sort((a, b) => a.version - b.version);
    return versions;
  }

  async getVersion(service, version, instanceId = null) {
    const versionKey = this.getVersionKey(service, version, instanceId);
    const value = await this.client.get(versionKey).string();
    if (!value) return null;
    return JSON.parse(value);
  }

  async rollbackToVersion(service, version, instanceId = null) {
    const targetSnapshot = await this.getVersion(service, version, instanceId);
    if (!targetSnapshot) {
      throw new Error(`Version ${version} not found`);
    }

    const currentConfig = await this.getConfigSnapshot(service, instanceId);
    const targetConfig = targetSnapshot.config;

    const allKeys = new Set([...Object.keys(currentConfig), ...Object.keys(targetConfig)]);

    for (const key of allKeys) {
      if (key in targetConfig) {
        if (instanceId) {
          await this.setInstanceConfig(service, instanceId, key, targetConfig[key]);
        } else {
          await this.setGlobalConfig(service, key, targetConfig[key]);
        }
      } else {
        const fullKey = instanceId
          ? this.getInstanceKey(service, instanceId, key)
          : this.getGlobalKey(service, key);
        await this.client.delete().key(fullKey);
      }
    }

    return {
      from: currentConfig,
      to: targetConfig,
      version
    };
  }

  async close() {
    await this.client.close();
  }
}

module.exports = EtcdClient;
