export class MapManager {
  constructor(containerId) {
    this.map = null;
    this.containerId = containerId;
    this.memberMarkers = new Map();
    this.memberTrails = new Map();
    this.geofenceLayers = new Map();
    this.defaultCenter = [39.9042, 116.4074];
    this.defaultZoom = 15;
    this.maxTrailPoints = 100;
  }

  initialize() {
    this.map = L.map(this.containerId, {
      center: this.defaultCenter,
      zoom: this.defaultZoom,
      zoomControl: true,
    });

    L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png', {
      attribution: '&copy; OpenStreetMap contributors',
      maxZoom: 19,
    }).addTo(this.map);

    return this.map;
  }

  createMemberMarker(peerId, nickname, color, position) {
    const icon = L.divIcon({
      className: 'custom-marker-icon',
      html: `<div class="custom-marker" style="width: 36px; height: 36px; background-color: ${color};">
        ${nickname.charAt(0).toUpperCase()}
      </div>`,
      iconSize: [36, 36],
      iconAnchor: [18, 18],
    });

    const marker = L.marker(position, { icon }).addTo(this.map);

    const popupContent = `
      <div class="peer-popup">
        <div class="peer-header">
          <div style="width: 24px; height: 24px; border-radius: 50%; background-color: ${color}; display: flex; align-items: center; justify-content: center; color: white; font-weight: 600; font-size: 10px;">
            ${nickname.charAt(0).toUpperCase()}
          </div>
          <span class="peer-name">${nickname}</span>
        </div>
        <div class="peer-coords" id="coords-${peerId}">
          ${position[0].toFixed(6)}, ${position[1].toFixed(6)}
        </div>
      </div>
    `;

    marker.bindPopup(popupContent);

    this.memberMarkers.set(peerId, { marker, nickname, color });
    this.memberTrails.set(peerId, []);

    return marker;
  }

  updateMemberPosition(peerId, position, data = {}) {
    let markerData = this.memberMarkers.get(peerId);

    if (!markerData) {
      const nickname = data.nickname || `Peer ${peerId.slice(0, 6)}`;
      const color = data.color || '#2563EB';
      markerData = this.createMemberMarker(peerId, nickname, color, position);
    }

    markerData.marker.setLatLng(position);

    if (data.nickname) {
      markerData.nickname = data.nickname;
    }
    if (data.color) {
      markerData.color = data.color;
    }

    const coordsElement = document.getElementById(`coords-${peerId}`);
    if (coordsElement) {
      coordsElement.textContent = `${position[0].toFixed(6)}, ${position[1].toFixed(6)}`;
    }

    this.addTrailPoint(peerId, position);
  }

  addTrailPoint(peerId, position) {
    let trail = this.memberTrails.get(peerId);
    if (!trail) {
      trail = [];
      this.memberTrails.set(peerId, trail);
    }

    trail.push(position);

    if (trail.length > this.maxTrailPoints) {
      trail.shift();
    }

    const markerData = this.memberMarkers.get(peerId);
    if (markerData) {
      this.updateTrail(peerId, trail, markerData.color);
    }
  }

  updateTrail(peerId, trailPoints, color) {
    const existingPolyline = this.map._layers[peerId + '_trail'];

    if (trailPoints.length < 2) {
      if (existingPolyline) {
        this.map.removeLayer(existingPolyline);
      }
      return;
    }

    const smoothedPoints = this.smoothTrail(trailPoints);

    if (existingPolyline) {
      existingPolyline.setLatLngs(smoothedPoints);
    } else {
      const polyline = L.polyline(smoothedPoints, {
        color: color,
        weight: 3,
        opacity: 0.7,
        smoothFactor: 1,
      }).addTo(this.map);
      polyline._leaflet_id = peerId + '_trail';
    }
  }

  smoothTrail(points) {
    if (points.length < 3) {
      return points;
    }

    const smoothed = [points[0]];
    
    for (let i = 1; i < points.length - 1; i++) {
      const prev = points[i - 1];
      const curr = points[i];
      const next = points[i + 1];

      const midX = (prev[0] + curr[0]) / 2;
      const midY = (prev[1] + curr[1]) / 2;
      
      smoothed.push([midX, midY]);
      smoothed.push(curr);
    }

    smoothed.push(points[points.length - 1]);

    return smoothed;
  }

  removeMember(peerId) {
    const markerData = this.memberMarkers.get(peerId);
    if (markerData) {
      this.map.removeLayer(markerData.marker);
      this.memberMarkers.delete(peerId);
    }

    const trailPolyline = this.map._layers[peerId + '_trail'];
    if (trailPolyline) {
      this.map.removeLayer(trailPolyline);
    }
    this.memberTrails.delete(peerId);
  }

  addCircleGeofence(id, center, radius, name, color = '#EF4444') {
    const circle = L.circle(center, {
      radius: radius,
      color: color,
      fillColor: color,
      fillOpacity: 0.2,
      weight: 2,
    }).addTo(this.map);

    circle.bindPopup(`
      <div>
        <strong>${name}</strong><br>
        类型: 圆形<br>
        半径: ${radius}米
      </div>
    `);

    this.geofenceLayers.set(id, {
      layer: circle,
      type: 'circle',
      name,
      center,
      radius,
      color,
    });

    return circle;
  }

  addPolygonGeofence(id, vertices, name, color = '#10B981') {
    if (vertices.length < 3) {
      console.error('Polygon requires at least 3 vertices');
      return null;
    }

    const polygon = L.polygon(vertices, {
      color: color,
      fillColor: color,
      fillOpacity: 0.2,
      weight: 2,
    }).addTo(this.map);

    polygon.bindPopup(`
      <div>
        <strong>${name}</strong><br>
        类型: 多边形<br>
        顶点数: ${vertices.length}
      </div>
    `);

    this.geofenceLayers.set(id, {
      layer: polygon,
      type: 'polygon',
      name,
      vertices,
      color,
    });

    return polygon;
  }

  removeGeofence(id) {
    const geofence = this.geofenceLayers.get(id);
    if (geofence) {
      this.map.removeLayer(geofence.layer);
      this.geofenceLayers.delete(id);
    }
  }

  getGeofences() {
    return Array.from(this.geofenceLayers.entries()).map(([id, data]) => ({
      id,
      ...data,
    }));
  }

  setView(center, zoom) {
    this.map.setView(center, zoom || this.defaultZoom);
  }

  fitBounds(positions) {
    if (positions.length === 0) return;

    const bounds = L.latLngBounds(positions);
    this.map.fitBounds(bounds, { padding: [50, 50] });
  }

  getCenter() {
    return this.map.getCenter();
  }

  onMapClick(callback) {
    this.map.on('click', callback);
  }

  disableMapClick() {
    this.map.off('click');
  }

  enablePolygonDrawing(callback) {
    let vertices = [];
    let tempPolygon = null;

    const handleClick = (e) => {
      vertices.push([e.latlng.lat, e.latlng.lng]);

      if (tempPolygon) {
        this.map.removeLayer(tempPolygon);
      }

      if (vertices.length >= 2) {
        tempPolygon = L.polygon(vertices, {
          color: '#3B82F6',
          fillColor: '#3B82F6',
          fillOpacity: 0.3,
          weight: 2,
          dashArray: '5, 5',
        }).addTo(this.map);
      }

      L.circleMarker(e.latlng, {
        radius: 6,
        color: '#3B82F6',
        fillColor: '#3B82F6',
        fillOpacity: 1,
      }).addTo(this.map);
    };

    const handleDoubleClick = (e) => {
      this.map.off('click', handleClick);
      this.map.off('dblclick', handleDoubleClick);

      if (tempPolygon) {
        this.map.removeLayer(tempPolygon);
      }

      if (vertices.length >= 3) {
        callback(vertices);
      }

      this.disablePolygonDrawing();
    };

    this.map.on('click', handleClick);
    this.map.on('dblclick', handleDoubleClick);

    this._polygonDrawingHandlers = { handleClick, handleDoubleClick };
  }

  disablePolygonDrawing() {
    if (this._polygonDrawingHandlers) {
      this.map.off('click', this._polygonDrawingHandlers.handleClick);
      this.map.off('dblclick', this._polygonDrawingHandlers.handleDoubleClick);
      this._polygonDrawingHandlers = null;
    }
  }

  cleanup() {
    if (this.map) {
      this.map.remove();
      this.map = null;
    }
    this.memberMarkers.clear();
    this.memberTrails.clear();
    this.geofenceLayers.clear();
  }
}
