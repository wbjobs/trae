const CoordinateSystem = require('./coordinate');

class CollisionDetector {
  constructor(coordinateSystem) {
    this.coordSystem = coordinateSystem || new CoordinateSystem();
    this.minSeparation = {
      horizontal: 50,
      vertical: 100,
      timeWindow: 30000
    };
  }

  setMinSeparation(horizontal, vertical, timeWindow) {
    if (horizontal !== undefined) this.minSeparation.horizontal = horizontal;
    if (vertical !== undefined) this.minSeparation.vertical = vertical;
    if (timeWindow !== undefined) this.minSeparation.timeWindow = timeWindow;
  }

  checkPointCollision(p1, p2, options = {}) {
    const horizontalDist = this.coordSystem.distance2D(p1, p2);
    const verticalDist = Math.abs(p1.altitude - p2.altitude);
    const timeDiff = p1.timestamp && p2.timestamp ? Math.abs(p1.timestamp - p2.timestamp) : 0;

    const minHorizontal = options.minHorizontal || this.minSeparation.horizontal;
    const minVertical = options.minVertical || this.minSeparation.vertical;
    const maxTimeDiff = options.timeWindow !== undefined ? options.timeWindow : Infinity;

    return {
      isCollision: horizontalDist <= minHorizontal && verticalDist <= minVertical && timeDiff < maxTimeDiff,
      horizontalDist,
      verticalDist,
      timeDiff,
      severity: this.calculateSeverity(horizontalDist, verticalDist, minHorizontal, minVertical)
    };
  }

  calculateSeverity(horizontalDist, verticalDist, minHorizontal, minVertical) {
    const hRatio = horizontalDist / minHorizontal;
    const vRatio = verticalDist / minVertical;
    const minRatio = Math.min(hRatio, vRatio);
    
    if (minRatio < 0.3) return 'critical';
    if (minRatio < 0.6) return 'warning';
    if (minRatio < 1) return 'caution';
    return 'safe';
  }

  checkRouteCollision(route1, route2, options = {}) {
    const collisions = [];
    const sampleInterval = options.sampleInterval || 1000;
    
    const length1 = this.coordSystem.calculateRouteLength(route1);
    const length2 = this.coordSystem.calculateRouteLength(route2);
    const maxLength = Math.max(length1, length2);
    
    for (let dist = 0; dist <= maxLength; dist += sampleInterval) {
      const p1 = this.coordSystem.getPointAlongRoute(route1, dist);
      const p2 = this.coordSystem.getPointAlongRoute(route2, dist);
      
      if (p1 && p2) {
        const result = this.checkPointCollision(p1, p2, options);
        if (result.isCollision) {
          collisions.push({
            distance: dist,
            point1: p1,
            point2: p2,
            ...result
          });
        }
      }
    }
    
    return {
      hasCollision: collisions.length > 0,
      collisions,
      firstCollision: collisions[0] || null,
      collisionCount: collisions.length
    };
  }

  checkMultiRouteCollisions(routes, options = {}) {
    const results = [];
    
    for (let i = 0; i < routes.length; i++) {
      for (let j = i + 1; j < routes.length; j++) {
        const collisionResult = this.checkRouteCollision(routes[i], routes[j], options);
        if (collisionResult.hasCollision) {
          results.push({
            routeIndex1: i,
            routeIndex2: j,
            ...collisionResult
          });
        }
      }
    }
    
    return {
      hasAnyCollision: results.length > 0,
      collisionPairs: results,
      totalCollisions: results.reduce((sum, r) => sum + r.collisionCount, 0)
    };
  }

  predictCollision(p1, v1, p2, v2, options = {}) {
    const timeHorizon = options.timeHorizon || 60000;
    const step = options.step || 1000;
    
    for (let t = 0; t <= timeHorizon; t += step) {
      const futureP1 = {
        x: p1.x + v1.x * t / 1000,
        y: p1.y + v1.y * t / 1000,
        altitude: p1.altitude + v1.z * t / 1000,
        timestamp: p1.timestamp + t
      };
      
      const futureP2 = {
        x: p2.x + v2.x * t / 1000,
        y: p2.y + v2.y * t / 1000,
        altitude: p2.altitude + v2.z * t / 1000,
        timestamp: p2.timestamp + t
      };
      
      const result = this.checkPointCollision(futureP1, futureP2, options);
      if (result.isCollision) {
        return {
          willCollide: true,
          timeToCollision: t,
          point1: futureP1,
          point2: futureP2,
          ...result
        };
      }
    }
    
    return { willCollide: false };
  }

  checkResourceOverlap(aircraft, resourcePoint, options = {}) {
    const horizontalDist = this.coordSystem.distance2D(aircraft, resourcePoint);
    const verticalDist = Math.abs(aircraft.altitude - resourcePoint.altitude);
    const captureRadius = options.captureRadius || 30;
    const captureAltitude = options.captureAltitude || 50;

    return {
      isOverlapping: horizontalDist < captureRadius && verticalDist < captureAltitude,
      horizontalDist,
      verticalDist,
      captureProgress: Math.max(0, 1 - Math.max(horizontalDist / captureRadius, verticalDist / captureAltitude))
    };
  }

  checkNoFlyZone(point, noFlyZone) {
    if (noFlyZone.type === 'circle') {
      const dist = this.coordSystem.distance2D(point, noFlyZone.center);
      return dist < noFlyZone.radius;
    }
    
    if (noFlyZone.type === 'polygon') {
      return this.isPointInPolygon(point, noFlyZone.vertices);
    }
    
    if (noFlyZone.type === 'cuboid') {
      return point.x >= noFlyZone.minX && point.x <= noFlyZone.maxX &&
             point.y >= noFlyZone.minY && point.y <= noFlyZone.maxY &&
             point.altitude >= noFlyZone.minAlt && point.altitude <= noFlyZone.maxAlt;
    }
    
    return false;
  }

  isPointInPolygon(point, vertices) {
    let inside = false;
    for (let i = 0, j = vertices.length - 1; i < vertices.length; j = i++) {
      const xi = vertices[i].x, yi = vertices[i].y;
      const xj = vertices[j].x, yj = vertices[j].y;
      
      if (((yi > point.y) !== (yj > point.y)) &&
          (point.x < (xj - xi) * (point.y - yi) / (yj - yi) + xi)) {
        inside = !inside;
      }
    }
    return inside;
  }
}

module.exports = CollisionDetector;
