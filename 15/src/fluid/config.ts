export const FluidConfig = {
  maxParticles: 12000,
  particleRadius: 0.015,
  restDensity: 1000.0,
  viscosityCoeff: 0.08,
  boundaryDamping: 0.3,
  smoothingRadius: 0.04,
  particleMass: 0.02,
  gravity: 9.8,
  stiffness: 3.0,
  maxCorrections: 3,
  densityEpsilon: 0.001
} as const

export const SimConfig = {
  gridSize: 0.04,
  bucketCount: 64,
  timeStep: 0.016,
  boundaryMin: [-1.0, -1.0, -1.0],
  boundaryMax: [1.0, 1.0, 1.0]
} as const

export const HeatConfig = {
  thermalConductivity: 0.5,
  specificHeat: 4186.0,
  referenceTemp: 293.15,
  tempGradientThreshold: 5.0,
  maxRefinementLevel: 2,
  maxHistorySamples: 1024,
  sourceTemp: 373.15,
  sinkTemp: 273.15
} as const

export type Vec3 = [number, number, number]
