class SimplexNoise {
  private permutation: number[]
  
  constructor(seed: number = Math.random()) {
    this.permutation = this.generatePermutation(seed)
  }
  
  private generatePermutation(seed: number): number[] {
    const p: number[] = []
    for (let i = 0; i < 256; i++) {
      p[i] = i
    }
    
    let s = seed
    for (let i = 255; i > 0; i--) {
      s = (s * 16807) % 2147483647
      const j = s % (i + 1)
      const temp = p[i]
      p[i] = p[j]
      p[j] = temp
    }
    
    const permutation: number[] = []
    for (let i = 0; i < 512; i++) {
      permutation[i] = p[i & 255]
    }
    
    return permutation
  }
  
  private fade(t: number): number {
    return t * t * t * (t * (t * 6 - 15) + 10)
  }
  
  private lerp(a: number, b: number, t: number): number {
    return a + t * (b - a)
  }
  
  private grad(hash: number, x: number, y: number): number {
    const h = hash & 7
    const u = h < 4 ? x : y
    const v = h < 4 ? y : x
    return ((h & 1) === 0 ? u : -u) + ((h & 2) === 0 ? v : -v)
  }
  
  noise2D(x: number, y: number): number {
    const X = Math.floor(x) & 255
    const Y = Math.floor(y) & 255
    
    x -= Math.floor(x)
    y -= Math.floor(y)
    
    const u = this.fade(x)
    const v = this.fade(y)
    
    const A = this.permutation[X] + Y
    const B = this.permutation[X + 1] + Y
    
    return this.lerp(
      this.lerp(
        this.grad(this.permutation[A], x, y),
        this.grad(this.permutation[B], x - 1, y),
        u
      ),
      this.lerp(
        this.grad(this.permutation[A + 1], x, y - 1),
        this.grad(this.permutation[B + 1], x - 1, y - 1),
        u
      ),
      v
    )
  }
  
  fbm(x: number, y: number, octaves: number = 4, persistence: number = 0.5, lacunarity: number = 2): number {
    let value = 0
    let amplitude = 1
    let frequency = 1
    let maxValue = 0
    
    for (let i = 0; i < octaves; i++) {
      value += amplitude * this.noise2D(x * frequency, y * frequency)
      maxValue += amplitude
      amplitude *= persistence
      frequency *= lacunarity
    }
    
    return value / maxValue
  }
}

export { SimplexNoise }
