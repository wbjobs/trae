export class GeofenceManager {
  constructor(mapManager, onEvent) {
    this.mapManager = mapManager;
    this.onEvent = onEvent;
    this.geofences = new Map();
    this.memberStates = new Map();
    this.checkInterval = null;
    this.checkIntervalMs = 500;
  }

  addCircle(name, center, radius, color = '#EF4444') {
    const id = `gf_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
    
    const layer = this.mapManager.addCircleGeofence(id, center, radius, name, color);
    
    this.geofences.set(id, {
      id,
      name,
      type: 'circle',
      center,
      radius,
      color,
      layer,
    });

    this.initMemberStates();

    return id;
  }

  addPolygon(name, vertices, color = '#10B981') {
    const id = `gf_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
    
    const layer = this.mapManager.addPolygonGeofence(id, vertices, name, color);
    
    this.geofences.set(id, {
      id,
      name,
      type: 'polygon',
      vertices,
      color,
      layer,
    });

    this.initMemberStates();

    return id;
  }

  remove(id) {
    const geofence = this.geofences.get(id);
    if (geofence) {
      this.mapManager.removeGeofence(id);
      this.geofences.delete(id);
      
      for (const [memberId, states] of this.memberStates) {
        if (states[id] !== undefined) {
          delete states[id];
        }
      }
    }
  }

  initMemberStates() {
    for (const geofence of this.geofences.values()) {
      for (const [memberId] of this.memberStates) {
        if (this.memberStates.get(memberId)[geofence.id] === undefined) {
          this.memberStates.get(memberId)[geofence.id] = {
            inside: false,
            lastEvent: null,
          };
        }
      }
    }
  }

  checkMemberPosition(peerId, position, memberInfo = {}) {
    if (!this.memberStates.has(peerId)) {
      this.memberStates.set(peerId, {});
      this.initMemberStates();
    }

    const states = this.memberStates.get(peerId);

    for (const [geofenceId, geofence] of this.geofences) {
      const wasInside = states[geofenceId]?.inside || false;
      const isInside = this.isInsideGeofence(position, geofence);

      if (isInside !== wasInside) {
        states[geofenceId] = {
          inside: isInside,
          lastEvent: Date.now(),
        };

        this.onEvent?.({
          peerId,
          geofenceId,
          geofenceName: geofence.name,
          entered: isInside,
          timestamp: Date.now(),
          memberInfo,
        });
      }
    }
  }

  isInsideGeofence(position, geofence) {
    if (geofence.type === 'circle') {
      return this.isInsideCircle(position, geofence.center, geofence.radius);
    } else if (geofence.type === 'polygon') {
      return this.isInsidePolygon(position, geofence.vertices);
    }
    return false;
  }

  isInsideCircle(position, center, radius) {
    const [lat, lng] = position;
    const [centerLat, centerLng] = center;

    const R = 6371000;
    const lat1 = this.toRad(centerLat);
    const lat2 = this.toRad(lat);
    const deltaLat = this.toRad(lat - centerLat);
    const deltaLng = this.toRad(lng - centerLng);

    const a = Math.sin(deltaLat / 2) * Math.sin(deltaLat / 2) +
              Math.cos(lat1) * Math.cos(lat2) *
              Math.sin(deltaLng / 2) * Math.sin(deltaLng / 2);
    const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));

    const distance = R * c;
    return distance <= radius;
  }

  isInsidePolygon(position, vertices) {
    const [lat, lng] = position;
    let inside = false;

    for (let i = 0, j = vertices.length - 1; i < vertices.length; j = i++) {
      const [xi, yi] = vertices[i];
      const [xj, yj] = vertices[j];

      if (((yi > lat) !== (yj > lat)) &&
          (lng < (xj - xi) * (lat - yi) / (yj - yi) + xi)) {
        inside = !inside;
      }
    }

    return inside;
  }

  toRad(deg) {
    return deg * (Math.PI / 180);
  }

  startMonitoring() {
    if (this.checkInterval) {
      return;
    }

    this.checkInterval = setInterval(() => {
    }, this.checkIntervalMs);
  }

  stopMonitoring() {
    if (this.checkInterval) {
      clearInterval(this.checkInterval);
      this.checkInterval = null;
    }
  }

  removeMember(peerId) {
    this.memberStates.delete(peerId);
  }

  getGeofences() {
    return Array.from(this.geofences.values());
  }

  getGeofence(id) {
    return this.geofences.get(id);
  }

  cleanup() {
    this.stopMonitoring();
    this.geofences.clear();
    this.memberStates.clear();
  }
}
