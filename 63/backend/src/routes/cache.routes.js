const express = require('express');
const router = express.Router();
const { literatureCache, searchCache } = require('../utils/cacheManager');

router.get('/stats', async (req, res) => {
  const literatureStats = literatureCache.getStats();
  const searchStats = searchCache.getStats();

  res.json({
    success: true,
    data: {
      literature: literatureStats,
      search: searchStats,
      combined: {
        totalEntries: literatureStats.totalEntries + searchStats.totalEntries,
        totalSize: literatureStats.totalSize + searchStats.totalSize
      }
    }
  });
});

router.delete('/clear', async (req, res) => {
  const { type } = req.body;
  
  let cleared = 0;
  
  if (type === 'literature' || !type) {
    cleared += literatureCache.clearAll();
  }
  
  if (type === 'search' || !type) {
    cleared += searchCache.clearAll();
  }

  res.json({
    success: true,
    data: { cleared, type: type || 'all' },
    message: `已清除 ${cleared} 条缓存记录`
  });
});

router.post('/clean-expired', async (req, res) => {
  const { type } = req.body;
  
  let cleaned = 0;
  
  if (type === 'literature' || !type) {
    cleaned += literatureCache.cleanExpired();
  }
  
  if (type === 'search' || !type) {
    cleaned += searchCache.cleanExpired();
  }

  res.json({
    success: true,
    data: { cleaned, type: type || 'all' },
    message: `已清理 ${cleaned} 条过期缓存`
  });
});

router.post('/invalidate-tag', async (req, res) => {
  const { tag, type } = req.body;
  
  if (!tag) {
    return res.status(400).json({
      success: false,
      message: '请提供标签名'
    });
  }

  let invalidated = 0;
  
  if (type === 'literature' || !type) {
    invalidated += literatureCache.invalidateByTag(tag);
  }
  
  if (type === 'search' || !type) {
    invalidated += searchCache.invalidateByTag(tag);
  }

  res.json({
    success: true,
    data: { invalidated, tag },
    message: `已失效 ${invalidated} 条缓存记录`
  });
});

module.exports = router;
