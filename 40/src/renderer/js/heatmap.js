export class HeatmapManager {
  constructor(mapManager) {
    this.mapManager = mapManager;
    this.locationHistory = new Map();
    this.heatmapLayer = null;
    this.isVisible = false;
    this.currentTimeRange = null;
    this.kernelBandwidth = 0.001;
    this.gridSize = 0.0005;
    this.maxPoints = 5000;
  }

  addLocation(peerId, latitude, longitude, timestamp) {
    if (!this.locationHistory.has(peerId)) {
      this.locationHistory.set(peerId, []);
    }

    const history = this.locationHistory.get(peerId);
    history.push({
      latitude,
      longitude,
      timestamp,
      hour: new Date(timestamp).getHours(),
      day: this.getDayOfYear(new Date(timestamp))
    });

    if (history.length > this.maxPoints) {
      history.shift();
    }
  }

  getDayOfYear(date) {
    const start = new Date(date.getFullYear(), 0, 0);
    const diff = date - start;
    const oneDay = 1000 * 60 * 60 * 24;
    return Math.floor(diff / oneDay);
  }

  getAllLocations(filterOptions = {}) {
    const allLocations = [];

    for (const [peerId, locations] of this.locationHistory) {
      let filtered = locations;

      if (filterOptions.hour !== undefined) {
        filtered = filtered.filter(l => l.hour === filterOptions.hour);
      }

      if (filterOptions.day !== undefined) {
        filtered = filtered.filter(l => l.day === filterOptions.day);
      }

      if (filterOptions.timeRange && filterOptions.timeRange.start && filterOptions.timeRange.end) {
        filtered = filtered.filter(l => 
          l.timestamp >= filterOptions.timeRange.start && 
          l.timestamp <= filterOptions.timeRange.end
        );
      }

      allLocations.push(...filtered.map(l => ({
        ...l,
        peerId
      })));
    }

    return allLocations;
  }

  gaussianKernel(distance, bandwidth) {
    return Math.exp(-0.5 * Math.pow(distance / bandwidth, 2)) / (bandwidth * Math.sqrt(2 * Math.PI));
  }

  haversineDistance(lat1, lng1, lat2, lng2) {
    const R = 6371000;
    const dLat = this.toRad(lat2 - lat1);
    const dLng = this.toRad(lng2 - lng1);
    const a = Math.sin(dLat / 2) * Math.sin(dLat / 2) +
              Math.cos(this.toRad(lat1)) * Math.cos(this.toRad(lat2)) *
              Math.sin(dLng / 2) * Math.sin(dLng / 2);
    const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
    return R * c;
  }

  toRad(deg) {
    return deg * (Math.PI / 180);
  }

  estimateDensity(locations, bandwidth, gridSize) {
    if (locations.length === 0) return [];

    const bounds = this.calculateBounds(locations);
    const heatmapData = [];

    for (let lat = bounds.minLat; lat <= bounds.maxLat; lat += gridSize) {
      for (let lng = bounds.minLng; lng <= bounds.maxLng; lng += gridSize) {
        let density = 0;

        for (const loc of locations) {
          const distance = this.haversineDistance(lat, lng, loc.latitude, loc.longitude);
          density += this.gaussianKernel(distance, bandwidth * 1000);
        }

        if (density > 0.001) {
          heatmapData.push({
            lat,
            lng,
            density,
            weight: density
          });
        }
      }
    }

    return heatmapData;
  }

  calculateBounds(locations) {
    if (locations.length === 0) {
      return {
        minLat: 39.9,
        maxLat: 40.0,
        minLng: 116.3,
        maxLng: 116.5
      };
    }

    let minLat = Infinity, maxLat = -Infinity;
    let minLng = Infinity, maxLng = -Infinity;

    for (const loc of locations) {
      minLat = Math.min(minLat, loc.latitude);
      maxLat = Math.max(maxLat, loc.latitude);
      minLng = Math.min(minLng, loc.longitude);
      maxLng = Math.max(maxLng, loc.longitude);
    }

    const padding = 0.005;
    return {
      minLat: minLat - padding,
      maxLat: maxLat + padding,
      minLng: minLng - padding,
      maxLng: maxLng + padding
    };
  }

  createHeatmapLayer(data) {
    if (this.heatmapLayer) {
      this.mapManager.map.removeLayer(this.heatmapLayer);
    }

    if (!data || data.length === 0) {
      return;
    }

    const maxDensity = Math.max(...data.map(d => d.density));

    const gradient = {
      0.0: 'transparent',
      0.1: 'rgba(255, 255, 178, 0.3)',
      0.2: 'rgba(254, 217, 118, 0.5)',
      0.3: 'rgba(254, 178, 76, 0.6)',
      0.4: 'rgba(253, 141, 60, 0.7)',
      0.5: 'rgba(252, 78, 42, 0.8)',
      0.6: 'rgba(227, 26, 28, 0.85)',
      0.7: 'rgba(189, 0, 38, 0.9)',
      0.8: 'rgba(128, 0, 38, 0.95)',
      1.0: 'rgba(128, 0, 38, 1)'
    };

    const heatmapLayer = L.heatLayer(data.map(d => [d.lat, d.lng, d.density / maxDensity]), {
      radius: 25,
      gradient: gradient,
      opacity: 0.8,
      maxOpacity: 0.9
    });

    this.heatmapLayer = heatmapLayer;
    return heatmapLayer;
  }

  showHeatmap(filterOptions = {}) {
    const locations = this.getAllLocations(filterOptions);
    
    if (locations.length === 0) {
      console.warn('No locations available for heatmap');
      return;
    }

    const densityData = this.estimateDensity(
      locations,
      this.kernelBandwidth,
      this.gridSize
    );

    const layer = this.createHeatmapLayer(densityData);
    if (layer) {
      layer.addTo(this.mapManager.map);
      this.isVisible = true;
    }
  }

  hideHeatmap() {
    if (this.heatmapLayer) {
      this.mapManager.map.removeLayer(this.heatmapLayer);
      this.heatmapLayer = null;
    }
    this.isVisible = false;
  }

  toggleHeatmap() {
    if (this.isVisible) {
      this.hideHeatmap();
    } else {
      this.showHeatmap();
    }
    return this.isVisible;
  }

  getHotspots(threshold = 0.7) {
    const locations = this.getAllLocations();
    if (locations.length === 0) return [];

    const densityData = this.estimateDensity(
      locations,
      this.kernelBandwidth,
      this.gridSize
    );

    const maxDensity = Math.max(...densityData.map(d => d.density));
    const thresholdValue = maxDensity * threshold;

    const hotspots = densityData
      .filter(d => d.density >= thresholdValue)
      .sort((a, b) => b.density - a.density)
      .slice(0, 10)
      .map((d, index) => ({
        id: `hotspot_${index + 1}`,
        latitude: d.lat,
        longitude: d.lng,
        density: d.density,
        intensity: Math.round((d.density / maxDensity) * 100),
        rank: index + 1
      }));

    return hotspots;
  }

  exportGeoJSON(filterOptions = {}) {
    const locations = this.getAllLocations(filterOptions);
    
    const featureCollection = {
      type: 'FeatureCollection',
      features: [],
      metadata: {
        generatedAt: Date.now(),
        totalPoints: locations.length,
        filterOptions: filterOptions
      }
    };

    locations.forEach((loc, index) => {
      featureCollection.features.push({
        type: 'Feature',
        id: index,
        geometry: {
          type: 'Point',
          coordinates: [loc.longitude, loc.latitude]
        },
        properties: {
          peerId: loc.peerId,
          timestamp: loc.timestamp,
          hour: loc.hour,
          day: loc.day,
          datetime: new Date(loc.timestamp).toISOString()
        }
      });
    });

    return JSON.stringify(featureCollection, null, 2);
  }

  exportHeatmapGeoJSON(filterOptions = {}) {
    const locations = this.getAllLocations(filterOptions);
    const densityData = this.estimateDensity(
      locations,
      this.kernelBandwidth,
      this.gridSize
    );

    const maxDensity = Math.max(...densityData.map(d => d.density));

    const featureCollection = {
      type: 'FeatureCollection',
      features: [],
      metadata: {
        generatedAt: Date.now(),
        bandwidth: this.kernelBandwidth,
        gridSize: this.gridSize,
        totalPoints: locations.length,
        filterOptions: filterOptions
      }
    };

    densityData.forEach((d, index) => {
      featureCollection.features.push({
        type: 'Feature',
        id: index,
        geometry: {
          type: 'Point',
          coordinates: [d.lng, d.lat]
        },
        properties: {
          density: d.density,
          normalizedDensity: d.density / maxDensity,
          intensity: Math.round((d.density / maxDensity) * 100)
        }
      });
    });

    return JSON.stringify(featureCollection, null, 2);
  }

  getStatistics() {
    const allLocations = this.getAllLocations();
    
    const stats = {
      totalPoints: allLocations.length,
      uniquePeers: this.locationHistory.size,
      timeRange: null,
      hourlyDistribution: new Array(24).fill(0),
      dailyDistribution: {}
    };

    if (allLocations.length > 0) {
      const timestamps = allLocations.map(l => l.timestamp);
      stats.timeRange = {
        start: Math.min(...timestamps),
        end: Math.max(...timestamps),
        duration: Math.max(...timestamps) - Math.min(...timestamps)
      };

      for (const loc of allLocations) {
        stats.hourlyDistribution[loc.hour]++;
        
        const dateKey = new Date(loc.timestamp).toDateString();
        stats.dailyDistribution[dateKey] = (stats.dailyDistribution[dateKey] || 0) + 1;
      }
    }

    return stats;
  }

  clearHistory() {
    this.locationHistory.clear();
    this.hideHeatmap();
  }
}
