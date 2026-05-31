const fs = require('fs');
const path = require('path');
const { v4: uuidv4 } = require('uuid');

class GameStorage {
  constructor(dataDir = 'data') {
    this.dataDir = path.join(process.cwd(), dataDir);
    this.gamesDir = path.join(this.dataDir, 'games');
    this.playersDir = path.join(this.dataDir, 'players');
    this.ensureDirectories();
  }

  ensureDirectories() {
    if (!fs.existsSync(this.dataDir)) {
      fs.mkdirSync(this.dataDir, { recursive: true });
    }
    if (!fs.existsSync(this.gamesDir)) {
      fs.mkdirSync(this.gamesDir, { recursive: true });
    }
    if (!fs.existsSync(this.playersDir)) {
      fs.mkdirSync(this.playersDir, { recursive: true });
    }
  }

  saveGameResult(gameResult) {
    const gameId = gameResult.gameId || uuidv4();
    const filePath = path.join(this.gamesDir, `${gameId}.json`);
    const data = {
      ...gameResult,
      gameId,
      savedAt: Date.now()
    };
    
    fs.writeFileSync(filePath, JSON.stringify(data, null, 2));
    this.updatePlayerStats(gameResult);
    
    return gameId;
  }

  loadGameResult(gameId) {
    const filePath = path.join(this.gamesDir, `${gameId}.json`);
    if (!fs.existsSync(filePath)) {
      return null;
    }
    
    try {
      const data = fs.readFileSync(filePath, 'utf8');
      return JSON.parse(data);
    } catch (error) {
      console.error('加载游戏记录失败:', error);
      return null;
    }
  }

  getRecentGames(limit = 20) {
    const files = fs.readdirSync(this.gamesDir)
      .filter(f => f.endsWith('.json'))
      .sort((a, b) => {
        const statA = fs.statSync(path.join(this.gamesDir, a));
        const statB = fs.statSync(path.join(this.gamesDir, b));
        return statB.mtime - statA.mtime;
      })
      .slice(0, limit);

    return files.map(f => {
      try {
        const data = fs.readFileSync(path.join(this.gamesDir, f), 'utf8');
        const game = JSON.parse(data);
        return {
          gameId: game.gameId,
          startTime: game.startTime,
          endTime: game.endTime,
          duration: game.duration,
          playerCount: game.playerCount,
          winner: game.winner,
          map: game.map
        };
      } catch {
        return null;
      }
    }).filter(Boolean);
  }

  updatePlayerStats(gameResult) {
    if (!gameResult.scores) return;

    gameResult.scores.forEach((playerScore, index) => {
      const playerStats = this.getPlayerStats(playerScore.playerId);
      const isWinner = gameResult.winner && gameResult.winner.playerId === playerScore.playerId;
      
      playerStats.totalGames += 1;
      playerStats.totalScore += playerScore.score;
      playerStats.highestScore = Math.max(playerStats.highestScore, playerScore.score);
      
      if (isWinner) {
        playerStats.wins += 1;
        playerStats.winStreak += 1;
      } else {
        playerStats.losses += 1;
        playerStats.winStreak = 0;
      }

      if (gameResult.events) {
        const playerEvents = gameResult.events.filter(e => 
          e.data && (e.data.attackerId === playerScore.playerId || 
                    e.data.playerId === playerScore.playerId)
        );
        
        playerStats.kills += playerEvents.filter(e => e.type === 'aircraft_destroyed' && e.data.attackerId === playerScore.playerId).length;
        playerStats.resourcesCaptured += playerEvents.filter(e => e.type === 'resource_captured' && e.data.playerId === playerScore.playerId).length;
      }

      playerStats.recentGames.unshift({
        gameId: gameResult.gameId,
        score: playerScore.score,
        rank: index + 1,
        won: isWinner,
        timestamp: gameResult.endTime
      });

      if (playerStats.recentGames.length > 20) {
        playerStats.recentGames = playerStats.recentGames.slice(0, 20);
      }

      this.savePlayerStats(playerScore.playerId, playerStats);
    });
  }

  getPlayerStats(playerId) {
    const filePath = path.join(this.playersDir, `${playerId}.json`);
    if (!fs.existsSync(filePath)) {
      return {
        playerId,
        totalGames: 0,
        wins: 0,
        losses: 0,
        totalScore: 0,
        highestScore: 0,
        winStreak: 0,
        kills: 0,
        resourcesCaptured: 0,
        recentGames: [],
        createdAt: Date.now()
      };
    }

    try {
      const data = fs.readFileSync(filePath, 'utf8');
      return JSON.parse(data);
    } catch (error) {
      console.error('加载玩家统计失败:', error);
      return {
        playerId,
        totalGames: 0,
        wins: 0,
        losses: 0,
        totalScore: 0,
        highestScore: 0,
        winStreak: 0,
        kills: 0,
        resourcesCaptured: 0,
        recentGames: [],
        createdAt: Date.now()
      };
    }
  }

  savePlayerStats(playerId, stats) {
    const filePath = path.join(this.playersDir, `${playerId}.json`);
    fs.writeFileSync(filePath, JSON.stringify(stats, null, 2));
  }

  getLeaderboard(options = {}) {
    const files = fs.readdirSync(this.playersDir)
      .filter(f => f.endsWith('.json'));

    const players = files.map(f => {
      try {
        const data = fs.readFileSync(path.join(this.playersDir, f), 'utf8');
        return JSON.parse(data);
      } catch {
        return null;
      }
    }).filter(Boolean);

    const sortBy = options.sortBy || 'totalScore';
    players.sort((a, b) => {
      if (sortBy === 'winRate') {
        const winRateA = a.totalGames > 0 ? a.wins / a.totalGames : 0;
        const winRateB = b.totalGames > 0 ? b.wins / b.totalGames : 0;
        return winRateB - winRateA;
      }
      return (b[sortBy] || 0) - (a[sortBy] || 0);
    });

    return players.slice(0, options.limit || 10).map(p => ({
      playerId: p.playerId,
      totalGames: p.totalGames,
      wins: p.wins,
      losses: p.losses,
      totalScore: p.totalScore,
      highestScore: p.highestScore,
      winRate: p.totalGames > 0 ? (p.wins / p.totalGames * 100).toFixed(1) + '%' : '0%',
      winStreak: p.winStreak,
      kills: p.kills,
      resourcesCaptured: p.resourcesCaptured
    }));
  }

  deleteGame(gameId) {
    const filePath = path.join(this.gamesDir, `${gameId}.json`);
    if (fs.existsSync(filePath)) {
      fs.unlinkSync(filePath);
      return true;
    }
    return false;
  }

  getGameCount() {
    const files = fs.readdirSync(this.gamesDir)
      .filter(f => f.endsWith('.json'));
    return files.length;
  }

  getPlayerCount() {
    const files = fs.readdirSync(this.playersDir)
      .filter(f => f.endsWith('.json'));
    return files.length;
  }

  getStorageStats() {
    const gameFiles = fs.readdirSync(this.gamesDir).filter(f => f.endsWith('.json'));
    const playerFiles = fs.readdirSync(this.playersDir).filter(f => f.endsWith('.json'));
    
    let totalGamesSize = 0;
    gameFiles.forEach(f => {
      const stat = fs.statSync(path.join(this.gamesDir, f));
      totalGamesSize += stat.size;
    });

    return {
      totalGames: gameFiles.length,
      totalPlayers: playerFiles.length,
      totalGamesSize: totalGamesSize,
      gamesDir: this.gamesDir,
      playersDir: this.playersDir
    };
  }

  exportAllData() {
    const games = this.getRecentGames(1000);
    const leaderboard = this.getLeaderboard({ limit: 100 });
    
    return {
      exportedAt: Date.now(),
      games,
      leaderboard
    };
  }
}

module.exports = GameStorage;
