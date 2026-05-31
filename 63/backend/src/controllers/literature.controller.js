const weightCalculator = require('../utils/weightCalculator');
const storage = require('../utils/storage');
const { mockLiteratures, getMockLiteratureById } = require('../data/mockLiterature');

class LiteratureController {
  async calculateWeight(req, res, next) {
    try {
      const { literature, context } = req.body;
      
      if (!literature) {
        return res.status(400).json({
          success: false,
          message: '请提供文献数据'
        });
      }

      const weightResult = weightCalculator.calculate(literature, context || {});

      res.json({
        success: true,
        data: weightResult,
        message: '文献权重计算成功'
      });
    } catch (error) {
      next(error);
    }
  }

  async batchCalculateWeight(req, res, next) {
    try {
      const { literatures, context } = req.body;
      
      if (!literatures || !Array.isArray(literatures) || literatures.length === 0) {
        return res.status(400).json({
          success: false,
          message: '请提供文献数组'
        });
      }

      const results = weightCalculator.calculateBatch(literatures, context || {});

      res.json({
        success: true,
        data: {
          results,
          count: results.length
        },
        message: '批量权重计算成功'
      });
    } catch (error) {
      next(error);
    }
  }

  async getRecommendations(req, res, next) {
    try {
      const { literature, limit = 5 } = req.body;
      
      if (!literature) {
        return res.status(400).json({
          success: false,
          message: '请提供文献数据'
        });
      }

      const candidates = [...mockLiteratures].filter(l => l.id !== literature.id);
      const related = weightCalculator.matchRelated(literature, candidates, { threshold: 0.3 });

      const recommendations = related.slice(0, limit).map(lit => ({
        ...lit,
        weight: weightCalculator.calculate(lit, { keywords: literature.keywords || [] })
      }));

      res.json({
        success: true,
        data: {
          recommendations,
          count: recommendations.length
        },
        message: '获取推荐文献成功'
      });
    } catch (error) {
      next(error);
    }
  }

  async getLiteratureById(req, res, next) {
    try {
      const { id } = req.params;
      
      if (!id) {
        return res.status(400).json({
          success: false,
          message: '请提供文献ID'
        });
      }

      let literature = storage.getLiterature(id);
      
      if (!literature) {
        literature = getMockLiteratureById(id);
      }

      if (!literature) {
        return res.status(404).json({
          success: false,
          message: '文献不存在'
        });
      }

      res.json({
        success: true,
        data: literature,
        message: '获取文献成功'
      });
    } catch (error) {
      next(error);
    }
  }

  async matchRelatedLiterature(req, res, next) {
    try {
      const { literature, candidates, threshold } = req.body;
      
      if (!literature) {
        return res.status(400).json({
          success: false,
          message: '请提供文献数据'
        });
      }

      const candidateList = candidates || mockLiteratures.filter(l => l.id !== literature.id);
      const results = weightCalculator.matchRelated(literature, candidateList, { threshold });

      res.json({
        success: true,
        data: {
          matches: results,
          count: results.length
        },
        message: '关联匹配成功'
      });
    } catch (error) {
      next(error);
    }
  }
}

module.exports = new LiteratureController();
