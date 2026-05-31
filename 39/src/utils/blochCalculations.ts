import type { BlochVector, Complex } from '@/types/quantum';
import { complexMagnitude, complexConjugate, complexMul, complexAdd } from './complex';

export const stateToBlochVector = (alpha: Complex, beta: Complex): BlochVector => {
  const norm = Math.sqrt(
    alpha.real * alpha.real + alpha.imag * alpha.imag +
    beta.real * beta.real + beta.imag * beta.imag
  );

  if (norm === 0) {
    return { x: 0, y: 0, z: 1 };
  }

  const aNorm = { real: alpha.real / norm, imag: alpha.imag / norm };
  const bNorm = { real: beta.real / norm, imag: beta.imag / norm };

  const alphaConjBeta = complexMul(complexConjugate(aNorm), bNorm);
  const betaConjAlpha = complexMul(complexConjugate(bNorm), aNorm);

  const x = 2 * alphaConjBeta.real;
  const y = 2 * alphaConjBeta.imag;
  const z =
    (aNorm.real * aNorm.real + aNorm.imag * aNorm.imag) -
    (bNorm.real * bNorm.real + bNorm.imag * bNorm.imag);

  const vectorNorm = Math.sqrt(x * x + y * y + z * z);
  if (vectorNorm === 0) {
    return { x: 0, y: 0, z: 1 };
  }

  return {
    x: x / vectorNorm,
    y: y / vectorNorm,
    z: z / vectorNorm,
  };
};

export const blochVectorToState = (vector: BlochVector): { alpha: Complex; beta: Complex } => {
  const { x, y, z } = vector;
  const norm = Math.sqrt(x * x + y * y + z * z);

  if (norm === 0) {
    return { alpha: { real: 1, imag: 0 }, beta: { real: 0, imag: 0 } };
  }

  const nx = x / norm;
  const ny = y / norm;
  const nz = z / norm;

  const theta = Math.acos(nz);
  const phi = Math.atan2(ny, nx);

  const alpha = {
    real: Math.cos(theta / 2),
    imag: 0,
  };

  const beta = {
    real: Math.sin(theta / 2) * Math.cos(phi),
    imag: Math.sin(theta / 2) * Math.sin(phi),
  };

  return { alpha, beta };
};

export const formatStateLabel = (stateIndex: number, qubitCount: number): string => {
  return stateIndex.toString(2).padStart(qubitCount, '0');
};

export const formatComplex = (c: Complex): string => {
  if (Math.abs(c.imag) < 1e-10) {
    return c.real.toFixed(3);
  }
  if (Math.abs(c.real) < 1e-10) {
    return `${c.imag >= 0 ? '' : '-'}i${Math.abs(c.imag).toFixed(3)}`;
  }
  const sign = c.imag >= 0 ? '+' : '-';
  return `${c.real.toFixed(3)} ${sign} i${Math.abs(c.imag).toFixed(3)}`;
};

export const formatProbability = (prob: number): string => {
  return (prob * 100).toFixed(2) + '%';
};
