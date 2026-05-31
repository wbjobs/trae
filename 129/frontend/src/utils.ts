export const COLOR_SCALES = {
  count: [
    [158, 1, 66],
    [213, 62, 79],
    [244, 109, 67],
    [253, 174, 97],
    [254, 224, 139],
    [230, 245, 152],
    [171, 221, 164],
    [102, 194, 165],
    [50, 136, 189],
    [94, 79, 162],
  ],
  speed: [
    [215, 25, 28],
    [253, 174, 97],
    [255, 255, 191],
    [171, 221, 164],
    [43, 131, 186],
  ],
};

export function interpolateColor(value: number, min: number, max: number, colorScale: number[][]): [number, number, number] {
  if (max <= min) return colorScale[0] as [number, number, number];
  
  const normalized = Math.max(0, Math.min(1, (value - min) / (max - min)));
  const index = normalized * (colorScale.length - 1);
  const lowerIndex = Math.floor(index);
  const upperIndex = Math.min(lowerIndex + 1, colorScale.length - 1);
  const t = index - lowerIndex;
  
  const lower = colorScale[lowerIndex];
  const upper = colorScale[upperIndex];
  
  return [
    Math.round(lower[0] + (upper[0] - lower[0]) * t),
    Math.round(lower[1] + (upper[1] - lower[1]) * t),
    Math.round(lower[2] + (upper[2] - lower[2]) * t),
  ];
}

export function getCountColor(count: number, minCount: number, maxCount: number): [number, number, number, number] {
  const [r, g, b] = interpolateColor(count, minCount, maxCount, COLOR_SCALES.count);
  return [r, g, b, 200];
}

export function getSpeedColor(speed: number, minSpeed: number, maxSpeed: number): [number, number, number, number] {
  const [r, g, b] = interpolateColor(speed, minSpeed, maxSpeed, COLOR_SCALES.speed);
  return [r, g, b, 200];
}

export function formatNumber(num: number): string {
  if (num >= 1000000) return (num / 1000000).toFixed(1) + 'M';
  if (num >= 1000) return (num / 1000).toFixed(1) + 'K';
  return num.toString();
}
