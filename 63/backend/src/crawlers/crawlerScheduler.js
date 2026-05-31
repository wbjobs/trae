const EventEmitter = require('events');
const { v4: uuidv4 } = require('uuid');

const BaseCrawler = require('./baseCrawler');
const { mockLiterature } = require('../data/mockLiterature');
const weightCalculator = require('../utils/weightCalculator');
const { crawlQueue } = require('./taskQueue');
const { searchCache, literatureCache } = require('../utils/cacheManager');

class CrawlerScheduler extends EventEmitter {
  constructor() {
    super();
    
    this.crawlers = new Map();
    this.searchTasks = new Map();
    
    this.registerCrawler('cnki', require('./cnkiCrawler'));
    this.registerCrawler('pubmed', require('./pubmedCrawler'));
    this.registerCrawler('ieee', require('./ieeeCrawler'));
  }

  registerCrawler(name, crawler) {
    if (crawler instanceof BaseCrawler) {
      this.crawlers.set(name, crawler);
    } else {
      console.warn(`[Scheduler] 无效的爬虫实例: ${name}`);
    }
  }

  getAvailableSources() {
    return Array.from(this.crawlers.keys());
  }

  async search(query, options = {}) {
    const {
      sources = this.getAvailableSources(),
      limit = 20,
      sortBy = 'relevance',
      deduplicate = true,
      useCache = true
    } = options;

    const cacheKey = searchCache.generateKey(query, sources.sort().join(','), sortBy);
    
    if (useCache) {
      const cached = searchCache.get(cacheKey);
      if (cached) {
        return {
          ...cached.data,
          cached: true,
          cachedAt: cached.expiresAt
        };
      }
    }

    const taskId = uuidv4();
    
    const sourceResults = await Promise.all(
      sources.map(source => this.searchSource(source, query, options))
    );

    const merged = this.mergeResults(sourceResults, { query, sortBy, deduplicate, limit });

    const result = {
      taskId,
      query,
      total: merged.length,
      sources: sourceResults.map(s => ({
        name: s.source,
        count: s.results?.length || 0,
        status: s.status
      })),
      results: merged,
      sortBy,
      timestamp: Date.now()
    };

    searchCache.set(cacheKey, result, 24 * 60 * 60 * 1000, ['search']);

    merged.forEach(lit => {
      const litCacheKey = literatureCache.generateKey(lit.id || lit.doi || lit.title);
      if (!literatureCache.has(litCacheKey)) {
        literatureCache.set(litCacheKey, lit, 7 * 24 * 60 * 60 * 1000, ['literature', ...(lit.sources || [])]);
      }
    });

    return result;
  }

  async searchSource(sourceName, query, options = {}) {
    const crawler = this.crawlers.get(sourceName);
    
    if (!crawler) {
      return {
        source: sourceName,
        status: 'error',
        error: '未找到爬虫',
        results: []
      };
    }

    const cacheKey = searchCache.generateKey(sourceName, query);
    const cached = searchCache.get(cacheKey);
    
    if (cached) {
      return {
        source: sourceName,
        status: 'cached',
        results: cached.data
      };
    }

    try {
      const task = crawlQueue.createTask('search', {
        source: sourceName,
        query,
        options
      }, {
        priority: options.priority || 0,
        metadata: { crawler }
      });

      crawlQueue.add(task);

      return await new Promise((resolve, reject) => {
        const timeout = setTimeout(() => {
          resolve({
            source: sourceName,
            status: 'timeout',
            results: []
          });
        }, options.timeout || 30000);

        crawlQueue.once(`task:complete:${task.id}`, (completedTask) => {
          clearTimeout(timeout);
          searchCache.set(cacheKey, completedTask.result, 6 * 60 * 60 * 1000, ['search', sourceName]);
          resolve({
            source: sourceName,
            status: 'success',
            results: completedTask.result
          });
        });

        crawlQueue.once(`task:fail:${task.id}`, (failedTask) => {
          clearTimeout(timeout);
          resolve({
            source: sourceName,
            status: 'error',
            error: failedTask.error,
            results: []
          });
        });
      });

    } catch (error) {
      return {
        source: sourceName,
        status: 'error',
        error: error.message,
        results: this.getMockResults(query, 3)
      };
    }
  }

  async getBatchDetails(ids, source) {
    const results = [];
    
    for (const id of ids) {
      const cacheKey = literatureCache.generateKey(id);
      const cached = literatureCache.get(cacheKey);
      
      if (cached) {
        results.push({ id, data: cached.data, cached: true });
        continue;
      }

      const crawler = this.crawlers.get(source);
      if (crawler && crawler.getDetail) {
        try {
          const detail = await crawler.getDetail(id);
          literatureCache.set(cacheKey, detail, 7 * 24 * 60 * 60 * 1000, ['literature', source]);
          results.push({ id, data: detail, cached: false });
        } catch (e) {
          results.push({ id, error: e.message });
        }
      }
    }

    return results;
  }

  getMockResults(query, count = 5) {
    const shuffled = [...mockLiterature].sort(() => Math.random() - 0.5);
    return shuffled.slice(0, count).map(lit => ({
      ...lit,
      title: query ? `${lit.title} - ${query}相关` : lit.title,
      id: `${lit.source}-mock-${uuidv4().substring(0, 8)}`
    }));
  }

  mergeResults(sourceResults, options = {}) {
    const merged = new Map();
    const deduplicate = options.deduplicate !== false;

    sourceResults.forEach(source => {
      if (!source.results) return;
      
      source.results.forEach((lit, index) => {
        const key = deduplicate ? this.generateDeduplicateKey(lit) : `${lit.source}-${lit.id}`;
        
        if (merged.has(key)) {
          const existing = merged.get(key);
          existing.sources = existing.sources || [];
          if (!existing.sources.includes(lit.source)) {
            existing.sources.push(lit.source);
          }
          existing.sourceUrls = existing.sourceUrls || {};
          existing.sourceUrls[lit.source] = lit.sourceUrl;
          existing._searchRank = Math.min(existing._searchRank || Infinity, index);
        } else {
          merged.set(key, {
            ...lit,
            sources: [lit.source],
            sourceUrls: { [lit.source]: lit.sourceUrl },
            _searchRank: index
          });
        }
      });
    });

    let results = Array.from(merged.values());

    if (options.sortBy === 'citations') {
      results.sort((a, b) => (b.citationCount || 0) - (a.citationCount || 0));
    } else if (options.sortBy === 'year') {
      results.sort((a, b) => (b.year || 0) - (a.year || 0));
    } else if (options.sortBy === 'relevance' && options.query) {
      const weightedResults = weightCalculator.calculateBatch(results, { query: options.query });
      results = weightedResults.sort((a, b) => {
        const scoreDiff = (b.weight?.totalScore || 0) - (a.weight?.totalScore || 0);
        if (Math.abs(scoreDiff) > 0.01) return scoreDiff;
        return (a._searchRank || 0) - (b._searchRank || 0);
      });
    } else {
      results.sort((a, b) => (a._searchRank || 0) - (b._searchRank || 0));
    }

    if (options.limit) {
      results = results.slice(0, options.limit);
    }

    results.forEach(r => delete r._searchRank);

    return results;
  }

  generateDeduplicateKey(lit) {
    if (lit.doi) return `doi:${lit.doi.toLowerCase()}`;
    if (lit.title) return `title:${lit.title.toLowerCase().normalize()}`;
    return `id:${lit.source}-${lit.id}`;
  }

  getQueueStatus() {
    return crawlQueue.getStats();
  }

  async cancelSearch(taskId) {
    const task = this.searchTasks.get(taskId);
    if (task) {
      task.cancelled = true;
      return true;
    }
    return false;
  }
}

module.exports = new CrawlerScheduler();
