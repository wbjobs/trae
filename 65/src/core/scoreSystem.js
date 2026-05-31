class ScoreSystem {
  constructor(config = {}) {
    this.scores = new Map();
    this.scoreHistory = [];
    this.config = {
      killBonus: config.killBonus || 100,
      damageBonus: config.damageBonus || 1,
      resourceBonus: config.resourceBonus || 1,
      survivalBonus: config.survivalBonus || 10,
      captureBonus: config.captureBonus || 50,
      assistBonus: config.assistBonus || 30,
      ...config
    };
    this.lastUpdateTime = Date.now();
  }

  addScore(playerId, amount, reason = 'generic') {
    const currentScore = this.scores.get(playerId) || 0;
    const newScore = currentScore + amount;
    this.scores.set(playerId, newScore);
    this.scoreHistory.push({
      playerId,
      amount,
      reason,
      oldScore: currentScore,
      newScore,
      timestamp: Date.now()
    });
    return newScore;
  }

  addKill(playerId) {
    return this.addScore(playerId, this.config.killBonus, 'kill');
  }

  addDamage(playerId, damage) {
    const bonus = Math.floor(damage * this.config.damageBonus);
    return this.addScore(playerId, bonus, 'damage');
  }

  addResourceCapture(playerId, resourceValue) {
    const bonus = Math.floor(resourceValue * this.config.resourceBonus);
    return this.addScore(playerId, bonus, 'resource');
  }

  addSurvivalBonus(playerId, minutesSurvived) {
    const bonus = Math.floor(minutesSurvived * this.config.survivalBonus);
    return this.addScore(playerId, bonus, 'survival');
  }

  addCaptureBonus(playerId) {
    return this.addScore(playerId, this.config.captureBonus, 'capture');
  }

  addAssist(playerId) {
    return this.addScore(playerId, this.config.assistBonus, 'assist');
  }

  getScore(playerId) {
    return this.scores.get(playerId) || 0;
  }

  getAllScores() {
    return Array.from(this.scores.entries()).map(([playerId, score]) => ({
      playerId,
      score
    }));
  }

  getRankedScores(playerInfo = new Map()) {
    return this.getAllScores()
      .map(s => ({
        ...s,
        playerName: playerInfo.get(s.playerId)?.name || 'Unknown'
      }))
      .sort((a, b) => b.score - a.score)
      .map((s, index) => ({ ...s, rank: index + 1 }));
  }

  getLeaderboard(limit = 10) {
    return this.getRankedScores().slice(0, limit);
  }

  getPlayerRank(playerId) {
    const ranked = this.getRankedScores();
    const playerRank = ranked.find(s => s.playerId === playerId);
    return playerRank ? playerRank.rank : -1;
  }

  getScoreHistory(playerId, limit = 20) {
    return this.scoreHistory
      .filter(h => h.playerId === playerId)
      .sort((a, b) => b.timestamp - a.timestamp)
      .slice(0, limit);
  }

  getTotalScore() {
    return Array.from(this.scores.values()).reduce((sum, score) => sum + score, 0);
  }

  getAverageScore() {
    const count = this.scores.size;
    return count > 0 ? this.getTotalScore() / count : 0;
  }

  getHighestScore() {
    const scores = Array.from(this.scores.values());
    return scores.length > 0 ? Math.max(...scores) : 0;
  }

  getLowestScore() {
    const scores = Array.from(this.scores.values());
    return scores.length > 0 ? Math.min(...scores) : 0;
  }

  reset() {
    this.scores.clear();
    this.scoreHistory = [];
  }

  getStats() {
    const scores = Array.from(this.scores.values());
    return {
      totalPlayers: scores.length,
      totalScore: this.getTotalScore(),
      averageScore: this.getAverageScore(),
      highestScore: this.getHighestScore(),
      lowestScore: this.getLowestScore(),
      totalEvents: this.scoreHistory.length
    };
  }

  exportState() {
    return {
      scores: Object.fromEntries(this.scores),
      history: this.scoreHistory,
      config: this.config
    };
  }

  importState(state) {
    if (state.scores) {
      this.scores = new Map(Object.entries(state.scores));
    }
    if (state.history) {
      this.scoreHistory = state.history;
    }
    if (state.config) {
      this.config = { ...this.config, ...state.config };
    }
  }
}

module.exports = ScoreSystem;
