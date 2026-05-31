const WEIGHT_CONFIG = {
  journalImpactFactor: 0.30,
  citationCount: 0.25,
  recency: 0.15,
  authorHIndex: 0.15,
  venueQuality: 0.10,
  relevance: 0.05
};

class WeightCalculator {
  constructor() {
    this.config = WEIGHT_CONFIG;
  }

  calculate(literature, context = {}) {
    const scores = {
      journalImpactFactor: this.calculateJournalScore(literature),
      citationCount: this.calculateCitationScore(literature),
      recency: this.calculateRecencyScore(literature),
      authorHIndex: this.calculateAuthorScore(literature),
      venueQuality: this.calculateVenueScore(literature),
      relevance: this.calculateRelevanceScore(literature, context)
    };

    const totalScore = Object.entries(scores).reduce((sum, [key, score]) => {
      return sum + score * this.config[key];
    }, 0);

    return {
      totalScore: Math.round(totalScore * 100) / 100,
      breakdown: scores,
      weights: this.config,
      level: this.getLevel(totalScore),
      recommendations: this.getRecommendations(literature, scores)
    };
  }

  calculateBatch(literatures, context = {}) {
    return literatures.map(lit => ({
      ...lit,
      weight: this.calculate(lit, context)
    })).sort((a, b) => b.weight.totalScore - a.weight.totalScore);
  }

  calculateJournalScore(literature) {
    const impactFactor = literature.impactFactor || 0;
    
    if (impactFactor >= 20) return 100;
    if (impactFactor >= 10) return 90;
    if (impactFactor >= 5) return 80;
    if (impactFactor >= 3) return 70;
    if (impactFactor >= 1) return 50;
    if (impactFactor > 0) return 30;
    
    const journalRank = literature.journalRank || '';
    if (journalRank === 'Q1') return 85;
    if (journalRank === 'Q2') return 70;
    if (journalRank === 'Q3') return 50;
    if (journalRank === 'Q4') return 30;
    
    return 20;
  }

  calculateCitationScore(literature) {
    const citations = literature.citationCount || 0;
    const years = (new Date().getFullYear()) - (literature.year || new Date().getFullYear());
    const normalizedYears = Math.max(years, 1);
    
    const citationsPerYear = citations / normalizedYears;
    
    if (citationsPerYear >= 50) return 100;
    if (citationsPerYear >= 30) return 90;
    if (citationsPerYear >= 20) return 80;
    if (citationsPerYear >= 10) return 70;
    if (citationsPerYear >= 5) return 60;
    if (citationsPerYear >= 1) return 40;
    if (citations > 0) return 20;
    
    return 0;
  }

  calculateRecencyScore(literature) {
    const currentYear = new Date().getFullYear();
    const pubYear = literature.year || currentYear;
    const yearsAgo = currentYear - pubYear;
    
    if (yearsAgo <= 1) return 100;
    if (yearsAgo <= 3) return 90;
    if (yearsAgo <= 5) return 80;
    if (yearsAgo <= 10) return 60;
    if (yearsAgo <= 15) return 40;
    if (yearsAgo <= 20) return 20;
    
    return 10;
  }

  calculateAuthorScore(literature) {
    const authors = literature.authors || [];
    if (authors.length === 0) return 0;
    
    const hIndices = authors
      .map(a => a.hIndex || 0)
      .filter(h => h > 0);
    
    if (hIndices.length === 0) {
      return 30;
    }
    
    const avgHIndex = hIndices.reduce((a, b) => a + b, 0) / hIndices.length;
    const maxHIndex = Math.max(...hIndices);
    const combinedScore = (avgHIndex * 0.4 + maxHIndex * 0.6);
    
    if (combinedScore >= 50) return 100;
    if (combinedScore >= 30) return 90;
    if (combinedScore >= 20) return 80;
    if (combinedScore >= 15) return 70;
    if (combinedScore >= 10) return 60;
    if (combinedScore >= 5) return 50;
    
    return 40;
  }

  calculateVenueScore(literature) {
    const venueType = literature.venueType || 'journal';
    const isPeerReviewed = literature.isPeerReviewed !== false;
    const isOpenAccess = literature.isOpenAccess || false;
    
    let score = 50;
    
    if (isPeerReviewed) score += 20;
    if (isOpenAccess) score += 10;
    
    switch (venueType) {
      case 'journal': score += 10; break;
      case 'conference': score += 15; break;
      case 'book': score += 5; break;
      case 'thesis': score += 0; break;
      case 'preprint': score -= 10; break;
    }
    
    return Math.min(score, 100);
  }

  calculateRelevanceScore(literature, context) {
    if (!context.keywords && !context.query) return 50;
    
    const keywords = (context.keywords || []).concat(
      (context.query || '').split(/\s+/).filter(w => w.length > 2)
    );
    
    if (keywords.length === 0) return 50;
    
    const text = [
      literature.title || '',
      literature.abstract || '',
      literature.keywords ? literature.keywords.join(' ') : ''
    ].join(' ').toLowerCase();
    
    let matchCount = 0;
    keywords.forEach(kw => {
      if (text.includes(kw.toLowerCase())) {
        matchCount++;
      }
    });
    
    const matchRatio = matchCount / keywords.length;
    return Math.round(matchRatio * 100);
  }

  getLevel(totalScore) {
    if (totalScore >= 85) return { level: 'A+', label: '顶级学术价值', color: '#ff4757' };
    if (totalScore >= 75) return { level: 'A', label: '高学术价值', color: '#ff6348' };
    if (totalScore >= 65) return { level: 'B+', label: '较高学术价值', color: '#ffa502' };
    if (totalScore >= 55) return { level: 'B', label: '中学术价值', color: '#2ed573' };
    if (totalScore >= 45) return { level: 'C', label: '一般学术价值', color: '#1e90ff' };
    return { level: 'D', label: '较低学术价值', color: '#747d8c' };
  }

  getRecommendations(literature, scores) {
    const recommendations = [];
    
    if (scores.citationCount < 50) {
      recommendations.push({
        type: 'citation',
        message: '该文献被引量相对较低，建议结合领域内高引文献对比阅读',
        priority: scores.citationCount < 20 ? 'high' : 'medium'
      });
    }
    
    if (scores.recency < 50) {
      recommendations.push({
        type: 'recency',
        message: '该文献发表时间较久，建议关注该领域最新研究进展',
        priority: scores.recency < 30 ? 'high' : 'medium'
      });
    }
    
    if (scores.journalImpactFactor < 50) {
      recommendations.push({
        type: 'venue',
        message: '建议参考该领域顶级期刊的相关研究',
        priority: 'medium'
      });
    }
    
    return recommendations;
  }

  matchRelated(literature, candidates, options = {}) {
    const threshold = options.threshold || 0.6;
    
    const results = candidates.map(candidate => {
      const similarity = this.calculateSimilarity(literature, candidate);
      return {
        ...candidate,
        similarity: similarity,
        matchType: this.getMatchType(similarity)
      };
    });
    
    return results
      .filter(r => r.similarity >= threshold)
      .sort((a, b) => b.similarity - a.similarity);
  }

  calculateSimilarity(lit1, lit2) {
    let score = 0;
    let maxScore = 0;
    
    if (lit1.title && lit2.title) {
      const titleSim = this.textSimilarity(lit1.title, lit2.title);
      score += titleSim * 30;
      maxScore += 30;
    }
    
    if (lit1.abstract && lit2.abstract) {
      const abstractSim = this.textSimilarity(lit1.abstract, lit2.abstract);
      score += abstractSim * 25;
      maxScore += 25;
    }
    
    const kw1 = new Set(lit1.keywords || []);
    const kw2 = new Set(lit2.keywords || []);
    if (kw1.size > 0 || kw2.size > 0) {
      const intersection = [...kw1].filter(k => kw2.has(k));
      const union = [...new Set([...kw1, ...kw2])];
      const kwSim = union.length > 0 ? intersection.length / union.length : 0;
      score += kwSim * 20;
      maxScore += 20;
    }
    
    const authors1 = new Set((lit1.authors || []).map(a => a.lastName));
    const authors2 = new Set((lit2.authors || []).map(a => a.lastName));
    if (authors1.size > 0 || authors2.size > 0) {
      const authorIntersection = [...authors1].filter(a => authors2.has(a));
      const authorSim = authorIntersection.length / Math.max(authors1.size, authors2.size, 1);
      score += authorSim * 15;
      maxScore += 15;
    }
    
    if (lit1.journal && lit2.journal && lit1.journal === lit2.journal) {
      score += 10;
    }
    maxScore += 10;
    
    return maxScore > 0 ? score / maxScore : 0;
  }

  textSimilarity(text1, text2) {
    const words1 = new Set(text1.toLowerCase().split(/\W+/).filter(w => w.length > 2));
    const words2 = new Set(text2.toLowerCase().split(/\W+/).filter(w => w.length > 2));
    
    if (words1.size === 0 || words2.size === 0) return 0;
    
    const intersection = [...words1].filter(w => words2.has(w));
    const union = [...new Set([...words1, ...words2])];
    
    return intersection.length / union.length;
  }

  getMatchType(similarity) {
    if (similarity >= 0.9) return { type: 'duplicate', label: '可能重复', color: '#ff4757' };
    if (similarity >= 0.7) return { type: 'high', label: '高度相关', color: '#ff6348' };
    if (similarity >= 0.5) return { type: 'medium', label: '中度相关', color: '#ffa502' };
    return { type: 'low', label: '弱相关', color: '#747d8c' };
  }
}

module.exports = new WeightCalculator();
