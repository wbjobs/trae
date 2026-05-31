import { RenderParams } from '../types';

export class ControlPanel {
  private onParamsChange: ((params: Partial<RenderParams>) => void) | null = null;

  constructor() {
    this.setupControls();
  }

  private setupControls(): void {
    this.bindSlider('bounces', 'bouncesValue', (v) => ({ maxBounces: v }));
    this.bindSlider('shadowSteps', 'shadowStepsValue', (v) => ({ shadowSteps: v }));
    this.bindSlider('aoStrength', 'aoStrengthValue', (v) => ({ aoStrength: v }));
    this.bindSlider('aoRadius', 'aoRadiusValue', (v) => ({ aoRadius: v }));
    this.bindSlider('exposure', 'exposureValue', (v) => ({ exposure: v }));
    this.bindSlider('resolution', 'resolutionValue', (v) => ({ resolutionScale: v / 100 }), (v) => `${v}%`);
    this.bindSlider('sunX', 'sunXValue', (v) => ({ sunDirection: { x: v, y: 0.8, z: 0.3 } }));
    this.bindSlider('sunY', 'sunYValue', (v) => ({ sunDirection: { x: 0.5, y: v, z: 0.3 } }));
    this.bindSlider('sunZ', 'sunZValue', (v) => ({ sunDirection: { x: 0.5, y: 0.8, z: v } }));
    this.bindSlider('sunIntensity', 'sunIntensityValue', (v) => ({ sunIntensity: v }));
    this.bindSlider('gamma', 'gammaValue', (v) => ({ gamma: v }));
    this.bindSlider('tonemap', 'tonemapValue', (v) => ({ tonemapStrength: v }));
  }

  private bindSlider(
    inputId: string,
    valueId: string,
    paramBuilder: (value: number) => Partial<RenderParams>,
    formatter?: (value: number) => string
  ): void {
    const input = document.getElementById(inputId) as HTMLInputElement;
    const valueSpan = document.getElementById(valueId) as HTMLElement;

    if (!input || !valueSpan) return;

    const updateValue = () => {
      const value = parseFloat(input.value);
      valueSpan.textContent = formatter ? formatter(value) : value.toFixed(1);
      if (this.onParamsChange) {
        this.onParamsChange(paramBuilder(value));
      }
    };

    input.addEventListener('input', updateValue);
    updateValue();
  }

  setOnParamsChange(callback: (params: Partial<RenderParams>) => void): void {
    this.onParamsChange = callback;
  }

  setSunDirection(x: number, y: number, z: number): void {
    const sunX = document.getElementById('sunX') as HTMLInputElement;
    const sunY = document.getElementById('sunY') as HTMLInputElement;
    const sunZ = document.getElementById('sunZ') as HTMLInputElement;
    
    if (sunX) sunX.value = x.toString();
    if (sunY) sunY.value = y.toString();
    if (sunZ) sunZ.value = z.toString();
    
    const sunXValue = document.getElementById('sunXValue');
    const sunYValue = document.getElementById('sunYValue');
    const sunZValue = document.getElementById('sunZValue');
    
    if (sunXValue) sunXValue.textContent = x.toFixed(2);
    if (sunYValue) sunYValue.textContent = y.toFixed(2);
    if (sunZValue) sunZValue.textContent = z.toFixed(2);
  }
}
