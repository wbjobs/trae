const { CITATION_PATTERNS, FIELD_PATTERNS } = require('./patterns');
const authorParser = require('./authorParser');

class FormatParsers {
  constructor() {
    this.patterns = CITATION_PATTERNS;
  }

  parseAPA(citation, base) {
    const match = citation.match(this.patterns.apa.regex);
    if (match) {
      base.authors = authorParser.parse(match[1]);
      base.year = parseInt(match[2]);
      base.title = this.cleanText(match[3]);
      base.journal = this.cleanText(match[4]);
      base.volume = match[5] ? parseInt(match[5]) : null;
      base.issue = match[6] ? parseInt(match[6]) : null;
      base.pages = match[7] ? this.cleanText(match[7]) : '';
    }
    return base;
  }

  parseGB7714(citation, base) {
    const match = citation.match(this.patterns.gb7714.regex);
    if (match) {
      base.citationNumber = parseInt(match[1]);
      base.authors = authorParser.parse(match[2]);
      base.title = this.cleanText(match[3]);
      base.journal = this.cleanText(match[4]);
      base.year = parseInt(match[5]);
      base.volume = parseInt(match[6]);
      base.issue = match[7] ? parseInt(match[7]) : null;
      base.pages = match[8];
    }
    return base;
  }

  parseIEEE(citation, base) {
    const match = citation.match(this.patterns.ieee.regex);
    if (match) {
      base.citationNumber = parseInt(match[1]);
      base.authors = authorParser.parse(match[2]);
      base.title = this.cleanText(match[3]);
      base.journal = this.cleanText(match[4]);
      base.volume = match[5] ? parseInt(match[5]) : null;
      base.issue = match[6] ? parseInt(match[6]) : null;
      base.pages = match[7] || '';
      base.year = parseInt(match[8]);
    }
    return base;
  }

  parseMLA(citation, base) {
    const match = citation.match(this.patterns.mla.regex);
    if (match) {
      base.authors = authorParser.parse(match[1]);
      base.title = this.cleanText(match[2]);
      base.journal = this.cleanText(match[3]);
      base.volume = parseInt(match[4]);
      base.issue = match[5] ? parseInt(match[5]) : null;
      base.year = parseInt(match[6]);
      base.pages = match[7];
    }
    return base;
  }

  parseChicago(citation, base) {
    const match = citation.match(this.patterns.chicago.regex);
    if (match) {
      base.authors = authorParser.parse(match[1]);
      base.title = this.cleanText(match[2]);
      base.journal = this.cleanText(match[3]);
      base.volume = parseInt(match[4]);
      base.issue = parseInt(match[5]);
      base.year = parseInt(match[6]);
      base.pages = match[7];
    }
    return base;
  }

  parseGeneric(citation, base) {
    const yearMatch = citation.match(FIELD_PATTERNS.year);
    if (yearMatch) base.year = parseInt(yearMatch[0]);

    const urlMatches = citation.match(FIELD_PATTERNS.url);
    if (urlMatches) base.url = urlMatches[0];

    const doiMatch = citation.match(FIELD_PATTERNS.doi);
    if (doiMatch) base.doi = doiMatch[0];

    const pagesMatch = citation.match(FIELD_PATTERNS.pages);
    if (pagesMatch) base.pages = pagesMatch[1];

    const volumeMatch = citation.match(FIELD_PATTERNS.volume);
    if (volumeMatch) base.volume = parseInt(volumeMatch[1]);

    const issueMatch = citation.match(FIELD_PATTERNS.issue);
    if (issueMatch) base.issue = parseInt(issueMatch[1]);

    const citationNumMatch = citation.match(FIELD_PATTERNS.citationNumber);
    if (citationNumMatch) base.citationNumber = parseInt(citationNumMatch[1]);

    const isbnMatch = citation.match(FIELD_PATTERNS.isbn);
    if (isbnMatch) base.isbn = isbnMatch[0];

    const parts = citation.split(/[.,;]/).map(p => p.trim()).filter(p => p);
    if (parts.length > 0) {
      const potentialTitles = parts.filter(p => p.length > 10 && p.length < 200);
      if (potentialTitles.length > 0) {
        base.title = potentialTitles
          .sort((a, b) => b.length - a.length)[0]
          .replace(/^["'""'"]|["'""'"]$/g, '');
      }
    }

    const authorPart = parts.find(p => 
      p.length > 5 && 
      !p.includes('http') && 
      !p.match(/\d{4}/) &&
      !p.includes('vol') &&
      !p.includes('pp')
    );
    if (authorPart) {
      base.authors = authorParser.parse(authorPart);
    }

    return base;
  }

  cleanText(text) {
    if (!text) return '';
    return text
      .replace(/^["'""'"]|["'""'"]$/g, '')
      .replace(/\s+/g, ' ')
      .trim();
  }
}

module.exports = new FormatParsers();
