module.exports = {
  PORT: process.env.PORT || 3000,
  CORS_ORIGIN: process.env.CORS_ORIGIN || '*',
  CRAWLER_TIMEOUT: 10000,
  CRAWLER_DELAY: 1000,
  DATA_STORAGE_PATH: './data',
  CITATION_FORMATS: ['APA', 'MLA', 'Chicago', 'GB/T7714', 'IEEE'],
  SUPPORTED_LIBRARIES: ['CNKI', 'WanFang', 'PubMed', 'GoogleScholar', 'IEEE']
};
