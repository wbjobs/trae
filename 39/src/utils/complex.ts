import type { Complex } from '@/types/quantum';

export const complexAdd = (a: Complex, b: Complex): Complex => ({
  real: a.real + b.real,
  imag: a.imag + b.imag,
});

export const complexSub = (a: Complex, b: Complex): Complex => ({
  real: a.real - b.real,
  imag: a.imag - b.imag,
});

export const complexMul = (a: Complex, b: Complex): Complex => ({
  real: a.real * b.real - a.imag * b.imag,
  imag: a.real * b.imag + a.imag * b.real,
});

export const complexMulScalar = (c: Complex, scalar: number): Complex => ({
  real: c.real * scalar,
  imag: c.imag * scalar,
});

export const complexConjugate = (c: Complex): Complex => ({
  real: c.real,
  imag: -c.imag,
});

export const complexMagnitudeSq = (c: Complex): number =>
  c.real * c.real + c.imag * c.imag;

export const complexMagnitude = (c: Complex): number =>
  Math.sqrt(complexMagnitudeSq(c));

export const complexNormalize = (c: Complex): Complex => {
  const mag = complexMagnitude(c);
  if (mag === 0) return { real: 0, imag: 0 };
  return complexMulScalar(c, 1 / mag);
};

export const complexEquals = (a: Complex, b: Complex, epsilon = 1e-10): boolean =>
  Math.abs(a.real - b.real) < epsilon && Math.abs(a.imag - b.imag) < epsilon;

export const ZERO: Complex = { real: 0, imag: 0 };
export const ONE: Complex = { real: 1, imag: 0 };
export const I: Complex = { real: 0, imag: 1 };
