const BaseCrawler = require('./baseCrawler');
const { mockLiteratures, searchMockLiterature } = require('../data/mockLiterature');

class IEEECrawler extends BaseCrawler {
  constructor() {
    super('IEEE');
    this.baseURL = 'https://ieeexplore.ieee.org';
  }

  async search(query, options = {}) {
    console.log(`[${this.name}] 正在搜索: ${query}`);
    
    await this.delay(700);
    
    const results = searchMockLiterature(query).slice(0, 4).map(lit => ({
      ...lit,
      id: `ieee-${lit.id}`,
      source: this.name,
      sourceUrl: `${this.baseURL}/document/${lit.id.replace('lit-', '')}`
    }));

    return {
      source: this.name,
      query,
      total: results.length,
      results
    };
  }

  async getDetail(id, options = {}) {
    console.log(`[${this.name}] 获取详情: ${id}`);
    
    await this.delay(350);
    
    const originalId = id.replace('ieee-', '');
    const literature = mockLiteratures.find(l => l.id === originalId);
    if (!literature) {
      throw new Error(`未找到文献: ${id}`);
    }

    return {
      ...literature,
      id: id,
      source: this.name,
      sourceUrl: `${this.baseURL}/document/${id.replace('ieee-', '')}`,
      crawledAt: new Date().toISOString()
    };
  }
}

module.exports = new IEEECrawler();
