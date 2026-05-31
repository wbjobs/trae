#!/usr/bin/env node

const fs = require('fs');
const path = require('path');
const os = require('os');
const { Command } = require('commander');
const EtcdClient = require('./etcdClient');

function getAuditLogPath() {
  const configDir = path.join(os.homedir(), '.config-cli');
  if (!fs.existsSync(configDir)) {
    fs.mkdirSync(configDir, { recursive: true });
  }
  return path.join(configDir, 'audit.log');
}

function writeAuditLog(action, details) {
  try {
    const logEntry = {
      timestamp: new Date().toISOString(),
      action,
      user: process.env.USER || process.env.USERNAME || 'unknown',
      ...details
    };
    const logLine = JSON.stringify(logEntry) + '\n';
    fs.appendFileSync(getAuditLogPath(), logLine);
  } catch (err) {
    console.error(`[WARN] Failed to write audit log: ${err.message}`);
  }
}

const program = new Command();

program
  .name('config-cli')
  .description('Distributed microservice configuration management CLI')
  .version('1.0.0')
  .option('-e, --etcd <endpoints>', 'etcd endpoints (comma-separated)', '127.0.0.1:2379');

function parseKeyValue(str) {
  const idx = str.indexOf('=');
  if (idx === -1) {
    throw new Error(`Invalid key=value format: ${str}`);
  }
  return {
    key: str.slice(0, idx),
    value: str.slice(idx + 1)
  };
}

function getEtcdClient(opts) {
  const endpoints = opts.etcd.split(',').map(s => s.trim());
  return new EtcdClient(endpoints);
}

program
  .command('set')
  .description('Set configuration for a service')
  .argument('<service>', 'Service name')
  .argument('<keyvalue>', 'Configuration key=value pair')
  .option('-i, --instance <instanceId>', 'Set configuration for a specific instance (gray release)')
  .option('-m, --message <message>', 'Version message')
  .action(async (service, keyvalue, opts) => {
    const etcd = getEtcdClient(program.opts());
    try {
      const { key, value } = parseKeyValue(keyvalue);

      let result;
      if (opts.instance) {
        result = await etcd.setInstanceConfig(service, opts.instance, key, value);
        console.log(`[OK] Set instance config for ${service}@${opts.instance}`);
      } else {
        result = await etcd.setGlobalConfig(service, key, value);
        console.log(`[OK] Set global config for ${service}`);
      }

      console.log(`  Key:   ${result.key}`);
      console.log(`  Value: ${result.value}`);

      const versionResult = await etcd.saveVersionSnapshot(
        service,
        opts.instance || null,
        opts.message || `Set ${key}=${value}`
      );
      console.log(`  Version: ${versionResult.version} saved`);

      writeAuditLog('set', {
        service,
        instanceId: opts.instance || null,
        key,
        value,
        version: versionResult.version
      });
    } catch (err) {
      console.error(`[ERROR] ${err.message}`);
      process.exit(1);
    } finally {
      await etcd.close();
    }
  });

program
  .command('get')
  .description('Get configuration for a service')
  .argument('<service>', 'Service name')
  .option('-i, --instance <instanceId>', 'Get resolved config for a specific instance')
  .option('-k, --key <key>', 'Get value for a specific key')
  .action(async (service, opts) => {
    const etcd = getEtcdClient(program.opts());
    try {
      if (opts.key) {
        let value = null;
        let source = 'none';

        if (opts.instance) {
          value = await etcd.getInstanceConfig(service, opts.instance, opts.key);
          if (value !== null) {
            source = 'instance';
          }
        }

        if (value === null) {
          value = await etcd.getGlobalConfig(service, opts.key);
          if (value !== null) {
            source = 'global';
          }
        }

        if (value === null) {
          console.log(`[INFO] No config found for key "${opts.key}"`);
        } else {
          console.log(`${opts.key}=${value}  (source: ${source})`);
        }
      } else {
        const result = await etcd.getResolvedConfig(service, opts.instance);
        const configCount = Object.keys(result.config).length;

        if (configCount === 0) {
          console.log(`[INFO] No configuration found for service "${service}"`);
          return;
        }

        if (opts.instance) {
          if (result.type === 'merged') {
            console.log(`Configuration for ${service}@${opts.instance} (merged, ${result.overriddenKeys.length} instance override(s)):`);
          } else {
            console.log(`Configuration for ${service}@${opts.instance} (global defaults):`);
          }
        } else {
          console.log(`Global configuration for ${service}:`);
        }

        for (const [key, value] of Object.entries(result.config)) {
          const marker = result.overriddenKeys && result.overriddenKeys.includes(key)
            ? ' [instance]'
            : ' [global]';
          console.log(`  ${key}=${value}${marker}`);
        }
      }
    } catch (err) {
      console.error(`[ERROR] ${err.message}`);
      process.exit(1);
    } finally {
      await etcd.close();
    }
  });

function computeDiff(oldConfig, newConfig) {
  const added = [];
  const modified = [];
  const deleted = [];

  for (const key of Object.keys(newConfig)) {
    if (!(key in oldConfig)) {
      added.push({ key, value: newConfig[key] });
    } else if (oldConfig[key] !== newConfig[key]) {
      modified.push({ key, oldValue: oldConfig[key], newValue: newConfig[key] });
    }
  }

  for (const key of Object.keys(oldConfig)) {
    if (!(key in newConfig)) {
      deleted.push({ key, oldValue: oldConfig[key] });
    }
  }

  return { added, modified, deleted };
}

class CircularBuffer {
  constructor(maxSize = 10) {
    this.maxSize = maxSize;
    this.items = [];
  }

  push(item) {
    this.items.push(item);
    if (this.items.length > this.maxSize) {
      this.items.shift();
    }
  }

  getLatest() {
    return this.items.length > 0 ? this.items[this.items.length - 1] : null;
  }

  size() {
    return this.items.length;
  }
}

program
  .command('watch')
  .description('Watch for configuration changes')
  .argument('<service>', 'Service name')
  .option('-i, --instance <instanceId>', 'Watch instance-specific config instead of global')
  .option('--diff', 'Show only changed key-value pairs (added/modified/deleted)')
  .action(async (service, opts) => {
    const etcd = getEtcdClient(program.opts());
    const scope = opts.instance ? `instance ${opts.instance}` : 'global';
    console.log(`[WATCH] Watching ${scope} config for service "${service}"...`);
    if (opts.diff) {
      console.log('[WATCH] Diff mode: only showing changes');
    }
    console.log('[WATCH] Press Ctrl+C to exit');
    console.log('---');

    const historyBuffer = new CircularBuffer(10);

    try {
      if (opts.diff) {
        const initialSnapshot = await etcd.getConfigSnapshot(service, opts.instance);
        historyBuffer.push({
          timestamp: new Date().toISOString(),
          config: initialSnapshot
        });
        console.log(`[WATCH] Initial snapshot captured (${Object.keys(initialSnapshot).length} keys)`);
      }

      await etcd.watch(service, opts.instance, async (event) => {
        const timestamp = new Date().toISOString();
        const scopeLabel = event.scope === 'instance' ? `[${event.scope}:${event.instanceId}]` : `[${event.scope}]`;

        if (opts.diff) {
          const newSnapshot = await etcd.getConfigSnapshot(service, opts.instance);
          const prevSnapshot = historyBuffer.getLatest();

          if (prevSnapshot) {
            const diff = computeDiff(prevSnapshot.config, newSnapshot);
            const hasChanges = diff.added.length > 0 || diff.modified.length > 0 || diff.deleted.length > 0;

            if (hasChanges) {
              console.log(`[${timestamp}] ${scopeLabel} Configuration changed:`);
              for (const item of diff.added) {
                console.log(`  + ${item.key}=${item.value}`);
              }
              for (const item of diff.modified) {
                console.log(`  ~ ${item.key}: ${item.oldValue} -> ${item.newValue}`);
              }
              for (const item of diff.deleted) {
                console.log(`  - ${item.key} (was: ${item.oldValue})`);
              }
            }
          }

          historyBuffer.push({
            timestamp,
            config: newSnapshot
          });
        } else {
          const eventType = event.type === 'put' ? 'SET' : 'DEL';
          if (event.type === 'put') {
            console.log(`[${timestamp}] ${scopeLabel} ${eventType} ${event.key}=${event.value}`);
          } else {
            console.log(`[${timestamp}] ${scopeLabel} ${eventType} ${event.key}`);
          }
        }
      });

      process.on('SIGINT', async () => {
        console.log('\n[WATCH] Stopping watch...');
        await etcd.close();
        process.exit(0);
      });
    } catch (err) {
      console.error(`[ERROR] ${err.message}`);
      await etcd.close();
      process.exit(1);
    }
  });

program
  .command('rollback')
  .description('Rollback service configuration to a specific version')
  .argument('<service>', 'Service name')
  .requiredOption('-v, --version <number>', 'Target version number to rollback to')
  .option('-i, --instance <instanceId>', 'Rollback instance-specific config')
  .option('-m, --message <message>', 'Rollback message')
  .action(async (service, opts) => {
    const etcd = getEtcdClient(program.opts());
    try {
      const targetVersion = parseInt(opts.version, 10);
      if (isNaN(targetVersion)) {
        throw new Error('Version must be a number');
      }

      const targetSnapshot = await etcd.getVersion(service, targetVersion, opts.instance || null);
      if (!targetSnapshot) {
        throw new Error(`Version ${targetVersion} not found`);
      }

      console.log(`[INFO] Rolling back ${service}${opts.instance ? `@${opts.instance}` : ''} to version ${targetVersion}...`);
      console.log(`  Target timestamp: ${targetSnapshot.timestamp}`);
      console.log(`  Target message: ${targetSnapshot.message || '(none)'}`);
      console.log(`  Target config keys: ${Object.keys(targetSnapshot.config).join(', ')}`);

      const rollbackResult = await etcd.rollbackToVersion(service, targetVersion, opts.instance || null);

      const newVersionResult = await etcd.saveVersionSnapshot(
        service,
        opts.instance || null,
        opts.message || `Rollback to version ${targetVersion}`
      );

      console.log(`[OK] Rollback completed successfully`);
      console.log(`  New version: ${newVersionResult.version}`);

      writeAuditLog('rollback', {
        service,
        instanceId: opts.instance || null,
        fromVersion: rollbackResult.version,
        toVersion: targetVersion,
        newVersion: newVersionResult.version,
        message: opts.message || ''
      });
    } catch (err) {
      console.error(`[ERROR] ${err.message}`);
      process.exit(1);
    } finally {
      await etcd.close();
    }
  });

const versionCmd = program
  .command('version')
  .description('Manage configuration versions');

versionCmd
  .command('list')
  .description('List configuration history versions')
  .argument('<service>', 'Service name')
  .option('-i, --instance <instanceId>', 'List instance-specific versions')
  .action(async (service, opts) => {
    const etcd = getEtcdClient(program.opts());
    try {
      const versions = await etcd.listVersions(service, opts.instance || null);

      if (versions.length === 0) {
        console.log(`[INFO] No versions found for ${service}${opts.instance ? `@${opts.instance}` : ''}`);
        return;
      }

      const scope = opts.instance ? `instance ${opts.instance}` : 'global';
      console.log(`Version history for ${service} (${scope}):`);
      console.log('');
      console.log('  Ver  Timestamp           Message');
      console.log('  ---  ------------------  -------');

      for (const v of versions) {
        const ts = v.timestamp.replace('T', ' ').substring(0, 19);
        const msg = v.message || '(no message)';
        const keyCount = Object.keys(v.config).length;
        console.log(`  ${String(v.version).padStart(3)}  ${ts}  ${msg} (${keyCount} keys)`);
      }
    } catch (err) {
      console.error(`[ERROR] ${err.message}`);
      process.exit(1);
    } finally {
      await etcd.close();
    }
  });

versionCmd
  .command('show')
  .description('Show a specific version snapshot')
  .argument('<service>', 'Service name')
  .requiredOption('-v, --version <number>', 'Version number to show')
  .option('-i, --instance <instanceId>', 'Show instance-specific version')
  .action(async (service, opts) => {
    const etcd = getEtcdClient(program.opts());
    try {
      const versionNum = parseInt(opts.version, 10);
      if (isNaN(versionNum)) {
        throw new Error('Version must be a number');
      }

      const snapshot = await etcd.getVersion(service, versionNum, opts.instance || null);
      if (!snapshot) {
        console.log(`[INFO] Version ${versionNum} not found`);
        return;
      }

      console.log(`Version ${versionNum} for ${service}${opts.instance ? `@${opts.instance}` : ''}:`);
      console.log(`  Timestamp: ${snapshot.timestamp}`);
      console.log(`  Message: ${snapshot.message || '(none)'}`);
      console.log(`  Config:`);
      for (const [key, value] of Object.entries(snapshot.config)) {
        console.log(`    ${key}=${value}`);
      }
    } catch (err) {
      console.error(`[ERROR] ${err.message}`);
      process.exit(1);
    } finally {
      await etcd.close();
    }
  });

program.parseAsync(process.argv);
