const citationParser = require('../utils/citationParser');
const formatRenderer = require('../utils/formatRenderer');
const citationCorrector = require('../utils/citationCorrector');
const validator = require('../utils/validator');

class CitationController {
  async parseCitation(req, res, next) {
    try {
      const { citation, format } = req.body;
      
      if (!citation) {
        return res.status(400).json({
          success: false,
          message: '请提供引文内容'
        });
      }

      const result = citationParser.parse(citation, format);

      res.json({
        success: true,
        data: result,
        message: '引文解析成功'
      });
    } catch (error) {
      next(error);
    }
  }

  async formatCitation(req, res, next) {
    try {
      const { literature, format } = req.body;
      
      if (!literature) {
        return res.status(400).json({
          success: false,
          message: '请提供文献数据'
        });
      }

      if (!format) {
        return res.status(400).json({
          success: false,
          message: '请指定输出格式'
        });
      }

      const formattedCitation = formatRenderer.render(literature, format, { format });

      const exports = {
        bibtex: formatRenderer.exportToBibTeX(literature),
        ris: formatRenderer.exportToRIS(literature)
      };

      res.json({
        success: true,
        data: {
          citation: formattedCitation,
          format,
          exports
        },
        message: '格式转换成功'
      });
    } catch (error) {
      next(error);
    }
  }

  async batchFormatCitations(req, res, next) {
    try {
      const { literatures, format } = req.body;
      
      if (!literatures || !Array.isArray(literatures) || literatures.length === 0) {
        return res.status(400).json({
          success: false,
          message: '请提供文献数组'
        });
      }

      if (!format) {
        return res.status(400).json({
          success: false,
          message: '请指定输出格式'
        });
      }

      const formattedCitations = formatRenderer.renderBatch(literatures, format, { format });

      res.json({
        success: true,
        data: {
          citations: formattedCitations,
          format,
          count: formattedCitations.length
        },
        message: '批量格式转换成功'
      });
    } catch (error) {
      next(error);
    }
  }

  getSupportedFormats(req, res, next) {
    try {
      const formats = formatRenderer.getSupportedFormats();

      res.json({
        success: true,
        data: formats,
        message: '获取支持的格式列表成功'
      });
    } catch (error) {
      next(error);
    }
  }

  async getFormatRules(req, res, next) {
    try {
      const { format } = req.body;
      
      if (!format) {
        return res.status(400).json({
          success: false,
          message: '请指定格式'
        });
      }

      const rules = formatRenderer.getFormatRules(format);

      if (!rules) {
        return res.status(404).json({
          success: false,
          message: '不支持的格式'
        });
      }

      res.json({
        success: true,
        data: rules,
        message: '获取格式规则成功'
      });
    } catch (error) {
      next(error);
    }
  }

  async analyzeCitation(req, res, next) {
    try {
      const { citation } = req.body;
      
      if (!citation) {
        return res.status(400).json({
          success: false,
          message: '请提供引文数据'
        });
      }

      const parsed = typeof citation === 'string' 
        ? citationParser.parse(citation)
        : citation;

      const analysis = citationCorrector.analyze(parsed);

      res.json({
        success: true,
        data: analysis,
        message: '引文分析完成'
      });
    } catch (error) {
      next(error);
    }
  }

  async autoFixCitation(req, res, next) {
    try {
      const { citation } = req.body;
      
      if (!citation) {
        return res.status(400).json({
          success: false,
          message: '请提供引文数据'
        });
      }

      const parsed = typeof citation === 'string' 
        ? citationParser.parse(citation)
        : citation;

      const fixResult = citationCorrector.autoFix(parsed);

      res.json({
        success: fixResult.success,
        data: fixResult,
        message: fixResult.success ? '自动修复完成' : fixResult.message
      });
    } catch (error) {
      next(error);
    }
  }

  async batchAnalyzeCitations(req, res, next) {
    try {
      const { citations } = req.body;
      
      if (!citations || !Array.isArray(citations)) {
        return res.status(400).json({
          success: false,
          message: '请提供引文数组'
        });
      }

      const parsedCitations = citations.map(c => 
        typeof c === 'string' ? citationParser.parse(c) : c
      );

      const results = citationCorrector.batchAnalyze(parsedCitations);

      res.json({
        success: true,
        data: results,
        message: '批量分析完成'
      });
    } catch (error) {
      next(error);
    }
  }
}

module.exports = new CitationController();
