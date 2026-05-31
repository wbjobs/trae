export interface HexagonData {
  hex_id: string;
  count: number;
  avg_speed: number;
  resolution: number;
}

export interface AggregationResponse {
  hexagons: HexagonData[];
  resolution: number;
  total_points: number;
  processing_time_ms: number;
  cache_hit: boolean;
}

export interface HourlyData {
  hour: number;
  hexagons: HexagonData[];
  total_points: number;
}

export interface Batch24hResponse {
  resolution: number;
  hourly_data: Record<number, HourlyData>;
  processing_time_ms: number;
}

export interface StatsResponse {
  total_points: number;
  min_lat: number;
  max_lat: number;
  min_lng: number;
  max_lng: number;
  speed_min: number;
  speed_max: number;
  speed_avg: number;
}

export interface ViewState {
  longitude: number;
  latitude: number;
  zoom: number;
  pitch: number;
  bearing: number;
}

export type ColorMode = 'count' | 'speed';

export interface AnimationState {
  isPlaying: boolean;
  currentHour: number;
  currentMinute: number;
  playbackSpeed: number;
  totalFrames: number;
  currentFrame: number;
}
