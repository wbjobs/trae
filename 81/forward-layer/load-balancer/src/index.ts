import { EventEmitter } from 'events';
import type { ParsedMessage, RouteTarget } from '../../../common/types';

type LoadBalanceStrategy = 'round_robin' | 'least_connections' | 'weighted' | 'random' | 'consistent_hash';

interface ServiceInstance {
  id: string;
  host: string;
  port: number;
  protocol: 'http' | 'grpc' | 'mqtt';
  weight: number;
  activeConnections: number;
  lastHealthCheck: number;
  healthy: boolean;
  tags: string[];
}

interface ForwardTarget extends RouteTarget {
  instanceId?: string;
  latency?: number;
}

export class LoadBalancer extends EventEmitter {
  private instances: Map<string, ServiceInstance> = new Map();
  private strategy: LoadBalanceStrategy = 'round_robin';
  private roundRobinIndex = 0;
  private healthCheckInterval: NodeJS.Timeout;
  private readonly HEALTH_CHECK_INTERVAL = 10000;

  constructor() {
    super();
    
    this.healthCheckInterval = setInterval(() => {
      this.performHealthCheck();
    }, this.HEALTH_CHECK_INTERVAL);
  }

  registerInstance(instance: Omit<ServiceInstance, 'activeConnections' | 'lastHealthCheck' | 'healthy'>): ServiceInstance {
    const newInstance: ServiceInstance = {
      ...instance,
      activeConnections: 0,
      lastHealthCheck: Date.now(),
      healthy: true
    };
    
    this.instances.set(newInstance.id, newInstance);
    this.emit('instanceRegistered', newInstance);
    console.log(`[LoadBalancer] Registered instance: ${newInstance.id}`);
    
    return newInstance;
  }

  unregisterInstance(instanceId: string): boolean {
    const instance = this.instances.get(instanceId);
    if (!instance) return false;
    
    this.instances.delete(instanceId);
    this.emit('instanceUnregistered', instanceId);
    console.log(`[LoadBalancer] Unregistered instance: ${instanceId}`);
    
    return true;
  }

  setStrategy(strategy: LoadBalanceStrategy): void {
    this.strategy = strategy;
    this.roundRobinIndex = 0;
    console.log(`[LoadBalancer] Strategy changed to: ${strategy}`);
  }

  getStrategy(): LoadBalanceStrategy {
    return this.strategy;
  }

  selectTarget(message: ParsedMessage, targets: RouteTarget[]): ForwardTarget | null {
    const healthyTargets = targets.filter(t => {
      if (t.type !== 'webhook') return true;
      
      const url = new URL(t.value);
      const instance = Array.from(this.instances.values()).find(
        inst => inst.host === url.hostname && inst.port === parseInt(url.port)
      );
      
      return !instance || instance.healthy;
    });

    if (healthyTargets.length === 0) {
      return null;
    }

    switch (this.strategy) {
      case 'round_robin':
        return this.roundRobin(healthyTargets);
      
      case 'least_connections':
        return this.leastConnections(healthyTargets);
      
      case 'weighted':
        return this.weighted(healthyTargets);
      
      case 'random':
        return this.random(healthyTargets);
      
      case 'consistent_hash':
        return this.consistentHash(message, healthyTargets);
      
      default:
        return this.roundRobin(healthyTargets);
    }
  }

  private roundRobin(targets: RouteTarget[]): ForwardTarget {
    const target = targets[this.roundRobinIndex % targets.length];
    this.roundRobinIndex++;
    return { ...target };
  }

  private leastConnections(targets: RouteTarget[]): ForwardTarget {
    let minConnections = Infinity;
    let selected: RouteTarget | null = null;

    for (const target of targets) {
      let connections = 0;
      
      if (target.type === 'webhook') {
        try {
          const url = new URL(target.value);
          for (const inst of this.instances.values()) {
            if (inst.host === url.hostname && inst.port === parseInt(url.port)) {
              connections = inst.activeConnections;
              break;
            }
          }
        } catch {}
      }

      if (connections < minConnections) {
        minConnections = connections;
        selected = target;
      }
    }

    return { ...(selected || targets[0]) };
  }

  private weighted(targets: RouteTarget[]): ForwardTarget {
    const weightedTargets: { target: RouteTarget; weight: number }[] = targets.map(t => {
      let weight = 1;
      
      if (t.type === 'webhook') {
        try {
          const url = new URL(t.value);
          for (const inst of this.instances.values()) {
            if (inst.host === url.hostname && inst.port === parseInt(url.port)) {
              weight = inst.weight;
              break;
            }
          }
        } catch {}
      }
      
      return { target: t, weight };
    });

    const totalWeight = weightedTargets.reduce((sum, wt) => sum + wt.weight, 0);
    let random = Math.random() * totalWeight;
    
    for (const wt of weightedTargets) {
      random -= wt.weight;
      if (random <= 0) {
        return { ...wt.target };
      }
    }

    return { ...targets[0] };
  }

  private random(targets: RouteTarget[]): ForwardTarget {
    const index = Math.floor(Math.random() * targets.length);
    return { ...targets[index] };
  }

  private consistentHash(message: ParsedMessage, targets: RouteTarget[]): ForwardTarget {
    const hash = this.hashCode(message.deviceId || message.id);
    const index = hash % targets.length;
    return { ...targets[index] };
  }

  private hashCode(str: string): number {
    let hash = 0;
    for (let i = 0; i < str.length; i++) {
      const char = str.charCodeAt(i);
      hash = ((hash << 5) - hash) + char;
      hash = hash & hash;
    }
    return Math.abs(hash);
  }

  incrementConnections(target: RouteTarget): void {
    if (target.type !== 'webhook') return;
    
    try {
      const url = new URL(target.value);
      for (const inst of this.instances.values()) {
        if (inst.host === url.hostname && inst.port === parseInt(url.port)) {
          inst.activeConnections++;
          break;
        }
      }
    } catch {}
  }

  decrementConnections(target: RouteTarget): void {
    if (target.type !== 'webhook') return;
    
    try {
      const url = new URL(target.value);
      for (const inst of this.instances.values()) {
        if (inst.host === url.hostname && inst.port === parseInt(url.port)) {
          inst.activeConnections = Math.max(0, inst.activeConnections - 1);
          break;
        }
      }
    } catch {}
  }

  private async performHealthCheck(): Promise<void> {
    for (const [id, instance] of this.instances) {
      try {
        const response = await fetch(`${instance.protocol}://${instance.host}:${instance.port}/health`, {
          method: 'GET',
          signal: AbortSignal.timeout(3000)
        });
        
        instance.healthy = response.ok;
        instance.lastHealthCheck = Date.now();
        
        if (!response.ok) {
          this.emit('instanceUnhealthy', id);
          console.warn(`[LoadBalancer] Instance ${id} is unhealthy`);
        }
      } catch {
        instance.healthy = false;
        instance.lastHealthCheck = Date.now();
      }
    }
  }

  getHealthyInstances(): ServiceInstance[] {
    return Array.from(this.instances.values()).filter(i => i.healthy);
  }

  getInstance(instanceId: string): ServiceInstance | undefined {
    return this.instances.get(instanceId);
  }

  listInstances(): ServiceInstance[] {
    return Array.from(this.instances.values());
  }

  getStatistics(): {
    totalInstances: number;
    healthyInstances: number;
    strategy: LoadBalanceStrategy;
    totalConnections: number;
  } {
    const instances = Array.from(this.instances.values());
    
    return {
      totalInstances: instances.length,
      healthyInstances: instances.filter(i => i.healthy).length,
      strategy: this.strategy,
      totalConnections: instances.reduce((sum, i) => sum + i.activeConnections, 0)
    };
  }

  destroy(): void {
    clearInterval(this.healthCheckInterval);
    this.instances.clear();
  }
}

export const loadBalancer = new LoadBalancer();
