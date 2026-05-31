import { EventEmitter } from 'events';
import type { ParsedMessage } from '../../../common/types';

interface CacheEntry {
  message: ParsedMessage;
  timestamp: number;
  accessCount: number;
  lastAccess: number;
}

interface CacheStats {
  hits: number;
  misses: number;
  evictions: number;
  size: number;
  maxSize: number;
  hitRate: number;
}

export class ParseResultCache extends EventEmitter {
  private cache: Map<string, CacheEntry> = new Map();
  private maxSize: number;
  private ttl: number;
  private stats: CacheStats = {
    hits: 0,
    misses: 0,
    evictions: 0,
    size: 0,
    maxSize: 0,
    hitRate: 0
  };
  private cleanupInterval: NodeJS.Timeout;

  constructor(maxSize = 10000, ttl = 5 * 60 * 1000) {
    super();
    this.maxSize = maxSize;
    this.ttl = ttl;
    this.stats.maxSize = maxSize;
    
    this.cleanupInterval = setInterval(() => this.cleanup(), 60000);
  }

  private generateKey(rawData: string, protocol: string, schemaId?: string): string {
    return `${protocol}:${schemaId || 'auto'}:${rawData.length}:${rawData.slice(0, 100)}`;
  }

  put(message: ParsedMessage): void {
    const key = this.generateKey(message.rawData, message.protocol, message.schemaId);
    
    if (this.cache.size >= this.maxSize) {
      this.evictOldest();
    }
    
    const entry: CacheEntry = {
      message,
      timestamp: Date.now(),
      accessCount: 0,
      lastAccess: Date.now()
    };
    
    this.cache.set(key, entry);
    this.stats.size = this.cache.size;
    
    this.emit('cachePut', { key, messageId: message.id });
  }

  get(rawData: string, protocol: string, schemaId?: string): ParsedMessage | undefined {
    const key = this.generateKey(rawData, protocol, schemaId);
    const entry = this.cache.get(key);
    
    if (!entry) {
      this.stats.misses++;
      this.updateHitRate();
      return undefined;
    }
    
    if (Date.now() - entry.timestamp > this.ttl) {
      this.cache.delete(key);
      this.stats.evictions++;
      this.stats.misses++;
      this.stats.size = this.cache.size;
      this.updateHitRate();
      return undefined;
    }
    
    entry.accessCount++;
    entry.lastAccess = Date.now();
    this.stats.hits++;
    this.updateHitRate();
    
    this.emit('cacheHit', { key, messageId: entry.message.id });
    
    return entry.message;
  }

  has(rawData: string, protocol: string, schemaId?: string): boolean {
    const key = this.generateKey(rawData, protocol, schemaId);
    const entry = this.cache.get(key);
    
    if (!entry) return false;
    
    if (Date.now() - entry.timestamp > this.ttl) {
      this.cache.delete(key);
      return false;
    }
    
    return true;
  }

  invalidate(rawData: string, protocol: string, schemaId?: string): boolean {
    const key = this.generateKey(rawData, protocol, schemaId);
    return this.cache.delete(key);
  }

  invalidateByDevice(deviceId: string): number {
    let count = 0;
    for (const [key, entry] of this.cache) {
      if (entry.message.deviceId === deviceId) {
        this.cache.delete(key);
        count++;
      }
    }
    this.stats.size = this.cache.size;
    return count;
  }

  invalidateByProtocol(protocol: string): number {
    let count = 0;
    for (const [key, entry] of this.cache) {
      if (entry.message.protocol === protocol) {
        this.cache.delete(key);
        count++;
      }
    }
    this.stats.size = this.cache.size;
    return count;
  }

  invalidateAll(): void {
    this.cache.clear();
    this.stats.size = 0;
    this.emit('cacheCleared');
  }

  private evictOldest(): void {
    let oldestKey: string | undefined;
    let oldestTime = Infinity;
    
    for (const [key, entry] of this.cache) {
      if (entry.lastAccess < oldestTime) {
        oldestTime = entry.lastAccess;
        oldestKey = key;
      }
    }
    
    if (oldestKey) {
      this.cache.delete(oldestKey);
      this.stats.evictions++;
      this.stats.size = this.cache.size;
      this.emit('cacheEviction', { key: oldestKey });
    }
  }

  private cleanup(): void {
    const now = Date.now();
    let evicted = 0;
    
    for (const [key, entry] of this.cache) {
      if (now - entry.timestamp > this.ttl) {
        this.cache.delete(key);
        evicted++;
      }
    }
    
    if (evicted > 0) {
      this.stats.evictions += evicted;
      this.stats.size = this.cache.size;
      console.log(`[CachePool] Cleaned up ${evicted} expired entries`);
    }
  }

  private updateHitRate(): void {
    const total = this.stats.hits + this.stats.misses;
    this.stats.hitRate = total > 0 ? Math.round((this.stats.hits / total) * 100) : 0;
  }

  getStats(): CacheStats {
    return { ...this.stats };
  }

  getTopAccessed(limit = 10): Array<{ key: string; accessCount: number; messageId: string }> {
    const entries = Array.from(this.cache.entries())
      .map(([key, entry]) => ({
        key,
        accessCount: entry.accessCount,
        messageId: entry.message.id
      }))
      .sort((a, b) => b.accessCount - a.accessCount)
      .slice(0, limit);
    
    return entries;
  }

  resize(newMaxSize: number): void {
    this.maxSize = newMaxSize;
    this.stats.maxSize = newMaxSize;
    
    while (this.cache.size > newMaxSize) {
      this.evictOldest();
    }
  }

  setTTL(newTTL: number): void {
    this.ttl = newTTL;
  }

  destroy(): void {
    clearInterval(this.cleanupInterval);
    this.cache.clear();
  }
}

export const parseResultCache = new ParseResultCache();
