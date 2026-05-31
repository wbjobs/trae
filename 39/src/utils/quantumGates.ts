import type { Complex, GateType } from '@/types/quantum';
import { ONE, ZERO, I } from './complex';

export type GateMatrix = Complex[][];

export const GATE_MATRICES: Record<Exclude<GateType, 'CNOT'>, GateMatrix> = {
  H: [
    [{ real: 1 / Math.SQRT2, imag: 0 }, { real: 1 / Math.SQRT2, imag: 0 }],
    [{ real: 1 / Math.SQRT2, imag: 0 }, { real: -1 / Math.SQRT2, imag: 0 }],
  ],
  X: [
    [ZERO, ONE],
    [ONE, ZERO],
  ],
  Y: [
    [ZERO, { real: 0, imag: -1 }],
    [I, ZERO],
  ],
  Z: [
    [ONE, ZERO],
    [ZERO, { real: -1, imag: 0 }],
  ],
  T: [
    [ONE, ZERO],
    [ZERO, { real: Math.cos(Math.PI / 4), imag: Math.sin(Math.PI / 4) }],
  ],
  S: [
    [ONE, ZERO],
    [ZERO, I],
  ],
  TDG: [
    [ONE, ZERO],
    [ZERO, { real: Math.cos(-Math.PI / 4), imag: Math.sin(-Math.PI / 4) }],
  ],
  SDG: [
    [ONE, ZERO],
    [ZERO, { real: 0, imag: -1 }],
  ],
  I: [
    [ONE, ZERO],
    [ZERO, ONE],
  ],
};

export const multiplyMatrices = (a: GateMatrix, b: GateMatrix): GateMatrix => {
  const n = a.length;
  const m = b[0].length;
  const p = b.length;
  const result: GateMatrix = Array(n)
    .fill(null)
    .map(() =>
      Array(m)
        .fill(null)
        .map(() => ({ real: 0, imag: 0 }))
    );

  for (let i = 0; i < n; i++) {
    for (let j = 0; j < m; j++) {
      for (let k = 0; k < p; k++) {
        const product = {
          real: a[i][k].real * b[k][j].real - a[i][k].imag * b[k][j].imag,
          imag: a[i][k].real * b[k][j].imag + a[i][k].imag * b[k][j].real,
        };
        result[i][j].real += product.real;
        result[i][j].imag += product.imag;
      }
    }
  }
  return result;
};

export const tensorProduct = (a: GateMatrix, b: GateMatrix): GateMatrix => {
  const n = a.length;
  const m = a[0].length;
  const p = b.length;
  const q = b[0].length;
  const result: GateMatrix = Array(n * p)
    .fill(null)
    .map(() =>
      Array(m * q)
        .fill(null)
        .map(() => ({ real: 0, imag: 0 }))
    );

  for (let i = 0; i < n; i++) {
    for (let j = 0; j < m; j++) {
      for (let k = 0; k < p; k++) {
        for (let l = 0; l < q; l++) {
          result[i * p + k][j * q + l] = {
            real: a[i][j].real * b[k][l].real - a[i][j].imag * b[k][l].imag,
            imag: a[i][j].real * b[k][l].imag + a[i][j].imag * b[k][l].real,
          };
        }
      }
    }
  }
  return result;
};

export const applyMatrixToVector = (matrix: GateMatrix, vector: Complex[]): Complex[] => {
  const n = matrix.length;
  const result: Complex[] = Array(n)
    .fill(null)
    .map(() => ({ real: 0, imag: 0 }));

  for (let i = 0; i < n; i++) {
    for (let j = 0; j < n; j++) {
      const product = {
        real: matrix[i][j].real * vector[j].real - matrix[i][j].imag * vector[j].imag,
        imag: matrix[i][j].real * vector[j].imag + matrix[i][j].imag * vector[j].real,
      };
      result[i].real += product.real;
      result[i].imag += product.imag;
    }
  }
  return result;
};

export const createIdentityMatrix = (size: number): GateMatrix => {
  const result: GateMatrix = Array(size)
    .fill(null)
    .map(() =>
      Array(size)
        .fill(null)
        .map(() => ({ real: 0, imag: 0 }))
    );
  for (let i = 0; i < size; i++) {
    result[i][i] = { real: 1, imag: 0 };
  }
  return result;
};
