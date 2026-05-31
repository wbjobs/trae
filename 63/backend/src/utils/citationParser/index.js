const { v4: uuidv4 } = require('uuid');
const { CITATION_PATTERNS } = require('./patterns');
const formatParsers = require('./formatParsers');
const authorParser = require('./authorParser');

class CitationParser {
  constructor() {
    this.patterns = CITATION_PATTERNS;
    this.formatParsers = formatParsers;
    this.authorParser = authorParser;
  }

  parse(rawCitation, format = 'auto') {
    const trimmed = rawCitation.trim();
    
    let detectedFormat = format;
    if (format === 'auto') {
      detectedFormat = this.detectFormat(trimmed);
    }

    const result = {
      id: uuidv4(),
      raw: trimmed,
      format: detectedFormat,
      formatName: this.patterns[detectedFormat]?.name || 'Unknown',
      parsed: this.parseByFormat(trimmed, detectedFormat),
      confidence: this.calculateConfidence(trimmed, detectedFormat),
      warnings: this.generateWarnings(trimmed, detectedFormat)
    };

    return result;
  }

  detectFormat(citation) {
    const scores = {};

    Object.entries(this.patterns).forEach(([key, pattern]) => {
      let score = 0;
      
      if (pattern.detect && pattern.detect(citation)) {
        score += pattern.weight * 10;
      }

      if (pattern.regex && pattern.regex.test(citation)) {
        score += 20;
      }

      if (score > 0) {
        scores[key] = score;
      }
    });

    const sorted = Object.entries(scores).sort((a, b) => b[1] - a[1]);
    return sorted.length > 0 ? sorted[0][0] : 'unknown';
  }

  parseByFormat(citation, format) {
    const base = this.createBaseLiterature();

    switch (format) {
      case 'apa':
        return this.formatParsers.parseAPA(citation, base);
      case 'gb7714':
        return this.formatParsers.parseGB7714(citation, base);
      case 'ieee':
        return this.formatParsers.parseIEEE(citation, base);
      case 'mla':
        return this.formatParsers.parseMLA(citation, base);
      case 'chicago':
        return this.formatParsers.parseChicago(citation, base);
      default:
        return this.formatParsers.parseGeneric(citation, base);
    }
  }

  createBaseLiterature() {
    return {
      authors: [],
      title: '',
      journal: '',
      year: null,
      volume: null,
      issue: null,
      pages: '',
      doi: '',
      url: '',
      publisher: '',
      isbn: '',
      citationNumber: null
    };
  }

  calculateConfidence(citation, format) {
    let score = 0;
    
    if (citation.length > 20) score += 15;
    if (citation.length > 50) score += 10;
    if (citation.length > 100) score += 5;
    
    if (/\d{4}/.test(citation)) score += 15;
    if (/\d+-\d+/.test(citation)) score += 10;
    
    const authorCount = citation.split(/[,，;；]/).length;
    score += Math.min(authorCount * 3, 15);
    
    if (format !== 'unknown') score += 25;
    
    const hasDoi = /10\.\d{4,9}\//i.test(citation);
    if (hasDoi) score += 10;
    
    const hasUrl = /https?:\/\//.test(citation);
    if (hasUrl) score += 5;

    return Math.min(score, 100);
  }

  generateWarnings(citation, format) {
    const warnings = [];

    if (format === 'unknown') {
      warnings.push({
        type: 'info',
        message: '无法识别引文格式，使用通用解析器'
      });
    }

    if (!/\d{4}/.test(citation)) {
      warnings.push({
        type: 'warning',
        message: '未找到发表年份'
      });
    }

    if (!/[.,;]\s*[^.,;]+[.,;]/.test(citation)) {
      warnings.push({
        type: 'warning',
        message: '引文结构可能不完整'
      });
    }

    if (citation.length < 20) {
      warnings.push({
        type: 'warning',
        message: '引文内容过短，可能缺少必要字段'
      });
    }

    return warnings;
  }

  parseBatch(citations, format = 'auto') {
    return citations.map(citation => this.parse(citation, format));
  }

  formatAuthors(authors, style = 'default', maxAuthors = null) {
    return this.authorParser.formatAuthors(authors, style, maxAuthors);
  }

  validate(literature) {
    const errors = [];
    
    if (!literature.title || literature.title.length < 5) {
      errors.push({ field: 'title', message: '标题过短或缺失' });
    }
    
    if (!literature.authors || literature.authors.length === 0) {
      errors.push({ field: 'authors', message: '作者信息缺失' });
    }
    
    if (!literature.year) {
      errors.push({ field: 'year', message: '发表年份缺失' });
    }
    
    return {
      valid: errors.length === 0,
      errors
    };
  }
}

module.exports = new CitationParser();
module.exports.authorParser = authorParser;
