const BaseCrawler = require('./baseCrawler');
const cheerio = require('cheerio');
const { mockLiteratures, searchMockLiterature } = require('../data/mockLiterature');

class CnkiCrawler extends BaseCrawler {
  constructor() {
    super('CNKI');
    this.baseURL = 'https://cnki.net';
  }

  async search(query, options = {}) {
    console.log(`[${this.name}] 正在搜索: ${query}`);
    
    await this.delay(500);
    
    const results = searchMockLiterature(query).map(lit => ({
      ...lit,
      source: this.name,
      sourceUrl: `${this.baseURL}/kcms/detail/${lit.id}.html`
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
    
    await this.delay(300);
    
    const literature = mockLiteratures.find(l => l.id === id);
    if (!literature) {
      throw new Error(`未找到文献: ${id}`);
    }

    return {
      ...literature,
      source: this.name,
      sourceUrl: `${this.baseURL}/kcms/detail/${id}.html`,
      crawledAt: new Date().toISOString()
    };
  }

  parseSearchResults(html) {
    const $ = cheerio.load(html);
    const results = [];

    $('.result-item').each((i, el) => {
      const $el = $(el);
      results.push({
        id: $el.data('id'),
        title: this.sanitizeText($el.find('.title').text()),
        authors: $el.find('.authors').text().split(/[,;]/).map(a => ({ fullName: a.trim() })).filter(a => a.fullName),
        journal: this.sanitizeText($el.find('.journal').text()),
        year: parseInt($el.find('.year').text()) || null,
        source: this.name
      });
    });

    return results;
  }

  parseDetail(html) {
    const $ = cheerio.load(html);
    
    return {
      title: this.sanitizeText($('#title').text()),
      authors: $('#authors a').map((i, el) => ({
        fullName: this.sanitizeText($(el).text())
      })).get(),
      journal: this.sanitizeText($('#journal').text()),
      year: parseInt($('#year').text()) || null,
      volume: parseInt($('#volume').text()) || null,
      issue: parseInt($('#issue').text()) || null,
      pages: this.sanitizeText($('#pages').text()),
      doi: this.sanitizeText($('#doi').text()),
      abstract: this.sanitizeText($('#abstract').text()),
      keywords: $('#keywords a').map((i, el) => this.sanitizeText($(el).text())).get()
    };
  }
}

module.exports = new CnkiCrawler();
