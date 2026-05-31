import type { Complex } from '@/types/quantum';

const PAGE_SIZE = 65536;

export interface MemoryPage {
  data: Complex[];
  pageIndex: number;
  lastAccessed: number;
  isDirty: boolean;
}

export class MemoryManager {
  private pages: Map<number, MemoryPage>;
  private maxPages: number;
  private memoryLimit: number;
  private currentTime: number;

  constructor(memoryLimitMB: number = 512) {
    this.pages = new Map();
    this.memoryLimit = memoryLimitMB * 1024 * 1024;
    this.maxPages = Math.floor(this.memoryLimit / (PAGE_SIZE * 16));
    this.currentTime = 0;
  }

  private allocatePage(pageIndex: number): MemoryPage {
    if (this.pages.size >= this.maxPages) {
      this.evictPage();
    }

    const page: MemoryPage = {
      data: Array(PAGE_SIZE).fill(null).map(() => ({ real: 0, imag: 0 })),
      pageIndex,
      lastAccessed: ++this.currentTime,
      isDirty: false,
    };

    this.pages.set(pageIndex, page);
    return page;
  }

  private evictPage(): void {
    let oldestPage: MemoryPage | null = null;
    let oldestIndex = -1;

    for (const [index, page] of this.pages) {
      if (!oldestPage || page.lastAccessed < oldestPage.lastAccessed) {
        oldestPage = page;
        oldestIndex = index;
      }
    }

    if (oldestIndex !== -1) {
      this.pages.delete(oldestIndex);
    }
  }

  private getPage(pageIndex: number): MemoryPage {
    let page = this.pages.get(pageIndex);
    if (!page) {
      page = this.allocatePage(pageIndex);
    }
    page.lastAccessed = ++this.currentTime;
    return page;
  }

  public get(index: number): Complex {
    const pageIndex = Math.floor(index / PAGE_SIZE);
    const offset = index % PAGE_SIZE;
    const page = this.getPage(pageIndex);
    return page.data[offset];
  }

  public set(index: number, value: Complex): void {
    const pageIndex = Math.floor(index / PAGE_SIZE);
    const offset = index % PAGE_SIZE;
    const page = this.getPage(pageIndex);
    page.data[offset] = { ...value };
    page.isDirty = true;
  }

  public allocate(size: number): Float64Array {
    const bytes = size * 16;
    if (bytes > this.memoryLimit) {
      throw new Error('内存不足');
    }
    return new Float64Array(bytes);
  }

  public getMemoryUsage(): number {
    return this.pages.size * PAGE_SIZE * 16;
  }

  public getPageCount(): number {
    return this.pages.size;
  }

  public clear(): void {
    this.pages.clear();
  }
}

export const MEMORY_THRESHOLD_10QUBIT = 1024 * 1024 * 16;
export const MEMORY_THRESHOLD_14QUBIT = 1024 * 1024 * 128;
export const MEMORY_THRESHOLD_20QUBIT = 1024 * 1024 * 512;

export const getRecommendedSimulatorType = (qubitCount: number): 'statevector' | 'mps' => {
  const dimension = 1 << qubitCount;
  const memoryNeeded = dimension * 16;

  if (qubitCount <= 10) {
    return 'statevector';
  } else if (qubitCount <= 14) {
    if (memoryNeeded < MEMORY_THRESHOLD_14QUBIT) {
      return 'statevector';
    }
    return 'mps';
  } else {
    return 'mps';
  }
};
