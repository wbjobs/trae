import type { Complex } from '@/types/quantum';
import { complexAdd, complexMul, complexMulScalar, ONE, ZERO, complexMagnitudeSq } from './complex';

export interface Tensor {
  data: Complex[][][];
  dims: [number, number, number];
}

export interface MPSState {
  tensors: Tensor[];
  bondDim: number;
  qubitCount: number;
}

const createZeroTensor = (dims: [number, number, number]): Tensor => {
  const [d1, d2, d3] = dims;
  const data: Complex[][][] = [];
  for (let i = 0; i < d1; i++) {
    data[i] = [];
    for (let j = 0; j < d2; j++) {
      data[i][j] = [];
      for (let k = 0; k < d3; k++) {
        data[i][j][k] = { real: 0, imag: 0 };
      }
    }
  }
  return { data, dims };
};

const createIdentityTensor = (d: number): Tensor => {
  const tensor = createZeroTensor([d, d, 1]);
  for (let i = 0; i < d; i++) {
    tensor.data[i][i][0] = { real: 1, imag: 0 };
  }
  return tensor;
};

const contractTensors = (a: Tensor, b: Tensor): Tensor => {
  const [aLeft, aPhys, aRight] = a.dims;
  const [bLeft, bPhys, bRight] = b.dims;
  
  const newTensor = createZeroTensor([aLeft, aPhys * bPhys, bRight]);
  
  for (let i = 0; i < aLeft; i++) {
    for (let j = 0; j < aPhys; j++) {
      for (let k = 0; k < aRight; k++) {
        for (let l = 0; l < bPhys; l++) {
          for (let m = 0; m < bRight; m++) {
            const product = complexMul(a.data[i][j][k], b.data[k][l][m]);
            const idx = j * bPhys + l;
            newTensor.data[i][idx][m] = complexAdd(newTensor.data[i][idx][m], product);
          }
        }
      }
    }
  }
  
  return newTensor;
};

const applySingleQubitGateToTensor = (
  tensor: Tensor,
  gateMatrix: Complex[][]
): Tensor => {
  const [left, phys, right] = tensor.dims;
  const newTensor = createZeroTensor([left, phys, right]);
  
  for (let i = 0; i < left; i++) {
    for (let j = 0; j < 2; j++) {
      for (let k = 0; k < right; k++) {
        for (let l = 0; l < 2; l++) {
          const product = complexMul(gateMatrix[j][l], tensor.data[i][l][k]);
          newTensor.data[i][j][k] = complexAdd(newTensor.data[i][j][k], product);
        }
      }
    }
  }
  
  return newTensor;
};

const applyCNOTToTensors = (
  tensor1: Tensor,
  tensor2: Tensor
): { t1: Tensor; t2: Tensor } => {
  const [l1, p1, r1] = tensor1.dims;
  const [l2, p2, r2] = tensor2.dims;
  
  const newTensor1 = createZeroTensor([l1, p1, r1]);
  const newTensor2 = createZeroTensor([l2, p2, r2]);
  
  for (let i = 0; i < l1; i++) {
    for (let j = 0; j < 2; j++) {
      for (let k = 0; k < r1; k++) {
        if (j === 0) {
          newTensor1.data[i][j][k] = { ...tensor1.data[i][j][k] };
        } else {
          newTensor1.data[i][j][k] = { ...tensor1.data[i][j][k] };
        }
      }
    }
  }
  
  for (let i = 0; i < l2; i++) {
    for (let j = 0; j < 2; j++) {
      for (let k = 0; k < r2; k++) {
        for (let l = 0; l < 2; l++) {
          if (l === 0) {
            if (j === l) {
              newTensor2.data[i][j][k] = complexAdd(
                newTensor2.data[i][j][k],
                tensor2.data[i][l][k]
              );
            }
          } else {
            if (j !== l) {
              newTensor2.data[i][j][k] = complexAdd(
                newTensor2.data[i][j][k],
                tensor2.data[i][l][k]
              );
            }
          }
        }
      }
    }
  }
  
  return { t1: newTensor1, t2: newTensor2 };
};

const createMPSFromStateVector = (stateVector: Complex[], qubitCount: number, bondDim: number): MPSState => {
  const tensors: Tensor[] = [];
  const maxBond = Math.min(bondDim, Math.pow(2, Math.ceil(qubitCount / 2)));
  
  for (let i = 0; i < qubitCount; i++) {
    const leftDim = i === 0 ? 1 : Math.min(maxBond, Math.pow(2, i));
    const rightDim = i === qubitCount - 1 ? 1 : Math.min(maxBond, Math.pow(2, qubitCount - 1 - i));
    
    const tensor = createZeroTensor([leftDim, 2, rightDim]);
    
    for (let j = 0; j < 2; j++) {
      for (let k = 0; k < leftDim; k++) {
        for (let l = 0; l < rightDim; l++) {
          const idx = (k << (qubitCount - i)) | (j << (qubitCount - 1 - i)) | l;
          if (idx < stateVector.length) {
            tensor.data[k][j][l] = { ...stateVector[idx] };
          }
        }
      }
    }
    
    tensors.push(tensor);
  }
  
  return { tensors, bondDim: maxBond, qubitCount };
};

const mpsToStateVector = (mps: MPSState): Complex[] => {
  const dim = 1 << mps.qubitCount;
  const result: Complex[] = Array(dim).fill(null).map(() => ({ real: 0, imag: 0 }));
  
  const recurse = (tensorIdx: number, leftIdx: number, stateIdx: number) => {
    if (tensorIdx === mps.qubitCount) {
      if (leftIdx === 0) {
        result[stateIdx] = { real: 1, imag: 0 };
      }
      return;
    }
    
    const tensor = mps.tensors[tensorIdx];
    for (let physIdx = 0; physIdx < 2; physIdx++) {
      for (let rightIdx = 0; rightIdx < tensor.dims[2]; rightIdx++) {
        const value = tensor.data[leftIdx][physIdx][rightIdx];
        if (complexMagnitudeSq(value) > 1e-15) {
          const subResult: Complex[] = Array(1 << (mps.qubitCount - tensorIdx - 1))
            .fill(null)
            .map(() => ({ real: 0, imag: 0 }));
          
          recurse(tensorIdx + 1, rightIdx, 0);
          
          for (let i = 0; i < subResult.length; i++) {
            const newIdx = (stateIdx << 1) | physIdx;
            if (newIdx < dim) {
              result[newIdx] = complexAdd(
                result[newIdx],
                complexMul(value, subResult[i])
              );
            }
          }
        }
      }
    }
  };
  
  recurse(0, 0, 0);
  return result;
};

export class TensorNetworkSimulator {
  private mps: MPSState;
  private bondDim: number;
  private maxBondDim: number;

  constructor(qubitCount: number, bondDim: number = 32) {
    if (qubitCount < 1 || qubitCount > 30) {
      throw new Error('量子比特数必须在 1 到 30 之间');
    }
    this.bondDim = bondDim;
    this.maxBondDim = Math.min(bondDim, 1024);
    this.mps = this.createInitialMPS(qubitCount);
  }

  private createInitialMPS(qubitCount: number): MPSState {
    const tensors: Tensor[] = [];
    
    for (let i = 0; i < qubitCount; i++) {
      const leftDim = i === 0 ? 1 : Math.min(this.bondDim, 1 << i);
      const rightDim = i === qubitCount - 1 ? 1 : Math.min(this.bondDim, 1 << (qubitCount - 1 - i));
      
      const tensor = createZeroTensor([leftDim, 2, rightDim]);
      
      if (i === 0) {
        tensor.data[0][0][0] = { real: 1, imag: 0 };
      } else if (i === qubitCount - 1) {
        tensor.data[0][0][0] = { real: 1, imag: 0 };
      } else {
        tensor.data[0][0][0] = { real: 1, imag: 0 };
      }
      
      tensors.push(tensor);
    }
    
    return { tensors, bondDim: this.bondDim, qubitCount };
  }

  public reset(): void {
    this.mps = this.createInitialMPS(this.mps.qubitCount);
  }

  public getStateVector(): Complex[] {
    return mpsToStateVector(this.mps);
  }

  public getQubitCount(): number {
    return this.mps.qubitCount;
  }

  public getProbabilities(): number[] {
    const stateVector = this.getStateVector();
    return stateVector.map((c) => complexMagnitudeSq(c));
  }

  public applySingleQubitGate(gateMatrix: Complex[][], targetQubit: number): void {
    if (targetQubit < 0 || targetQubit >= this.mps.qubitCount) {
      throw new Error(`无效的目标量子比特: ${targetQubit}`);
    }
    
    this.mps.tensors[targetQubit] = applySingleQubitGateToTensor(
      this.mps.tensors[targetQubit],
      gateMatrix
    );
  }

  public applyCNOT(controlQubit: number, targetQubit: number): void {
    if (controlQubit === targetQubit) {
      throw new Error('控制比特和目标比特不能相同');
    }
    if (controlQubit < 0 || controlQubit >= this.mps.qubitCount) {
      throw new Error(`无效的控制量子比特: ${controlQubit}`);
    }
    if (targetQubit < 0 || targetQubit >= this.mps.qubitCount) {
      throw new Error(`无效的目标量子比特: ${targetQubit}`);
    }
    
    const [minQubit, maxQubit] = controlQubit < targetQubit 
      ? [controlQubit, targetQubit] 
      : [targetQubit, controlQubit];
    
    const { t1, t2 } = applyCNOTToTensors(
      this.mps.tensors[minQubit],
      this.mps.tensors[maxQubit]
    );
    
    this.mps.tensors[minQubit] = t1;
    this.mps.tensors[maxQubit] = t2;
  }

  public getMemoryUsage(): number {
    let total = 0;
    for (const tensor of this.mps.tensors) {
      const [d1, d2, d3] = tensor.dims;
      total += d1 * d2 * d3 * 16;
    }
    return total;
  }
}
