export function valueToColor(value, minVal, maxVal, colormap = 'viridis') {
  const t = maxVal === minVal ? 0.5 : (value - minVal) / (maxVal - minVal)
  if (colormap === 'viridis') {
    return viridis(t)
  } else if (colormap === 'jet') {
    return jet(t)
  } else if (colormap === 'plasma') {
    return plasma(t)
  }
  return viridis(t)
}

function viridis(t) {
  const c = [
    [0.267004, 0.004874, 0.329415],
    [0.283072, 0.129281, 0.449241],
    [0.262138, 0.242281, 0.520837],
    [0.220057, 0.343307, 0.549413],
    [0.177423, 0.437527, 0.557565],
    [0.143343, 0.522773, 0.556295],
    [0.119512, 0.607464, 0.540218],
    [0.166383, 0.690856, 0.496502],
    [0.319809, 0.770914, 0.411152],
    [0.525776, 0.833491, 0.288127],
    [0.762373, 0.876424, 0.137064],
    [0.993248, 0.906157, 0.143936]
  ]
  const idx = Math.floor(t * (c.length - 1))
  const frac = t * (c.length - 1) - idx
  if (idx >= c.length - 1) {
    return c[c.length - 1]
  }
  return [
    c[idx][0] + frac * (c[idx + 1][0] - c[idx][0]),
    c[idx][1] + frac * (c[idx + 1][1] - c[idx][1]),
    c[idx][2] + frac * (c[idx + 1][2] - c[idx][2])
  ]
}

function jet(t) {
  let r, g, b
  if (t < 0.125) {
    r = 0; g = 0; b = 0.5 + t * 4
  } else if (t < 0.375) {
    r = 0; g = (t - 0.125) * 4; b = 1
  } else if (t < 0.625) {
    r = (t - 0.375) * 4; g = 1; b = 1 - (t - 0.375) * 4
  } else if (t < 0.875) {
    r = 1; g = 1 - (t - 0.625) * 4; b = 0
  } else {
    r = 1 - (t - 0.875) * 4; g = 0; b = 0
  }
  return [r, g, b]
}

function plasma(t) {
  const c = [
    [0.050383, 0.029803, 0.527975],
    [0.229739, 0.063858, 0.653579],
    [0.385082, 0.061679, 0.698329],
    [0.519633, 0.048276, 0.707497],
    [0.641983, 0.035590, 0.689368],
    [0.755465, 0.037980, 0.644867],
    [0.855277, 0.091450, 0.582275],
    [0.935248, 0.172599, 0.506372],
    [0.987240, 0.282958, 0.424880],
    [0.997455, 0.413805, 0.349127],
    [0.977984, 0.559997, 0.292968],
    [0.935003, 0.712869, 0.258793],
    [0.885560, 0.857552, 0.219582],
    [0.839077, 0.968569, 0.228853]
  ]
  const idx = Math.floor(t * (c.length - 1))
  const frac = t * (c.length - 1) - idx
  if (idx >= c.length - 1) {
    return c[c.length - 1]
  }
  return [
    c[idx][0] + frac * (c[idx + 1][0] - c[idx][0]),
    c[idx][1] + frac * (c[idx + 1][1] - c[idx][1]),
    c[idx][2] + frac * (c[idx + 1][2] - c[idx][2])
  ]
}

export function arrayMinMax(arr) {
  let min = Infinity
  let max = -Infinity
  for (let i = 0; i < arr.length; i++) {
    if (arr[i] < min) min = arr[i]
    if (arr[i] > max) max = arr[i]
  }
  return { min, max }
}
