const crawlerScheduler = require('../crawlers/crawlerScheduler');
const validator = require('../utils/validator');

class CrawlerController {
  async searchLiterature(req, res, next) {
    try {
      const { query, libraries, sortBy, limit, deduplicate } = req.body;
      
      if (!query || query.trim().length === 0) {
        return res.status(400).json({
          success: false,
          message: '请提供搜索关键词'
        });
      }

      const results = await crawlerScheduler.search(query.trim(), {
        libraries,
        sortBy,
        limit,
        deduplicate
      });

      res.json(results);
    } catch (error) {
      next(error);
    }
  }

  async getLiteratureDetail(req, res, next) {
    try {
      const { library, id } = req.body;
      
      if (!library || !id) {
        return res.status(400).json({
          success: false,
          message: '请提供文库和文献ID'
        });
      }

      const detail = await crawlerScheduler.getDetail(library, id);

      res.json({
        success: true,
        data: detail,
        message: '获取文献详情成功'
      });
    } catch (error) {
      next(error);
    }
  }

  async batchCrawl(req, res, next) {
    try {
      const { literatureIds } = req.body;
      
      if (!literatureIds || !Array.isArray(literatureIds) || literatureIds.length === 0) {
        return res.status(400).json({
          success: false,
          message: '请提供文献ID数组'
        });
      }

      const task = await crawlerScheduler.batchCrawl(literatureIds);

      res.json({
        success: true,
        data: task,
        message: '批量爬取任务已启动'
      });
    } catch (error) {
      next(error);
    }
  }

  async crossLibraryMatch(req, res, next) {
    try {
      const { literature } = req.body;
      
      if (!literature) {
        return res.status(400).json({
          success: false,
          message: '请提供文献数据'
        });
      }

      const results = await crawlerScheduler.crossLibraryMatch(literature);

      res.json(results);
    } catch (error) {
      next(error);
    }
  }

  getSupportedLibraries(req, res, next) {
    try {
      const libraries = crawlerScheduler.getSupportedLibraries();

      res.json({
        success: true,
        data: libraries,
        message: '获取支持的文库列表成功'
      });
    } catch (error) {
      next(error);
    }
  }

  getCrawlStatus(req, res, next) {
    try {
      const { taskId } = req.params;
      
      if (!taskId) {
        return res.status(400).json({
          success: false,
          message: '请提供任务ID'
        });
      }

      const status = crawlerScheduler.getTaskStatus(taskId);

      if (!status) {
        return res.status(404).json({
          success: false,
          message: '任务不存在'
        });
      }

      res.json({
        success: true,
        data: status,
        message: '获取任务状态成功'
      });
    } catch (error) {
      next(error);
    }
  }
}

module.exports = new CrawlerController();
