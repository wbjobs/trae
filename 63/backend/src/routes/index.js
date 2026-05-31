const express = require('express');
const router = express.Router();

const citationRoutes = require('./citation.routes');
const crawlerRoutes = require('./crawler.routes');
const literatureRoutes = require('./literature.routes');
const userRoutes = require('./user.routes');
const cacheRoutes = require('./cache.routes');

router.get('/', (req, res) => {
  res.json({
    success: true,
    message: '学术文献引文系统API',
    version: '2.0.0',
    endpoints: {
      citation: '/api/citation',
      crawler: '/api/crawler',
      literature: '/api/literature',
      user: '/api/user',
      cache: '/api/cache'
    }
  });
});

router.use('/citation', citationRoutes);
router.use('/crawler', crawlerRoutes);
router.use('/literature', literatureRoutes);
router.use('/user', userRoutes);
router.use('/cache', cacheRoutes);

module.exports = router;
