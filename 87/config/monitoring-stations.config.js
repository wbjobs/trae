export const MONITORING_STATIONS = [
  { id: 'ST001', name: '青龙峡水文站', zoneId: 'zone_a', type: 'runoff', lat: 34.521, lng: 108.932, elevation: 1250 },
  { id: 'ST002', name: '龙潭沟监测站', zoneId: 'zone_a', type: 'multi', lat: 34.567, lng: 108.891, elevation: 1180 },
  { id: 'ST003', name: '杨家坪水位站', zoneId: 'zone_a', type: 'water_level', lat: 34.612, lng: 108.845, elevation: 1050 },
  { id: 'ST004', name: '王家河控制站', zoneId: 'zone_b', type: 'runoff', lat: 34.678, lng: 108.789, elevation: 890 },
  { id: 'ST005', name: '李家湾流量站', zoneId: 'zone_b', type: 'runoff', lat: 34.723, lng: 108.712, elevation: 720 },
  { id: 'ST006', name: '赵家渡水文站', zoneId: 'zone_b', type: 'multi', lat: 34.789, lng: 108.654, elevation: 610 },
  { id: 'ST007', name: '孙家湾监测站', zoneId: 'zone_b', type: 'water_quality', lat: 34.834, lng: 108.598, elevation: 540 },
  { id: 'ST008', name: '周家村控制站', zoneId: 'zone_c', type: 'runoff', lat: 34.891, lng: 108.523, elevation: 420 },
  { id: 'ST009', name: '吴庄水位站', zoneId: 'zone_c', type: 'water_level', lat: 34.945, lng: 108.467, elevation: 350 },
  { id: 'ST010', name: '郑家河口水文站', zoneId: 'zone_c', type: 'multi', lat: 35.012, lng: 108.398, elevation: 280 },
  { id: 'ST011', name: '冯家港监测站', zoneId: 'zone_d', type: 'runoff', lat: 35.067, lng: 108.321, elevation: 180 },
  { id: 'ST012', name: '河口生态站', zoneId: 'zone_d', type: 'ecology', lat: 35.123, lng: 108.256, elevation: 85 }
];

export const getStationById = (id) => MONITORING_STATIONS.find(s => s.id === id);
export const getStationsByZone = (zoneId) => MONITORING_STATIONS.filter(s => s.zoneId === zoneId);
