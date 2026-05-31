export interface TimeSettings {
  currentTime: number
  timeSpeed: number
  isPaused: boolean
}

export type Season = 'spring' | 'summer' | 'autumn' | 'winter'

export class TimeSystem {
  private _currentTime: number = 12
  private _timeSpeed: number = 0
  private _isPaused: boolean = true
  private _dayCount: number = 0
  private _season: Season = 'summer'
  private _seasonalProgress: number = 0
  
  private _lastDayTime: number = -1

  constructor() {}

  public update(deltaTime: number): void {
    if (this._isPaused || this._timeSpeed <= 0) {
      return
    }

    const hoursPerSecond = this._timeSpeed
    const previousTime = this._currentTime
    
    this._currentTime += deltaTime * hoursPerSecond
    
    if (this._currentTime >= 24) {
      this._currentTime -= 24
      this._dayCount++
      
      this._seasonalProgress += 1
      if (this._seasonalProgress >= 90) {
        this._seasonalProgress = 0
        this._season = this.getNextSeason(this._season)
      }
    }

    if (this._lastDayTime >= 0) {
      const crossedDawn = this._currentTime >= 6 && previousTime < 6
      const crossedDusk = this._currentTime >= 18 && previousTime < 18
      
      if (crossedDawn) {
        this._lastDayTime = 6
      }
      if (crossedDusk) {
        this._lastDayTime = 18
      }
    } else {
      this._lastDayTime = this._currentTime
    }
  }

  private getNextSeason(current: Season): Season {
    const seasons: Season[] = ['spring', 'summer', 'autumn', 'winter']
    const currentIndex = seasons.indexOf(current)
    return seasons[(currentIndex + 1) % 4]
  }

  public getTimeOfDay(): number {
    return this._currentTime
  }

  public setTimeOfDay(time: number): void {
    this._currentTime = ((time % 24) + 24) % 24
  }

  public getTimeSpeed(): number {
    return this._timeSpeed
  }

  public setTimeSpeed(speed: number): void {
    this._timeSpeed = Math.max(0, speed)
  }

  public isPaused(): boolean {
    return this._isPaused
  }

  public setPaused(paused: boolean): void {
    this._isPaused = paused
  }

  public togglePause(): void {
    this._isPaused = !this._isPaused
  }

  public getDayCount(): number {
    return this._dayCount
  }

  public getSeason(): Season {
    return this._season
  }

  public getSeasonalProgress(): number {
    return this._seasonalProgress
  }

  public isDaytime(): boolean {
    return this._currentTime >= 6 && this._currentTime < 18
  }

  public isNighttime(): boolean {
    return !this.isDaytime()
  }

  public getSunAngle(): number {
    const normalizedTime = (this._currentTime - 6) / 12
    return normalizedTime * Math.PI
  }

  public getSunHeight(): number {
    return Math.sin(this.getSunAngle())
  }

  public getTimeString(): string {
    const hours = Math.floor(this._currentTime)
    const minutes = Math.floor((this._currentTime - hours) * 60)
    return `${hours.toString().padStart(2, '0')}:${minutes.toString().padStart(2, '0')}`
  }

  public getDayNightFactor(): number {
    const sunHeight = this.getSunHeight()
    return Math.max(0, Math.min(1, sunHeight))
  }

  public getSettings(): TimeSettings {
    return {
      currentTime: this._currentTime,
      timeSpeed: this._timeSpeed,
      isPaused: this._isPaused
    }
  }

  public setSettings(settings: Partial<TimeSettings>): void {
    if (settings.currentTime !== undefined) {
      this.setTimeOfDay(settings.currentTime)
    }
    if (settings.timeSpeed !== undefined) {
      this.setTimeSpeed(settings.timeSpeed)
    }
    if (settings.isPaused !== undefined) {
      this._isPaused = settings.isPaused
    }
  }
}
