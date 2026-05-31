export const WATERSHED_ZONES = [
  {
    id: 'zone_a',
    name: '上游流域区',
    area: 1250.5,
    stations: ['ST001', 'ST002', 'ST003'],
    color: '#5470c6',
    description: '源头山区，森林覆盖率85%',
    ecologicalFlow: {
      min: 0.8,
      optimal: 2.5,
      max: 15.0
    }
  },
  {
    id: 'zone_b',
    name: '中游干流区',
    area: 2870.3,
    stations: ['ST004', 'ST005', 'ST006', 'ST007'],
    color: '#91cc75',
    description: '丘陵过渡区，农业灌溉区',
    ecologicalFlow: {
      min: 1.5,
      optimal: 5.0,
      max: 30.0
    }
  },
  {
    id: 'zone_c',
    name: '下游平原区',
    area: 4120.8,
    stations: ['ST008', 'ST009', 'ST010'],
    color: '#fac858',
    description: '冲积平原，城市用水区',
    ecologicalFlow: {
      min: 2.0,
      optimal: 8.0,
      max: 50.0
    }
  },
  {
    id: 'zone_d',
    name: '河口三角洲',
    area: 890.2,
    stations: ['ST011', 'ST012'],
    color: '#ee6666',
    description: '湿地保护区，生态敏感区',
    ecologicalFlow: {
      min: 3.0,
      optimal: 12.0,
      max: 80.0
    }
  }
];

export const getZoneById = (id) => WATERSHED_ZONES.find(z => z.id === id);
export const getZoneByStation = (stationId) => WATERSHED_ZONES.find(z => z.stations.includes(stationId));
