class CoordinateSystem {
  constructor(bounds) {
    this.bounds = bounds || {
      minX: 0, maxX: 1000,
      minY: 0, maxY: 1000,
      minAlt: 100, maxAlt: 10000
    };
  }

  createPoint(x, y, altitude, timestamp) {
    return {
      x: Math.max(this.bounds.minX, Math.min(this.bounds.maxX, x)),
      y: Math.max(this.bounds.minY, Math.min(this.bounds.maxY, y)),
      altitude: Math.max(this.bounds.minAlt, Math.min(this.bounds.maxAlt, altitude)),
      timestamp: timestamp || Date.now()
    };
  }

  distance3D(p1, p2) {
    const dx = p2.x - p1.x;
    const dy = p2.y - p1.y;
    const dz = p2.altitude - p1.altitude;
    return Math.sqrt(dx * dx + dy * dy + dz * dz);
  }

  distance2D(p1, p2) {
    const dx = p2.x - p1.x;
    const dy = p2.y - p1.y;
    return Math.sqrt(dx * dx + dy * dy);
  }

  calculateBearing(p1, p2) {
    const dx = p2.x - p1.x;
    const dy = p2.y - p1.y;
    const bearing = Math.atan2(dy, dx) * 180 / Math.PI;
    return (bearing + 360) % 360;
  }

  calculateVelocity(p1, p2) {
    const distance = this.distance3D(p1, p2);
    const timeDiff = (p2.timestamp - p1.timestamp) / 1000;
    if (timeDiff <= 0) return 0;
    return distance / timeDiff;
  }

  interpolatePoint(p1, p2, ratio) {
    return this.createPoint(
      p1.x + (p2.x - p1.x) * ratio,
      p1.y + (p2.y - p1.y) * ratio,
      p1.altitude + (p2.altitude - p1.altitude) * ratio,
      p1.timestamp + (p2.timestamp - p1.timestamp) * ratio
    );
  }

  getPointAlongRoute(route, distance) {
    if (route.length < 2) return route[0] || null;
    
    let accumulatedDistance = 0;
    for (let i = 0; i < route.length - 1; i++) {
      const segmentDistance = this.distance3D(route[i], route[i + 1]);
      if (accumulatedDistance + segmentDistance >= distance) {
        const remainingDistance = distance - accumulatedDistance;
        const ratio = remainingDistance / segmentDistance;
        return this.interpolatePoint(route[i], route[i + 1], ratio);
      }
      accumulatedDistance += segmentDistance;
    }
    
    return route[route.length - 1];
  }

  calculateRouteLength(route) {
    if (route.length < 2) return 0;
    let totalLength = 0;
    for (let i = 0; i < route.length - 1; i++) {
      totalLength += this.distance3D(route[i], route[i + 1]);
    }
    return totalLength;
  }

  isPointInBounds(point) {
    return point.x >= this.bounds.minX && point.x <= this.bounds.maxX &&
           point.y >= this.bounds.minY && point.y <= this.bounds.maxY &&
           point.altitude >= this.bounds.minAlt && point.altitude <= this.bounds.maxAlt;
  }

  getMidpoint(p1, p2) {
    return this.createPoint(
      (p1.x + p2.x) / 2,
      (p1.y + p2.y) / 2,
      (p1.altitude + p2.altitude) / 2
    );
  }
}

module.exports = CoordinateSystem;
