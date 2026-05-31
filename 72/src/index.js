const express = require('express');
const { ApolloServer } = require('apollo-server-express');
const crypto = require('crypto');
const typeDefs = require('./schema');
const resolvers = require('./resolvers');
const config = require('./config');

const MySQLDataSource = require('./datasources/mysql');
const RedisDataSource = require('./datasources/redis');
const WeatherDataSource = require('./datasources/weather');
const QueryCache = require('./cache');
const QueryAnalyzer = require('./analyzer');

const mysql = new MySQLDataSource();
const redis = new RedisDataSource();
const weather = new WeatherDataSource();
const cache = new QueryCache();
const analyzer = new QueryAnalyzer();

const app = express();
app.use(express.json());

app.get('/api/analysis', (req, res) => {
  try {
    const report = analyzer.getAnalysisReport();
    res.json({
      success: true,
      data: report
    });
  } catch (error) {
    res.status(500).json({
      success: false,
      error: error.message
    });
  }
});

app.get('/api/analysis/recent', (req, res) => {
  try {
    const limit = parseInt(req.query.limit) || 20;
    const queries = analyzer.getRecentQueries(limit);
    res.json({
      success: true,
      data: queries
    });
  } catch (error) {
    res.status(500).json({
      success: false,
      error: error.message
    });
  }
});

app.get('/api/analysis/fields', (req, res) => {
  try {
    const fieldStats = analyzer.getFieldStats();
    res.json({
      success: true,
      data: fieldStats
    });
  } catch (error) {
    res.status(500).json({
      success: false,
      error: error.message
    });
  }
});

app.get('/api/analysis/recommendations', (req, res) => {
  try {
    const recommendations = analyzer.getRecommendations();
    res.json({
      success: true,
      data: recommendations
    });
  } catch (error) {
    res.status(500).json({
      success: false,
      error: error.message
    });
  }
});

app.post('/api/analysis/clear', (req, res) => {
  try {
    analyzer.clear();
    res.json({
      success: true,
      message: 'Analysis data cleared'
    });
  } catch (error) {
    res.status(500).json({
      success: false,
      error: error.message
    });
  }
});

const analyzerPlugin = {
  requestDidStart(requestContext) {
    const queryHash = crypto
      .createHash('md5')
      .update(requestContext.request.query || '')
      .digest('hex');
    
    const operationName = requestContext.request.operationName;
    const queryLogId = analyzer.recordQuery(queryHash, operationName);

    return {
      didResolveOperation(context) {
        context.context.queryLogId = queryLogId;
      },
      willSendResponse(context) {
        const log = analyzer.queryLogs.find(l => l.id === queryLogId);
        if (log) {
          log.completed = true;
        }
      },
      executionDidStart() {
        return {
          willResolveField({ info, context }) {
            const start = process.hrtime.bigint();
            return (error, result) => {
              const end = process.hrtime.bigint();
              const durationMs = Number(end - start) / 1000000;
              
              const parentType = info.parentType.name;
              const fieldName = info.fieldName;
              const path = info.path && info.path.key !== undefined 
                ? (() => {
                    const pathArr = [];
                    let p = info.path;
                    while (p) {
                      pathArr.unshift(String(p.key));
                      p = p.prev;
                    }
                    return pathArr;
                  })()
                : [fieldName];

              let dataSource = null;
              let isCached = false;

              if (parentType === 'Query' && (fieldName === 'user' || fieldName === 'users')) {
                dataSource = 'mysql';
              } else if (parentType === 'Query' && fieldName === 'weather') {
                dataSource = 'weather';
              } else if (parentType === 'Query' && (fieldName === 'onlineStatus' || fieldName === 'onlineUsersCount')) {
                dataSource = 'redis';
              } else if (parentType === 'User' && fieldName === 'weather') {
                dataSource = 'weather';
                if (result === null) {
                  dataSource = 'weather (timed out)';
                }
              } else if (parentType === 'User' && fieldName === 'onlineStatus') {
                dataSource = 'redis';
              }

              if (dataSource && context.cache) {
                const cacheKey = context.cache.generateKey(fieldName, path[0] || '');
                if (context.cache.has(cacheKey)) {
                  isCached = true;
                  dataSource += ' (cache)';
                }
              }

              analyzer.recordField(
                queryLogId,
                parentType,
                fieldName,
                path,
                durationMs,
                dataSource,
                isCached
              );
            };
          }
        };
      }
    };
  }
};

const server = new ApolloServer({
  typeDefs,
  resolvers,
  context: () => ({
    dataSources: {
      mysql,
      redis,
      weather
    },
    cache,
    analyzer
  }),
  plugins: [analyzerPlugin],
  introspection: true,
  playground: true,
  formatError: (error) => {
    console.error('[GraphQL Error]', error.message);
    return new Error(error.message || 'Internal server error');
  }
});

const startServer = async () => {
  await server.start();
  server.applyMiddleware({ app, path: '/graphql' });

  const gracefulShutdown = async () => {
    console.log('\n[Server] Shutting down gracefully...');
    try {
      await server.stop();
      await mysql.close();
      await redis.close();
    } catch (error) {
      console.error('[Server] Error during shutdown:', error.message);
    }
    process.exit(0);
  };

  process.on('SIGTERM', gracefulShutdown);
  process.on('SIGINT', gracefulShutdown);

  app.listen({ port: config.port }, () => {
    console.log(`
╔══════════════════════════════════════════════════════════════╗
║                                                              ║
║   GraphQL Gateway Server is running!                         ║
║                                                              ║
║   🚀 GraphQL endpoint: http://localhost:${config.port}/graphql      ║
║                                                              ║
║   📊 Analysis API endpoints:                                 ║
║      GET /api/analysis              - Full analysis report   ║
║      GET /api/analysis/recent       - Recent queries         ║
║      GET /api/analysis/fields       - Field performance      ║
║      GET /api/analysis/recommendations - Optimization tips  ║
║      POST /api/analysis/clear       - Clear analysis data    ║
║                                                              ║
║   Data Sources:                                              ║
║   • MySQL    - User information (with connection pool)       ║
║   • Redis    - Real-time online status                       ║
║   • REST API - Weather data                                  ║
║                                                              ║
║   Features:                                                  ║
║   • Query caching (5 minutes TTL)                            ║
║   • Error degradation (partial data on failure)              ║
║   • Query analyzer with performance tracking                 ║
║   • Dataloader batching                                      ║
║                                                              ║
╚══════════════════════════════════════════════════════════════╝
    `);
  });
};

startServer().catch((error) => {
  console.error('[Server] Failed to start:', error.message);
  process.exit(1);
});
