export class GPUDeviceManager {
  private static instance: GPUDeviceManager | null = null
  
  public adapter!: GPUAdapter
  public device!: GPUDevice
  public context!: GPUCanvasContext
  public canvasFormat!: GPUTextureFormat
  
  private constructor() {}
  
  public static getInstance(): GPUDeviceManager {
    if (!GPUDeviceManager.instance) {
      GPUDeviceManager.instance = new GPUDeviceManager()
    }
    return GPUDeviceManager.instance
  }
  
  public async init(canvas: HTMLCanvasElement): Promise<void> {
    if (!navigator.gpu) {
      throw new Error('WebGPU not supported')
    }
    
    this.adapter = (await navigator.gpu.requestAdapter())!
    if (!this.adapter) {
      throw new Error('No GPU adapter found')
    }
    
    this.device = await this.adapter.requestDevice()
    this.context = canvas.getContext('webgpu')!
    this.canvasFormat = navigator.gpu.getPreferredCanvasFormat()
    
    this.context.configure({
      device: this.device,
      format: this.canvasFormat,
      alphaMode: 'premultiplied'
    })
    
    this.device.lost.then((info) => {
      console.error(`GPU device lost: ${info.message}`)
    })
  }
  
  public createBuffer(
    size: number, 
    usage: GPUBufferUsageFlags, 
    mappedAtCreation?: boolean
  ): GPUBuffer {
    return this.device.createBuffer({ size, usage, mappedAtCreation })
  }
  
  public createShaderModule(code: string): GPUShaderModule {
    return this.device.createShaderModule({ code })
  }
  
  public getCurrentTexture(): GPUTexture {
    return this.context.getCurrentTexture()
  }
  
  public queue(): GPUQueue {
    return this.device.queue
  }
}
