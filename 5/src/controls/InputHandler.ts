import { WeatherType } from '../weather/WeatherSystem'

export interface UIState {
  weather: WeatherType
  timeOfDay: number
  terrainHeight: number
  terrainRoughness: number
  fogDensity: number
  timeSpeed: number
}

export class InputHandler {
  private uiState: UIState = {
    weather: 'sunny',
    timeOfDay: 12,
    terrainHeight: 30,
    terrainRoughness: 4,
    fogDensity: 0.02,
    timeSpeed: 0
  }
  
  private callbacks: {
    onWeatherChange?: (weather: WeatherType) => void
    onTimeChange?: (time: number) => void
    onTimeSpeedChange?: (speed: number) => void
    onTimeTogglePause?: () => void
    onTerrainHeightChange?: (height: number) => void
    onTerrainRoughnessChange?: (roughness: number) => void
    onFogDensityChange?: (density: number) => void
    onRegenerateTerrain?: () => void
  } = {}

  constructor() {
    this.setupUIElements()
  }

  private setupUIElements(): void {
    const weatherSelect = document.getElementById('weather-select') as HTMLSelectElement
    if (weatherSelect) {
      weatherSelect.addEventListener('change', (e) => {
        const value = (e.target as HTMLSelectElement).value as WeatherType
        this.uiState.weather = value
        this.callbacks.onWeatherChange?.(value)
      })
    }

    const timeSlider = document.getElementById('time-slider') as HTMLInputElement
    const timeValue = document.getElementById('time-value') as HTMLSpanElement
    if (timeSlider && timeValue) {
      timeSlider.addEventListener('input', (e) => {
        const value = parseFloat((e.target as HTMLInputElement).value)
        this.uiState.timeOfDay = value
        timeValue.textContent = value.toFixed(1)
        this.callbacks.onTimeChange?.(value)
      })
    }

    const timeSpeedSlider = document.getElementById('time-speed-slider') as HTMLInputElement
    const timeSpeedValue = document.getElementById('time-speed-value') as HTMLSpanElement
    if (timeSpeedSlider && timeSpeedValue) {
      timeSpeedSlider.addEventListener('input', (e) => {
        const value = parseFloat((e.target as HTMLInputElement).value)
        this.uiState.timeSpeed = value
        timeSpeedValue.textContent = value.toFixed(1)
        this.callbacks.onTimeSpeedChange?.(value)
      })
    }

    const pauseBtn = document.getElementById('pause-btn') as HTMLButtonElement
    if (pauseBtn) {
      pauseBtn.addEventListener('click', () => {
        this.callbacks.onTimeTogglePause?.()
        const isPaused = pauseBtn.textContent === '暂停'
        pauseBtn.textContent = isPaused ? '继续' : '暂停'
        pauseBtn.style.background = isPaused ? '#27ae60' : '#e74c3c'
      })
    }

    const heightSlider = document.getElementById('height-slider') as HTMLInputElement
    const heightValue = document.getElementById('height-value') as HTMLSpanElement
    if (heightSlider && heightValue) {
      heightSlider.addEventListener('input', (e) => {
        const value = parseFloat((e.target as HTMLInputElement).value)
        this.uiState.terrainHeight = value
        heightValue.textContent = value.toString()
        this.callbacks.onTerrainHeightChange?.(value)
      })
    }

    const roughnessSlider = document.getElementById('roughness-slider') as HTMLInputElement
    const roughnessValue = document.getElementById('roughness-value') as HTMLSpanElement
    if (roughnessSlider && roughnessValue) {
      roughnessSlider.addEventListener('input', (e) => {
        const value = parseFloat((e.target as HTMLInputElement).value)
        this.uiState.terrainRoughness = value
        roughnessValue.textContent = value.toFixed(1)
        this.callbacks.onTerrainRoughnessChange?.(value)
      })
    }

    const fogSlider = document.getElementById('fog-slider') as HTMLInputElement
    const fogValue = document.getElementById('fog-value') as HTMLSpanElement
    if (fogSlider && fogValue) {
      fogSlider.addEventListener('input', (e) => {
        const value = parseFloat((e.target as HTMLInputElement).value)
        this.uiState.fogDensity = value
        fogValue.textContent = value.toFixed(3)
        this.callbacks.onFogDensityChange?.(value)
      })
    }

    const regenerateBtn = document.getElementById('regenerate-btn') as HTMLButtonElement
    if (regenerateBtn) {
      regenerateBtn.addEventListener('click', () => {
        this.callbacks.onRegenerateTerrain?.()
      })
    }
  }

  public onWeatherChange(callback: (weather: WeatherType) => void): void {
    this.callbacks.onWeatherChange = callback
  }

  public onTimeChange(callback: (time: number) => void): void {
    this.callbacks.onTimeChange = callback
  }

  public onTimeSpeedChange(callback: (speed: number) => void): void {
    this.callbacks.onTimeSpeedChange = callback
  }

  public onTimeTogglePause(callback: () => void): void {
    this.callbacks.onTimeTogglePause = callback
  }

  public onTerrainHeightChange(callback: (height: number) => void): void {
    this.callbacks.onTerrainHeightChange = callback
  }

  public onTerrainRoughnessChange(callback: (roughness: number) => void): void {
    this.callbacks.onTerrainRoughnessChange = callback
  }

  public onFogDensityChange(callback: (density: number) => void): void {
    this.callbacks.onFogDensityChange = callback
  }

  public onRegenerateTerrain(callback: () => void): void {
    this.callbacks.onRegenerateTerrain = callback
  }

  public getState(): UIState {
    return { ...this.uiState }
  }

  public setWeather(weather: WeatherType): void {
    this.uiState.weather = weather
    const weatherSelect = document.getElementById('weather-select') as HTMLSelectElement
    if (weatherSelect) {
      weatherSelect.value = weather
    }
  }

  public setTimeOfDay(time: number): void {
    this.uiState.timeOfDay = time
    const timeSlider = document.getElementById('time-slider') as HTMLInputElement
    const timeValue = document.getElementById('time-value') as HTMLSpanElement
    if (timeSlider) timeSlider.value = time.toString()
    if (timeValue) timeValue.textContent = time.toFixed(1)
  }

  public setTimeSpeed(speed: number): void {
    this.uiState.timeSpeed = speed
    const timeSpeedSlider = document.getElementById('time-speed-slider') as HTMLInputElement
    const timeSpeedValue = document.getElementById('time-speed-value') as HTMLSpanElement
    if (timeSpeedSlider) timeSpeedSlider.value = speed.toString()
    if (timeSpeedValue) timeSpeedValue.textContent = speed.toFixed(1)
  }
}
