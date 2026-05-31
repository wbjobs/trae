exports.CITATION_PATTERNS = {
  apa: {
    name: 'APA',
    regex: /^(.+?)\.\s*\((\d{4})\)\.\s*(.+?)\.\s*(.+?)(?:,\s*(\d+)(?:\((\d+)\))?)?[.,]?\s*(.+)?$/i,
    detect: (text) => /\(\d{4}\)/.test(text),
    weight: 1
  },
  gb7714: {
    name: 'GB/T 7714',
    regex: /^\[(\d+)\]\s*(.+?)\.\s*(.+?)\[J\]\.\s*(.+?),\s*(\d{4}),\s*(\d+)(?:\((\d+)\))?:\s*(\d+-\d+)\.$/,
    detect: (text) => /^\[\d+\]/.test(text) && /\[J\]/.test(text),
    weight: 2
  },
  ieee: {
    name: 'IEEE',
    regex: /^\[(\d+)\]\s*(.+?),\s*"(.+?),"\s+in\s+(.+?),\s+(?:vol\.\s+)?(\d+)(?:,\s+no\.\s+(\d+))?(?:,\s+pp\.\s+(\d+-\d+))?,\s+(\d{4})[.,]?$/i,
    detect: (text) => /^\[\d+\]/.test(text) && /vol\.|no\.|pp\./i.test(text),
    weight: 2
  },
  mla: {
    name: 'MLA',
    regex: /^(.+?)\.\s*"(.+?)\."\s*(.+?)\s+(\d+)(?:,\s+no\.\s*(\d+))?\s*\((\d{4})\)\s*:\s*(\d+-\d+)\.$/,
    detect: (text) => /"\s*[^"]+?\."/.test(text),
    weight: 1
  },
  chicago: {
    name: 'Chicago',
    regex: /^(.+?)\.\s*"(.+?)\."\s*(.+?)\s+(\d+),\s+no\.\s*(\d+)\s*\((\d{4})\)\s*:\s*(\d+-\d+)\.$/,
    detect: (text) => /no\.\s*\d+\s*\(\d{4}\)/.test(text),
    weight: 1
  },
  web: {
    name: 'Web Page',
    detect: (text) => /https?:\/\//.test(text),
    weight: 1
  }
};

exports.FIELD_PATTERNS = {
  year: /\b(19|20)\d{2}\b/,
  doi: /10\.\d{4,9}\/[-._;()/:A-Z0-9]+/i,
  url: /https?:\/\/[^\s]+/g,
  pages: /\b(\d+-\d+)\b/,
  volume: /\bvol\.?\s*(\d+)/i,
  issue: /\bno\.?\s*(\d+)/i,
  citationNumber: /^\[(\d+)\]/,
  isbn: /\b\d{3}-?\d{1,5}-?\d{1,7}-?\d{1,7}-?[\dX]\b/i,
  issn: /\b\d{4}-?\d{3,4}[\dX]\b/i
};
