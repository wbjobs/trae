const Docker = require('dockerode');
const { v4: uuidv4 } = require('uuid');

const docker = new Docker();

const DEFAULT_IMAGE = 'alpine:latest';
const IDLE_TIMEOUT = 10 * 60 * 1000;
const MAX_CONTAINERS = 20;
const activeContainers = new Map();

const DROPPED_CAPABILITIES = [
  'ALL',
];

const ADDED_CAPABILITIES = [
  'CHOWN',
  'SETUID',
  'SETGID',
  'DAC_OVERRIDE',
  'FOWNER',
  'FSETID',
  'MKNOD',
  'AUDIT_WRITE',
  'SETFCAP',
  'NET_RAW',
];

const SECURITY_OPTIONS = [
  'no-new-privileges',
];

async function createContainer(image = DEFAULT_IMAGE, cmd = ['/bin/sh']) {
  if (activeContainers.size >= MAX_CONTAINERS) {
    throw new Error('已达到最大容器数量限制，请稍后再试');
  }

  const containerId = uuidv4();

  const container = await docker.createContainer({
    Image: image,
    Cmd: cmd,
    AttachStdin: true,
    AttachStdout: true,
    AttachStderr: true,
    Tty: true,
    OpenStdin: true,
    StdinOnce: false,
    name: `web-terminal-${containerId}`,
    HostConfig: {
      MemoryLimit: 256 * 1024 * 1024,
      MemorySwap: 256 * 1024 * 1024,
      NanoCpus: 1000000000,
      PidsLimit: 256,
      AutoRemove: true,
      ReadonlyRootfs: true,
      CapAdd: ADDED_CAPABILITIES,
      CapDrop: DROPPED_CAPABILITIES,
      SecurityOpt: SECURITY_OPTIONS,
      NetworkMode: 'none',
      Tmpfs: {
        '/tmp': 'rw,noexec,nosuid,size=64m',
        '/run': 'rw,noexec,nosuid,size=16m',
        '/var/tmp': 'rw,noexec,nosuid,size=32m',
      },
      Devices: [],
      CgroupParent: 'docker-web-terminal',
    },
    NetworkingConfig: {
      EndpointsConfig: {},
    },
  });

  await container.start();

  const exec = await container.exec({
    Cmd: cmd,
    AttachStdin: true,
    AttachStdout: true,
    AttachStderr: true,
    Tty: true,
    User: '1000:1000',
  });

  const stream = await exec.start({
    hijack: true,
    stdin: true,
  });

  const containerInfo = {
    id: containerId,
    container,
    exec,
    stream,
    image,
    createdAt: Date.now(),
    lastActivity: Date.now(),
    timeout: null,
    healthCheckInterval: null,
  };

  activeContainers.set(containerId, containerInfo);
  scheduleCleanup(containerId);
  startHealthCheck(containerId);

  return containerInfo;
}

function resizeContainer(containerId, cols, rows) {
  const info = activeContainers.get(containerId);
  if (!info) return false;

  info.container.resize({ w: cols, h: rows }).catch(() => {});
  updateActivity(containerId);
  return true;
}

function getContainerStats(containerId) {
  return new Promise((resolve, reject) => {
    const info = activeContainers.get(containerId);
    if (!info) {
      reject(new Error('Container not found'));
      return;
    }

    info.container.stats({ stream: false }, (err, stats) => {
      if (err) {
        reject(err);
        return;
      }

      if (!stats || !stats.cpu_stats) {
        resolve({
          cpuPercent: 0,
          memoryUsage: 0,
          memoryLimit: 0,
          memoryPercent: 0,
        });
        return;
      }

      const cpuDelta = stats.cpu_stats.cpu_usage.total_usage -
        (stats.precpu_stats?.cpu_usage?.total_usage || 0);
      const systemDelta = stats.cpu_stats.system_cpu_usage -
        (stats.precpu_stats?.system_cpu_usage || 0);
      const cpuPercent = systemDelta > 0 && cpuDelta > 0
        ? (cpuDelta / systemDelta) * stats.cpu_stats.online_cpus * 100
        : 0;

      const memoryUsage = stats.memory_stats.usage || 0;
      const memoryLimit = stats.memory_stats.limit || 0;
      const memoryPercent = memoryLimit > 0 ? (memoryUsage / memoryLimit) * 100 : 0;

      resolve({
        cpuPercent: Math.min(cpuPercent, 100),
        memoryUsage,
        memoryLimit,
        memoryPercent,
      });
    });
  });
}

async function removeContainer(containerId) {
  const info = activeContainers.get(containerId);
  if (!info) return false;

  if (info.timeout) {
    clearTimeout(info.timeout);
  }

  stopHealthCheck(containerId);

  try {
    if (info.stream) {
      info.stream.destroy();
    }
    await info.container.stop({ t: 5 });
  } catch (err) {
  }

  activeContainers.delete(containerId);
  return true;
}

function updateActivity(containerId) {
  const info = activeContainers.get(containerId);
  if (info) {
    info.lastActivity = Date.now();
    scheduleCleanup(containerId);
  }
}

function scheduleCleanup(containerId) {
  const info = activeContainers.get(containerId);
  if (!info) return;

  if (info.timeout) {
    clearTimeout(info.timeout);
  }

  info.timeout = setTimeout(() => {
    console.log(`Container ${containerId} idle timeout, removing...`);
    removeContainer(containerId);
  }, IDLE_TIMEOUT);
}

function startHealthCheck(containerId) {
  const info = activeContainers.get(containerId);
  if (!info) return;

  info.healthCheckInterval = setInterval(async () => {
    try {
      const container = info.container;
      const inspectData = await container.inspect();

      if (!inspectData.State.Running) {
        console.log(`Container ${containerId} is not running, cleaning up...`);
        removeContainer(containerId);
        return;
      }

      if (inspectData.State.OOMKilled) {
        console.log(`Container ${containerId} was OOM killed, cleaning up...`);
        removeContainer(containerId);
        return;
      }

      const stats = await getContainerStats(containerId);
      if (stats.memoryPercent > 95) {
        console.log(`Container ${containerId} memory usage critical (${stats.memoryPercent}%), removing...`);
        removeContainer(containerId);
      }
    } catch (err) {
      if (err.statusCode === 404) {
        console.log(`Container ${containerId} not found, cleaning up...`);
        removeContainer(containerId);
      }
    }
  }, 5000);
}

function stopHealthCheck(containerId) {
  const info = activeContainers.get(containerId);
  if (info && info.healthCheckInterval) {
    clearInterval(info.healthCheckInterval);
    info.healthCheckInterval = null;
  }
}

function isContainerActive(containerId) {
  return activeContainers.has(containerId);
}

function getActiveContainerCount() {
  return activeContainers.size;
}

function sendInput(containerId, data) {
  const info = activeContainers.get(containerId);
  if (!info || !info.stream) return false;

  info.stream.write(data);
  updateActivity(containerId);
  return true;
}

function listContainers() {
  return Array.from(activeContainers.entries()).map(([id, info]) => ({
    id,
    image: info.image,
    createdAt: info.createdAt,
    lastActivity: info.lastActivity,
  }));
}

function cleanupAll() {
  const promises = [];
  for (const id of activeContainers.keys()) {
    promises.push(removeContainer(id));
  }
  return Promise.all(promises);
}

process.on('exit', () => {
  cleanupAll();
});

process.on('SIGTERM', () => {
  cleanupAll().then(() => process.exit(0));
});

module.exports = {
  createContainer,
  resizeContainer,
  getContainerStats,
  removeContainer,
  updateActivity,
  isContainerActive,
  sendInput,
  listContainers,
  cleanupAll,
  getActiveContainerCount,
  DEFAULT_IMAGE,
  MAX_CONTAINERS,
};
