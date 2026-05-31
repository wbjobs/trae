const resolvers = {
  User: {
    onlineStatus: async (parent, _, { dataSources, cache }) => {
      try {
        return cache.withCache(
          'onlineStatus',
          () => dataSources.redis.getOnlineStatus(parent.id),
          parent.id
        );
      } catch (error) {
        console.error('[Resolver] onlineStatus error:', error.message);
        return dataSources.redis.getMockOnlineStatus(parent.id);
      }
    },
    weather: async (parent, _, { dataSources, cache }) => {
      try {
        const key = cache.generateKey('weather', parent.city);
        const cached = cache.get(key);
        if (cached !== null) {
          return cached;
        }
        const result = await dataSources.weather.getWeatherByCity(parent.city);
        if (result !== null) {
          cache.set(key, result);
        }
        return result;
      } catch (error) {
        console.error('[Resolver] weather error:', error.message);
        return null;
      }
    }
  },

  Query: {
    user: async (_, { id }, { dataSources, cache }) => {
      try {
        return cache.withCache(
          'user',
          () => dataSources.mysql.getUserById(id),
          id
        );
      } catch (error) {
        console.error('[Resolver] user error:', error.message);
        return dataSources.mysql.getMockUser(id);
      }
    },

    users: async (_, { limit = 10, offset = 0 }, { dataSources, cache }) => {
      try {
        return cache.withCache(
          'users',
          () => dataSources.mysql.getUsers({ limit, offset }),
          limit, offset
        );
      } catch (error) {
        console.error('[Resolver] users error:', error.message);
        return dataSources.mysql.getMockUsers(limit);
      }
    },

    weather: async (_, { city }, { dataSources, cache }) => {
      try {
        const key = cache.generateKey('weather', city);
        const cached = cache.get(key);
        if (cached !== null) {
          return cached;
        }
        const result = await dataSources.weather.getWeatherByCity(city);
        if (result !== null) {
          cache.set(key, result);
        }
        return result;
      } catch (error) {
        console.error('[Resolver] weather error:', error.message);
        return null;
      }
    },

    onlineStatus: async (_, { userId }, { dataSources, cache }) => {
      try {
        return cache.withCache(
          'onlineStatus',
          () => dataSources.redis.getOnlineStatus(userId),
          userId
        );
      } catch (error) {
        console.error('[Resolver] onlineStatus error:', error.message);
        return dataSources.redis.getMockOnlineStatus(userId);
      }
    },

    onlineUsersCount: async (_, __, { dataSources }) => {
      try {
        return dataSources.redis.getOnlineUsersCount();
      } catch (error) {
        console.error('[Resolver] onlineUsersCount error:', error.message);
        return 0;
      }
    },

    cacheStats: async (_, __, { cache }) => {
      return cache.getStats();
    },

    sourceStatus: async (_, __, { dataSources }) => {
      return {
        mysql: dataSources.mysql.isConnected ? 'connected' : 'disconnected',
        redis: dataSources.redis.isConnected ? 'connected' : 'disconnected',
        weather: dataSources.weather.apiKey && dataSources.weather.apiKey !== 'your_api_key_here' ? 'configured' : 'mock'
      };
    }
  },

  Mutation: {
    setOnlineStatus: async (_, { userId, isOnline }, { dataSources, cache }) => {
      try {
        const success = await dataSources.redis.setOnlineStatus(userId, isOnline);
        if (success) {
          const key = cache.generateKey('onlineStatus', userId);
          cache.delete(key);
        }
        return {
          userId,
          isOnline,
          lastSeen: new Date().toISOString()
        };
      } catch (error) {
        console.error('[Resolver] setOnlineStatus error:', error.message);
        return {
          userId,
          isOnline: false,
          lastSeen: null
        };
      }
    },

    clearCache: async (_, __, { cache }) => {
      try {
        cache.clear();
        cache.resetStats();
        return true;
      } catch (error) {
        console.error('[Resolver] clearCache error:', error.message);
        return false;
      }
    }
  }
};

module.exports = resolvers;
