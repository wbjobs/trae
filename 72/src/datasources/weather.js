const axios = require('axios');
const DataLoader = require('dataloader');
const config = require('../config');

const withTimeout = (promise, timeoutMs, city) => {
  return new Promise((resolve) => {
    const timeoutId = setTimeout(() => {
      console.warn(`[Weather] Request timed out for city: ${city} after ${timeoutMs}ms`);
      resolve(null);
    }, timeoutMs);

    promise.then((result) => {
      clearTimeout(timeoutId);
      resolve(result);
    }).catch((error) => {
      clearTimeout(timeoutId);
      console.error(`[Weather] Request failed for city: ${city}:`, error.message);
      resolve(null);
    });
  });
};

class WeatherDataSource {
  constructor() {
    this.client = axios.create({
      baseURL: config.weatherApi.baseUrl,
      timeout: config.weatherApi.timeout
    });
    this.weatherLoader = new DataLoader(this.batchGetWeather.bind(this), {
      maxBatchSize: 10
    });
    this.apiKey = config.weatherApi.apiKey;
    this.requestTimeout = config.weatherApi.timeout;
  }

  async batchGetWeather(cities) {
    try {
      if (!this.apiKey || this.apiKey === 'your_api_key_here') {
        console.warn('[Weather] API key not configured, using mock data');
        return cities.map(city => this.getMockWeather(city));
      }

      const promises = cities.map(city => 
        withTimeout(
          this.fetchWeatherFromAPI(city),
          this.requestTimeout,
          city
        )
      );

      const results = await Promise.all(promises);
      return results;
    } catch (error) {
      console.error('[Weather] batchGetWeather error:', error.message);
      return cities.map(() => null);
    }
  }

  async fetchWeatherFromAPI(city) {
    try {
      const response = await this.client.get('/weather', {
        params: {
          q: city,
          appid: this.apiKey,
          units: 'metric',
          lang: 'zh_cn'
        }
      });

      return this.transformWeatherData(city, response.data);
    } catch (error) {
      if (error.code === 'ECONNABORTED') {
        console.warn(`[Weather] Axios timeout for city: ${city}`);
      } else {
        console.error(`[Weather] Failed to fetch weather for ${city}:`, error.message);
      }
      return null;
    }
  }

  transformWeatherData(city, data) {
    return {
      city,
      temperature: Math.round(data.main.temp),
      feelsLike: Math.round(data.main.feels_like),
      humidity: data.main.humidity,
      pressure: data.main.pressure,
      windSpeed: data.wind.speed,
      windDirection: data.wind.deg,
      condition: data.weather[0].main,
      description: data.weather[0].description,
      icon: data.weather[0].icon,
      visibility: data.visibility,
      cloudCoverage: data.clouds.all,
      sunrise: new Date(data.sys.sunrise * 1000).toISOString(),
      sunset: new Date(data.sys.sunset * 1000).toISOString(),
      timestamp: new Date().toISOString()
    };
  }

  async getWeatherByCity(city) {
    try {
      if (!this.apiKey || this.apiKey === 'your_api_key_here') {
        console.warn('[Weather] API key not configured, using mock data');
        return this.getMockWeather(city);
      }
      return this.weatherLoader.load(city);
    } catch (error) {
      console.error('[Weather] getWeatherByCity error:', error.message);
      return this.getMockWeather(city);
    }
  }

  async getWeatherByCities(cities) {
    try {
      if (!this.apiKey || this.apiKey === 'your_api_key_here') {
        console.warn('[Weather] API key not configured, using mock data');
        return cities.map(city => this.getMockWeather(city));
      }
      return this.weatherLoader.loadMany(cities);
    } catch (error) {
      console.error('[Weather] getWeatherByCities error:', error.message);
      return cities.map(city => this.getMockWeather(city));
    }
  }

  getMockWeather(city) {
    const conditions = ['Clear', 'Clouds', 'Rain', 'Snow', 'Thunderstorm', 'Drizzle'];
    const descriptions = {
      'Clear': '晴朗',
      'Clouds': '多云',
      'Rain': '下雨',
      'Snow': '下雪',
      'Thunderstorm': '雷暴',
      'Drizzle': '小雨'
    };
    const icons = ['01d', '02d', '03d', '04d', '09d', '10d', '11d', '13d'];

    const condition = conditions[Math.floor(Math.random() * conditions.length)];
    const temp = Math.round(10 + Math.random() * 25);

    return {
      city,
      temperature: temp,
      feelsLike: temp + Math.round(Math.random() * 4 - 2),
      humidity: Math.round(40 + Math.random() * 40),
      pressure: Math.round(1000 + Math.random() * 30),
      windSpeed: Math.round(Math.random() * 15 * 10) / 10,
      windDirection: Math.round(Math.random() * 360),
      condition,
      description: descriptions[condition],
      icon: icons[Math.floor(Math.random() * icons.length)],
      visibility: Math.round(5000 + Math.random() * 10000),
      cloudCoverage: Math.round(Math.random() * 100),
      sunrise: new Date(Date.now() - 3600000 * 2).toISOString(),
      sunset: new Date(Date.now() + 3600000 * 6).toISOString(),
      timestamp: new Date().toISOString()
    };
  }
}

module.exports = WeatherDataSource;
