import { AggregationResponse, StatsResponse, HexagonData, HourlyData, Batch24hResponse } from './types';

const API_BASE_URL = import.meta.env.VITE_API_URL || '/api';

export async function fetchAggregation(
  resolution: number,
  bbox?: number[],
  parentHex?: string,
  useCache: boolean = true
): Promise<AggregationResponse> {
  const params = new URLSearchParams({
    resolution: resolution.toString(),
    use_cache: useCache.toString(),
  });

  if (bbox && bbox.length === 4) {
    params.append('min_lng', bbox[0].toString());
    params.append('min_lat', bbox[1].toString());
    params.append('max_lng', bbox[2].toString());
    params.append('max_lat', bbox[3].toString());
  }

  if (parentHex) {
    params.append('parent_hex', parentHex);
  }

  const response = await fetch(`${API_BASE_URL}/aggregate/${resolution}?${params.toString()}`);
  
  if (!response.ok) {
    throw new Error(`Failed to fetch aggregation: ${response.statusText}`);
  }

  return response.json();
}

export async function fetchTimeRangeAggregation(
  resolution: number,
  startHour: number,
  endHour: number,
  bbox?: number[],
  parentHex?: string
): Promise<AggregationResponse> {
  const response = await fetch(`${API_BASE_URL}/aggregate/time`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({
      resolution,
      start_hour: startHour,
      end_hour: endHour,
      bbox,
      parent_hex: parentHex,
    }),
  });

  if (!response.ok) {
    throw new Error(`Failed to fetch time range aggregation: ${response.statusText}`);
  }

  return response.json();
}

export async function fetchInterpolatedAggregation(
  resolution: number,
  hourStart: number,
  hourEnd: number,
  fraction: number,
  bbox?: number[]
): Promise<AggregationResponse> {
  const response = await fetch(`${API_BASE_URL}/aggregate/interpolate`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({
      resolution,
      hour_start: hourStart,
      hour_end: hourEnd,
      fraction,
      bbox,
    }),
  });

  if (!response.ok) {
    throw new Error(`Failed to fetch interpolated aggregation: ${response.statusText}`);
  }

  return response.json();
}

export async function fetch24hAggregation(
  resolution: number,
  bbox?: number[],
  parentHex?: string
): Promise<Batch24hResponse> {
  const response = await fetch(`${API_BASE_URL}/aggregate/24h`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({
      resolution,
      bbox,
      parent_hex: parentHex,
    }),
  });

  if (!response.ok) {
    throw new Error(`Failed to fetch 24h aggregation: ${response.statusText}`);
  }

  return response.json();
}

export async function fetchDrillDown(
  parentHexId: string,
  targetResolution: number,
  bbox?: number[],
  useCache: boolean = true
): Promise<AggregationResponse> {
  const response = await fetch(`${API_BASE_URL}/drilldown`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({
      parent_hex_id: parentHexId,
      target_resolution: targetResolution,
      bbox,
      use_cache: useCache,
    }),
  });

  if (!response.ok) {
    const error = await response.json();
    throw new Error(error.detail || `Failed to drill down: ${response.statusText}`);
  }

  return response.json();
}

export async function fetchStats(): Promise<StatsResponse> {
  const response = await fetch(`${API_BASE_URL}/stats`);
  
  if (!response.ok) {
    throw new Error(`Failed to fetch stats: ${response.statusText}`);
  }

  return response.json();
}

export async function clearCache(): Promise<void> {
  const response = await fetch(`${API_BASE_URL}/cache/clear`, {
    method: 'POST',
  });

  if (!response.ok) {
    throw new Error(`Failed to clear cache: ${response.statusText}`);
  }
}

export async function reloadData(): Promise<void> {
  const response = await fetch(`${API_BASE_URL}/data/reload`, {
    method: 'POST',
  });

  if (!response.ok) {
    throw new Error(`Failed to reload data: ${response.statusText}`);
  }
}

export function getHexagonCenter(hexId: string): [number, number] {
  return [0, 0];
}
