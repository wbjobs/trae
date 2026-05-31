const FORMAT_RULES = {
  APA: {
    name: 'APA 7th',
    description: '美国心理学会格式',
    template: '{authors}. ({year}). {title}. {journal}, {volume}({issue}), {pages}.',
    rules: {
      authorFormat: 'lastName, F. M.',
      authorSeparator: ', ',
      lastAuthorSeparator: ', & ',
      titleCase: 'sentence',
      journalCase: 'title',
      volumeStyle: 'italic',
      yearInParentheses: true
    }
  },
  MLA: {
    name: 'MLA 9th',
    description: '现代语言协会格式',
    template: '{authors}. "{title}." {journal}, vol. {volume}, no. {issue}, {year}, pp. {pages}.',
    rules: {
      authorFormat: 'lastName, First Middle',
      authorSeparator: ', ',
      lastAuthorSeparator: ', and ',
      titleCase: 'title',
      journalCase: 'italic',
      volumeStyle: 'normal',
      yearInParentheses: false
    }
  },
  Chicago: {
    name: 'Chicago 17th',
    description: '芝加哥格式',
    template: '{authors}. "{title}." {journal} {volume}, no. {issue} ({year}): {pages}.',
    rules: {
      authorFormat: 'firstName lastName',
      authorSeparator: ', ',
      lastAuthorSeparator: ', and ',
      titleCase: 'title',
      journalCase: 'italic',
      volumeStyle: 'normal',
      yearInParentheses: true
    }
  },
  'GB/T7714': {
    name: 'GB/T 7714-2015',
    description: '中国国家标准格式',
    template: '{authors}. {title}[J]. {journal}, {year}, {volume}({issue}): {pages}.',
    rules: {
      authorFormat: 'lastName firstName',
      authorSeparator: ', ',
      lastAuthorSeparator: ', ',
      titleCase: 'original',
      journalCase: 'original',
      volumeStyle: 'normal',
      yearInParentheses: false
    }
  },
  IEEE: {
    name: 'IEEE',
    description: '电气电子工程师学会格式',
    template: '[{index}] {authors}, "{title}," {journal}, vol. {volume}, no. {issue}, pp. {pages}, {year}.',
    rules: {
      authorFormat: 'F. M. LastName',
      authorSeparator: ', ',
      lastAuthorSeparator: ', and ',
      titleCase: 'sentence',
      journalCase: 'title',
      volumeStyle: 'normal',
      yearInParentheses: false
    }
  }
};

class FormatRenderer {
  constructor() {
    this.rules = FORMAT_RULES;
  }

  getSupportedFormats() {
    return Object.entries(this.rules).map(([key, value]) => ({
      id: key,
      name: value.name,
      description: value.description
    }));
  }

  getFormatRules(formatId) {
    return this.rules[formatId] || null;
  }

  render(literature, formatId, options = {}) {
    const format = this.rules[formatId];
    if (!format) {
      throw new Error(`不支持的格式: ${formatId}`);
    }

    const context = this.prepareContext(literature, options);
    return this.applyTemplate(format.template, context, format.rules);
  }

  renderBatch(literatures, formatId, options = {}) {
    return literatures.map((lit, index) => 
      this.render(lit, formatId, { ...options, index: index + 1 })
    );
  }

  prepareContext(literature, options) {
    return {
      index: options.index || 1,
      authors: this.formatAuthors(literature.authors, options.format),
      title: literature.title || '',
      journal: literature.journal || literature.publisher || '',
      year: literature.year || new Date().getFullYear(),
      volume: literature.volume || '',
      issue: literature.issue || '',
      pages: literature.pages || '',
      doi: literature.doi || '',
      url: literature.url || ''
    };
  }

  formatAuthors(authors, formatStyle) {
    if (!authors || authors.length === 0) return '';

    const format = this.rules[formatStyle];
    if (!format) return authors.map(a => a.fullName).join(', ');

    const formattedAuthors = authors.map(author => {
      const pattern = format.rules.authorFormat;
      return pattern
        .replace('lastName', author.lastName || '')
        .replace('firstName', author.firstName || '')
        .replace('F.', author.firstName ? author.firstName[0].toUpperCase() + '.' : '')
        .replace('M.', author.middleName ? author.middleName[0].toUpperCase() + '.' : '')
        .replace('FirstName', author.firstName || '')
        .replace('LastName', author.lastName || '')
        .trim();
    });

    if (formattedAuthors.length === 1) {
      return formattedAuthors[0];
    }

    const lastAuthor = formattedAuthors.pop();
    return formattedAuthors.join(format.rules.authorSeparator) + 
           format.rules.lastAuthorSeparator + 
           lastAuthor;
  }

  applyTemplate(template, context, rules) {
    let result = template;

    Object.entries(context).forEach(([key, value]) => {
      let formattedValue = value;
      
      if (key === 'title' && rules.titleCase === 'sentence') {
        formattedValue = this.toSentenceCase(value);
      } else if (key === 'title' && rules.titleCase === 'title') {
        formattedValue = this.toTitleCase(value);
      }
      
      if (key === 'journal' && rules.journalCase === 'italic') {
        formattedValue = `<i>${formattedValue}</i>`;
      } else if (key === 'journal' && rules.journalCase === 'title') {
        formattedValue = this.toTitleCase(value);
      }
      
      result = result.replace(new RegExp(`\\{${key}\\}`, 'g'), formattedValue || '');
    });

    result = result
      .replace(/\(\)/g, '')
      .replace(/,\s*,/g, ',')
      .replace(/\s+\./g, '.')
      .replace(/\s+/g, ' ')
      .trim();

    return result;
  }

  toSentenceCase(str) {
    if (!str) return '';
    return str.charAt(0).toUpperCase() + str.slice(1).toLowerCase();
  }

  toTitleCase(str) {
    if (!str) return '';
    const smallWords = ['a', 'an', 'the', 'and', 'but', 'or', 'for', 'nor', 'on', 'at', 'to', 'by', 'of', 'in'];
    return str
      .toLowerCase()
      .split(/\s+/)
      .map((word, index, array) => {
        if (index === 0 || index === array.length - 1 || !smallWords.includes(word)) {
          return word.charAt(0).toUpperCase() + word.slice(1);
        }
        return word;
      })
      .join(' ');
  }

  exportToBibTeX(literature) {
    const authors = (literature.authors || [])
      .map(a => `${a.lastName}, ${a.firstName}`)
      .join(' and ');

    return `@article{${literature.id || 'entry'},\n` +
           `  author = {${authors}},\n` +
           `  title = {${literature.title || ''}},\n` +
           `  journal = {${literature.journal || ''}},\n` +
           `  year = {${literature.year || ''}},\n` +
           `  volume = {${literature.volume || ''}},\n` +
           `  number = {${literature.issue || ''}},\n` +
           `  pages = {${literature.pages || ''}},\n` +
           `  doi = {${literature.doi || ''}}\n` +
           `}`;
  }

  exportToRIS(literature) {
    const authors = literature.authors || [];
    let ris = 'TY  - JOUR\n';
    
    authors.forEach(a => {
      ris += `AU  - ${a.lastName}, ${a.firstName}\n`;
    });
    
    ris += `TI  - ${literature.title || ''}\n`;
    ris += `JO  - ${literature.journal || ''}\n`;
    ris += `PY  - ${literature.year || ''}\n`;
    ris += `VL  - ${literature.volume || ''}\n`;
    ris += `IS  - ${literature.issue || ''}\n`;
    ris += `SP  - ${literature.pages ? literature.pages.split('-')[0] : ''}\n`;
    ris += `EP  - ${literature.pages ? literature.pages.split('-')[1] || '' : ''}\n`;
    ris += `DO  - ${literature.doi || ''}\n`;
    ris += 'ER  - \n';
    
    return ris;
  }
}

module.exports = new FormatRenderer();
