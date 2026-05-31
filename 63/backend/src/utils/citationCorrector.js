const { FIELD_PATTERNS } = require('./citationParser/patterns');

const COMMON_JOURNALS = {
  'nature': 'Nature',
  'science': 'Science',
  'cell': 'Cell',
  'lancet': 'The Lancet',
  'nejm': 'The New England Journal of Medicine',
  'jama': 'JAMA',
  'pnas': 'Proceedings of the National Academy of Sciences',
  'ieee trans': 'IEEE Transactions on',
  'acm trans': 'ACM Transactions on'
};

const PUNCTUATION_RULES = {
  apa: {
    authorEnd: '.',
    yearWrap: '()',
    titleEnd: '.',
    journalItalic: true,
    separator: ', '
  },
  gb7714: {
    authorEnd: '.',
    yearEnd: '.',
    titleEnd: '[J].',
    journalEnd: ',',
    separator: '. '
  },
  ieee: {
    authorEnd: ',',
    titleWrap: '""',
    inPrefix: 'in',
    separator: ', '
  }
};

class CitationCorrector {
  constructor() {
    this.rules = {
      punctuation: true,
      authorNames: true,
      journalNames: true,
      yearRange: true,
      pageNumbers: true,
      doiFormat: true,
      urlFormat: true,
      consistency: true
    };
  }

  analyze(parsedCitation) {
    const issues = [];
    const suggestions = [];
    const fixed = { ...parsedCitation };

    this.checkPunctuation(parsedCitation, issues, suggestions, fixed);
    this.checkAuthorNames(parsedCitation, issues, suggestions, fixed);
    this.checkJournalNames(parsedCitation, issues, suggestions, fixed);
    this.checkYearRange(parsedCitation, issues, suggestions, fixed);
    this.checkPageNumbers(parsedCitation, issues, suggestions, fixed);
    this.checkDOI(parsedCitation, issues, suggestions, fixed);
    this.checkURL(parsedCitation, issues, suggestions, fixed);
    this.checkConsistency(parsedCitation, issues, suggestions, fixed);

    const score = this.calculateScore(issues);

    return {
      issues,
      suggestions,
      fixed,
      score,
      canAutoFix: issues.every(i => i.autoFixable)
    };
  }

  checkPunctuation(citation, issues, suggestions, fixed) {
    const raw = citation.raw || '';
    const format = citation.format;
    const rules = PUNCTUATION_RULES[format];

    if (!rules) return;

    if (format === 'gb7714' && !raw.includes('[J]') && !raw.includes('[M]')) {
      issues.push({
        type: 'punctuation',
        severity: 'warning',
        message: 'GB/T 7714 格式缺少文献类型标识',
        autoFixable: true,
        suggestion: '在标题后添加 [J] 表示期刊论文'
      });
    }

    if (format === 'ieee') {
      const quoteMatch = raw.match(/"([^"]+)"/);
      if (!quoteMatch) {
        issues.push({
          type: 'punctuation',
          severity: 'error',
          message: 'IEEE 格式标题应使用双引号',
          autoFixable: true,
          suggestion: '将标题用双引号包裹'
        });
      }
    }

    if (raw.includes('，') || raw.includes('。')) {
      issues.push({
        type: 'punctuation',
        severity: 'info',
        message: '检测到中文标点符号',
        autoFixable: true,
        suggestion: '建议替换为英文标点符号'
      });
      
      if (fixed.raw) {
        fixed.raw = fixed.raw
          .replace(/，/g, ', ')
          .replace(/。/g, '. ')
          .replace(/；/g, '; ')
          .replace(/：/g, ': ');
      }
    }

    if (/[.,;:]{2,}/.test(raw)) {
      issues.push({
        type: 'punctuation',
        severity: 'warning',
        message: '检测到重复的标点符号',
        autoFixable: true,
        suggestion: '移除重复的标点符号'
      });
      
      if (fixed.raw) {
        fixed.raw = fixed.raw.replace(/([.,;:])\1+/g, '$1');
      }
    }
  }

  checkAuthorNames(citation, issues, suggestions, fixed) {
    const authors = citation.parsed?.authors || [];
    
    authors.forEach((author, index) => {
      if (author.lastName && author.lastName.length < 2) {
        issues.push({
          type: 'author',
          severity: 'warning',
          message: `第 ${index + 1} 位作者姓氏可能不完整`,
          autoFixable: false
        });
      }

      if (author.fullName && /^[a-z]/.test(author.fullName)) {
        issues.push({
          type: 'author',
          severity: 'info',
          message: `作者名 "${author.fullName}" 首字母应为大写`,
          autoFixable: true,
          suggestion: '将作者名首字母大写'
        });
        
        if (fixed.parsed?.authors?.[index]) {
          fixed.parsed.authors[index].fullName = this.capitalizeName(author.fullName);
        }
      }

      if (author.initials && !/^[A-Z]\./.test(author.initials)) {
        issues.push({
          type: 'author',
          severity: 'info',
          message: `作者缩写格式不正确: ${author.initials}`,
          autoFixable: true,
          suggestion: '使用 "A. B." 格式'
        });
      }
    });

    if (authors.length === 0 && !citation.format?.includes('web')) {
      issues.push({
        type: 'author',
        severity: 'error',
        message: '未检测到作者信息',
        autoFixable: false
      });
    }
  }

  checkJournalNames(citation, issues, suggestions, fixed) {
    const journal = citation.parsed?.journal || '';
    
    if (!journal && !citation.format?.includes('web')) {
      issues.push({
        type: 'journal',
        severity: 'warning',
        message: '未检测到期刊名',
        autoFixable: false
      });
      return;
    }

    const journalLower = journal.toLowerCase();
    for (const [key, proper] of Object.entries(COMMON_JOURNALS)) {
      if (journalLower.includes(key) && journal !== proper) {
        issues.push({
          type: 'journal',
          severity: 'info',
          message: `期刊名 "${journal}" 建议使用标准格式`,
          autoFixable: true,
          suggestion: `改为 "${proper}"`
        });
        
        if (fixed.parsed) {
          fixed.parsed.journal = proper;
        }
        break;
      }
    }

    if (/^[a-z]/.test(journal)) {
      issues.push({
        type: 'journal',
        severity: 'info',
        message: '期刊名首字母应为大写',
        autoFixable: true
      });
      
      if (fixed.parsed) {
        fixed.parsed.journal = this.capitalizeWords(journal);
      }
    }
  }

  checkYearRange(citation, issues, suggestions, fixed) {
    const year = citation.parsed?.year;
    
    if (!year) {
      issues.push({
        type: 'year',
        severity: 'error',
        message: '未检测到发表年份',
        autoFixable: false
      });
      return;
    }

    const currentYear = new Date().getFullYear();
    
    if (year < 1800) {
      issues.push({
        type: 'year',
        severity: 'error',
        message: `年份 ${year} 过早，可能有误`,
        autoFixable: false
      });
    } else if (year > currentYear + 1) {
      issues.push({
        type: 'year',
        severity: 'warning',
        message: `年份 ${year} 晚于当前年份，可能有误`,
        autoFixable: false
      });
    }

    if (year >= 2020 && year <= currentYear) {
      suggestions.push({
        type: 'info',
        message: '该文献为近年发表，引用价值较高'
      });
    }
  }

  checkPageNumbers(citation, issues, suggestions, fixed) {
    const pages = citation.parsed?.pages || '';
    
    if (!pages) return;

    if (pages.includes('-')) {
      const [start, end] = pages.split('-').map(n => parseInt(n.trim()));
      
      if (!isNaN(start) && !isNaN(end)) {
        if (start > end) {
          issues.push({
            type: 'pages',
            severity: 'warning',
            message: `页码范围 ${pages} 起始页大于结束页`,
            autoFixable: true,
            suggestion: `应为 ${end}-${start}`
          });
          
          if (fixed.parsed) {
            fixed.parsed.pages = `${end}-${start}`;
          }
        }
        
        const pageCount = end - start + 1;
        if (pageCount > 100) {
          suggestions.push({
            type: 'info',
            message: `该文献共 ${pageCount} 页，内容较详实`
          });
        }
      }
    }

    if (/^[0-9]+$/.test(pages)) {
      issues.push({
        type: 'pages',
        severity: 'info',
        message: '页码仅包含单页，建议检查是否应为范围',
        autoFixable: false
      });
    }
  }

  checkDOI(citation, issues, suggestions, fixed) {
    const doi = citation.parsed?.doi || '';
    
    if (!doi) return;

    const doiMatch = doi.match(FIELD_PATTERNS.doi);
    if (!doiMatch) {
      issues.push({
        type: 'doi',
        severity: 'warning',
        message: `DOI 格式不正确: ${doi}`,
        autoFixable: true,
        suggestion: 'DOI 格式应为 10.xxxx/xxxxx'
      });
    }

    if (doi.includes('https://') || doi.includes('http://')) {
      const cleanDoi = doi.replace(/^https?:\/\/(dx\.)?doi\.org\//, '');
      issues.push({
        type: 'doi',
        severity: 'info',
        message: 'DOI 不应包含 URL 前缀',
        autoFixable: true,
        suggestion: `改为 ${cleanDoi}`
      });
      
      if (fixed.parsed) {
        fixed.parsed.doi = cleanDoi;
      }
    }
  }

  checkURL(citation, issues, suggestions, fixed) {
    const url = citation.parsed?.url || '';
    
    if (!url) return;

    try {
      new URL(url);
      
      if (url.includes('doi.org')) {
        suggestions.push({
          type: 'info',
          message: '检测到 DOI 链接，建议单独提取 DOI 字段'
        });
      }
    } catch (e) {
      issues.push({
        type: 'url',
        severity: 'warning',
        message: `URL 格式无效: ${url}`,
        autoFixable: false
      });
    }

    const accessDateMatch = citation.raw?.match(/(?:访问|retrieved|accessed).*?(\d{4}[-/]\d{1,2}[-/]\d{1,2})/i);
    if (citation.format === 'apa' && !accessDateMatch) {
      issues.push({
        type: 'url',
        severity: 'info',
        message: 'APA 格式网页引用建议添加访问日期',
        autoFixable: false
      });
    }
  }

  checkConsistency(citation, issues, suggestions, fixed) {
    const parsed = citation.parsed;
    if (!parsed) return;

    const hasJournal = parsed.journal && parsed.journal.length > 0;
    const hasVolume = parsed.volume !== null && parsed.volume !== undefined;
    const hasPages = parsed.pages && parsed.pages.length > 0;

    if (hasJournal && !hasVolume) {
      issues.push({
        type: 'consistency',
        severity: 'info',
        message: '检测到期刊名但缺少卷号',
        autoFixable: false
      });
    }

    if (hasVolume && !hasPages) {
      issues.push({
        type: 'consistency',
        severity: 'info',
        message: '检测到卷号但缺少页码',
        autoFixable: false
      });
    }

    if (parsed.authors && parsed.authors.length > 10) {
      suggestions.push({
        type: 'info',
        message: `该文献有 ${parsed.authors.length} 位作者，建议检查是否需要缩写`
      });
    }

    if (parsed.title && parsed.title.length > 200) {
      suggestions.push({
        type: 'info',
        message: '标题较长，确认是否为完整标题'
      });
    }
  }

  calculateScore(issues) {
    if (issues.length === 0) return 100;

    const severityWeights = {
      error: 20,
      warning: 10,
      info: 3
    };

    const totalPenalty = issues.reduce((sum, issue) => {
      return sum + (severityWeights[issue.severity] || 5);
    }, 0);

    return Math.max(0, 100 - totalPenalty);
  }

  capitalizeName(name) {
    return name.replace(/\b(\w)/g, (match) => match.toUpperCase());
  }

  capitalizeWords(str) {
    return str.replace(/\b(\w)/g, (match) => match.toUpperCase());
  }

  autoFix(parsedCitation) {
    const analysis = this.analyze(parsedCitation);
    
    if (!analysis.canAutoFix) {
      return {
        success: false,
        message: '存在无法自动修复的问题',
        analysis,
        partiallyFixed: analysis.fixed
      };
    }

    return {
      success: true,
      fixed: analysis.fixed,
      issuesFixed: analysis.issues.filter(i => i.autoFixable).length,
      analysis
    };
  }

  batchAnalyze(citations) {
    const results = citations.map(citation => ({
      id: citation.id,
      raw: citation.raw,
      ...this.analyze(citation)
    }));

    const errorCount = results.filter(r => r.issues.some(i => i.severity === 'error')).length;
    const warningCount = results.filter(r => r.issues.some(i => i.severity === 'warning')).length;
    const avgScore = results.reduce((sum, r) => sum + r.score, 0) / results.length;

    return {
      total: results.length,
      errorCount,
      warningCount,
      avgScore: avgScore.toFixed(1),
      results
    };
  }
}

module.exports = new CitationCorrector();
