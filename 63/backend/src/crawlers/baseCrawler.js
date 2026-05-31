const axios = require('axios');
const { CRAWLER_TIMEOUT } = require('../config');

const USER_AGENTS = [
  'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
  'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/119.0.0.0 Safari/537.36',
  'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
  'Mozilla/5.0 (X11; Linux x86_64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36'
];

const ACCEPT_LANGUAGES = [
  'zh-CN,zh;q=0.9,en;q=0.8,en-US;q=0.7',
  'zh,en-US;q=0.9,en;q=0.8',
  'en-US,en;q=0.9,zh;q=0.8'
];

class BaseCrawler {
  constructor(name) {
    this.name = name;
    this.baseURL = '';
    this.timeout = CRAWLER_TIMEOUT;
    this.maxRetries = 3;
    this.retryDelay = 2000;
  }

  getRandomHeaders() {
    const userAgent = USER_AGENTS[Math.floor(Math.random() * USER_AGENTS.length)];
    const acceptLanguage = ACCEPT_LANGUAGES[Math.floor(Math.random() * ACCEPT_LANGUAGES.length)];
    
    return {
      'User-Agent': userAgent,
      'Accept': 'text/html,application/xhtml+xml,application/xml;q=0.9,image/avif,image/webp,image/apng,*/*;q=0.8',
      'Accept-Language': acceptLanguage,
      'Accept-Encoding': 'gzip, deflate, br',
      'Cache-Control': 'max-age=0',
      'Connection': 'keep-alive',
      'Upgrade-Insecure-Requests': '1',
      'Sec-Fetch-Dest': 'document',
      'Sec-Fetch-Mode': 'navigate',
      'Sec-Fetch-Site': 'none',
      'Sec-Fetch-User': '?1',
      'sec-ch-ua': '"Not_A Brand";v="8", "Chromium";v="120", "Google Chrome";v="120"',
      'sec-ch-ua-mobile': '?0',
      'sec-ch-ua-platform': '"Windows"'
    };
  }

  async request(url, options = {}) {
    let lastError = null;
    
    for (let attempt = 1; attempt <= this.maxRetries; attempt++) {
      try {
        const headers = {
          ...this.getRandomHeaders(),
          ...options.headers
        };
        
        if (options.referer) {
          headers['Referer'] = options.referer;
        }

        const response = await axios({
          url,
          method: options.method || 'GET',
          headers,
          params: options.params,
          data: options.data,
          timeout: this.timeout,
          responseType: options.responseType || 'text',
          withCredentials: options.withCredentials || false,
          maxRedirects: options.maxRedirects || 5
        });

        if (response.status === 200) {
          return response.data;
        }
        
        throw new Error(`HTTP ${response.status}`);
      } catch (error) {
        lastError = error;
        
        if (error.response?.status === 403) {
          console.warn(`[${this.name}] 403 Forbidden, 重试 ${attempt}/${this.maxRetries}: ${url}`);
        } else if (error.response?.status === 429) {
          console.warn(`[${this.name}] 请求过于频繁，重试 ${attempt}/${this.maxRetries}: ${url}`);
          await this.delay(this.retryDelay * attempt);
          continue;
        }
        
        if (attempt < this.maxRetries) {
          await this.delay(this.retryDelay * attempt);
        }
      }
    }

    console.error(`[${this.name}] 请求失败 (已重试${this.maxRetries}次):`, url, lastError?.message);
    throw new Error(`爬取失败: ${lastError?.message || '未知错误'}`);
  }

  async search(query, options = {}) {
    throw new Error('search method must be implemented by subclass');
  }

  async getDetail(id, options = {}) {
    throw new Error('getDetail method must be implemented by subclass');
  }

  parseSearchResults(html) {
    throw new Error('parseSearchResults method must be implemented by subclass');
  }

  parseDetail(html) {
    throw new Error('parseDetail method must be implemented by subclass');
  }

  delay(ms) {
    return new Promise(resolve => setTimeout(resolve, ms));
  }

  sanitizeText(text) {
    if (!text) return '';
    return text
      .replace(/\s+/g, ' ')
      .replace(/[\u200b-\u200f\u202a-\u202e]/g, '')
      .trim();
  }
}

module.exports = BaseCrawler;
