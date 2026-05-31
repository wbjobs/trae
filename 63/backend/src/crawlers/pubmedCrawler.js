const BaseCrawler = require('./baseCrawler');
const cheerio = require('cheerio');
const { mockLiteratures, searchMockLiterature } = require('../data/mockLiterature');

class PubMedCrawler extends BaseCrawler {
  constructor() {
    super('PubMed');
    this.baseURL = 'https://pubmed.ncbi.nlm.nih.gov';
  }

  async search(query, options = {}) {
    console.log(`[${this.name}] 正在搜索: ${query}`);
    
    await this.delay(600);
    
    const results = searchMockLiterature(query).slice(0, 5).map(lit => ({
      ...lit,
      id: `pmid-${lit.id}`,
      source: this.name,
      sourceUrl: `${this.baseURL}/${lit.id.replace('lit-', '')}`
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
    
    await this.delay(400);
    
    const originalId = id.replace('pmid-', '');
    const literature = mockLiteratures.find(l => l.id === originalId);
    if (!literature) {
      throw new Error(`未找到文献: ${id}`);
    }

    return {
      ...literature,
      id: id,
      source: this.name,
      sourceUrl: `${this.baseURL}/${id.replace('pmid-', '')}`,
      crawledAt: new Date().toISOString()
    };
  }

  parseSearchResults(html) {
    const $ = cheerio.load(html);
    const results = [];

    $('.docsum-content').each((i, el) => {
      const $el = $(el);
      results.push({
        id: $el.data('pmid'),
        title: this.sanitizeText($el.find('.docsum-title').text()),
        authors: $el.find('.docsum-authors').text().split(/[,;]/).map(a => ({ fullName: a.trim() })).filter(a => a.fullName),
        journal: this.sanitizeText($el.find('.docsum-journal').text()),
        year: parseInt($el.find('.docsum-pmid').prev().text().match(/\d{4}/)?.[0]) || null,
        source: this.name
      });
    });

    return results;
  }

  parseDetail(html) {
    const $ = cheerio.load(html);
    
    return {
      title: this.sanitizeText($('h1.heading-title').text()),
      authors: $('.authors-list .authors-list-item').map((i, el) => ({
        fullName: this.sanitizeText($(el).find('.full-name').text())
      })).get(),
      journal: this.sanitizeText($('.journal-actions .journal-name').text()),
      year: parseInt($('.cit').text().match(/\d{4}/)?.[0]) || null,
      abstract: this.sanitizeText($('#abstract').text()),
      doi: this.sanitizeText($('.identifier.doi').text()),
      keywords: $('.keywords-section .keyword').map((i, el) => this.sanitizeText($(el).text())).get()
    };
  }
}

module.exports = new PubMedCrawler();
