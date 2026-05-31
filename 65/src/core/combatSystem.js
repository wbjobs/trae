class CombatSystem {
  constructor(collisionDetector, config = {}) {
    this.collisionDetector = collisionDetector;
    this.config = {
      baseDamage: config.baseDamage || 20,
      baseHitChance: config.baseHitChance || 0.8,
      maxHitDistance: config.maxHitDistance || 500,
      collisionDamage: config.collisionDamage || 30,
      ...config
    };
    this.combatLogs = [];
  }

  calculateHitChance(attacker, target, weatherModifier = 1) {
    const distance = this.collisionDetector.coordSystem.distance3D(attacker.position, target.position);
    const distanceFactor = Math.max(0, 1 - distance / this.config.maxHitDistance);
    const baseChance = this.config.baseHitChance * distanceFactor * weatherModifier;
    return Math.max(0.1, Math.min(0.95, baseChance));
  }

  calculateDamage(attacker, target, hitChance, isCritical = false) {
    let damage = this.config.baseDamage;
    if (isCritical) {
      damage *= 1.5;
    }
    const distance = this.collisionDetector.coordSystem.distance3D(attacker.position, target.position);
    const rangeModifier = Math.max(0.5, 1 - distance / this.config.maxHitDistance);
    damage = Math.floor(damage * rangeModifier);
    return Math.max(1, damage);
  }

  fireWeapon(attacker, target, weatherModifier = 1) {
    if (!attacker || !target) {
      return { success: false, reason: 'invalid_target' };
    }
    if (attacker.ammo <= 0) {
      return { success: false, reason: 'no_ammo' };
    }
    if (target.status === 'crashed') {
      return { success: false, reason: 'target_destroyed' };
    }
    attacker.ammo--;
    const hitChance = this.calculateHitChance(attacker, target, weatherModifier);
    const isCritical = Math.random() < 0.1;
    const hit = Math.random() < hitChance;
    if (hit) {
      const damage = this.calculateDamage(attacker, target, hitChance, isCritical);
      const actualDamage = target.takeDamage(damage);
      attacker.addScore(actualDamage);
      const destroyed = target.health <= 0;
      if (destroyed) {
        target.status = 'crashed';
        attacker.addScore(100);
      }
      const log = this.createCombatLog({
        type: 'weapon_fire',
        attackerId: attacker.id,
        targetId: target.id,
        hit: true,
        damage: actualDamage,
        isCritical,
        destroyed
      });
      return {
        success: true,
        hit: true,
        damage: actualDamage,
        isCritical,
        destroyed,
        targetHealth: target.health,
        log
      };
    }
    const log = this.createCombatLog({
      type: 'weapon_fire',
      attackerId: attacker.id,
      targetId: target.id,
      hit: false,
      damage: 0,
      isCritical: false,
      destroyed: false
    });
    return { success: true, hit: false, log };
  }

  handleCollision(aircraft1, aircraft2, collisionResult) {
    const damage1 = Math.floor(this.config.collisionDamage * (collisionResult.severity === 'critical' ? 1.5 : 1));
    const damage2 = Math.floor(this.config.collisionDamage * (collisionResult.severity === 'critical' ? 1.5 : 1));
    const actualDamage1 = aircraft1.takeDamage(damage1);
    const actualDamage2 = aircraft2.takeDamage(damage2);
    aircraft1.collisions.push({
      with: aircraft2.id,
      severity: collisionResult.severity,
      timestamp: Date.now()
    });
    aircraft2.collisions.push({
      with: aircraft1.id,
      severity: collisionResult.severity,
      timestamp: Date.now()
    });
    const destroyed1 = aircraft1.health <= 0;
    const destroyed2 = aircraft2.health <= 0;
    if (destroyed1) aircraft1.status = 'crashed';
    if (destroyed2) aircraft2.status = 'crashed';
    const log = this.createCombatLog({
      type: 'collision',
      aircraft1Id: aircraft1.id,
      aircraft2Id: aircraft2.id,
      severity: collisionResult.severity,
      damage1: actualDamage1,
      damage2: actualDamage2,
      destroyed1,
      destroyed2
    });
    return {
      damage1: actualDamage1,
      damage2: actualDamage2,
      destroyed1,
      destroyed2,
      log
    };
  }

  createCombatLog(data) {
    const log = {
      id: Date.now() + '-' + Math.random().toString(36).substr(2, 9),
      timestamp: Date.now(),
      ...data
    };
    this.combatLogs.push(log);
    return log;
  }

  getCombatLogs(filter = {}) {
    let logs = [...this.combatLogs];
    if (filter.type) {
      logs = logs.filter(l => l.type === filter.type);
    }
    if (filter.attackerId) {
      logs = logs.filter(l => l.attackerId === filter.attackerId || l.aircraft1Id === filter.attackerId);
    }
    if (filter.targetId) {
      logs = logs.filter(l => l.targetId === filter.targetId || l.aircraft2Id === filter.targetId);
    }
    if (filter.since) {
      logs = logs.filter(l => l.timestamp >= filter.since);
    }
    return logs;
  }

  clearLogs() {
    this.combatLogs = [];
  }

  getStats() {
    const totalFires = this.combatLogs.filter(l => l.type === 'weapon_fire').length;
    const hits = this.combatLogs.filter(l => l.type === 'weapon_fire' && l.hit).length;
    const criticalHits = this.combatLogs.filter(l => l.isCritical).length;
    const destroyed = this.combatLogs.filter(l => l.destroyed || l.destroyed1 || l.destroyed2).length;
    const collisions = this.combatLogs.filter(l => l.type === 'collision').length;
    return {
      totalFires,
      hits,
      misses: totalFires - hits,
      hitRate: totalFires > 0 ? (hits / totalFires * 100).toFixed(1) + '%' : '0%',
      criticalHits,
      destroyed,
      collisions,
      totalLogs: this.combatLogs.length
    };
  }
}

module.exports = CombatSystem;
