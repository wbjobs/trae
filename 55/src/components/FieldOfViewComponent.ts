export class FieldOfViewComponent {
  constructor(
    public radius: number,
    public visibleTiles: Set<string> = new Set(),
    public exploredTiles: Set<string> = new Set()
  ) {}

  isVisible(x: number, y: number): boolean {
    return this.visibleTiles.has(`${x},${y}`);
  }

  isExplored(x: number, y: number): boolean {
    return this.exploredTiles.has(`${x},${y}`);
  }

  addVisible(x: number, y: number): void {
    const key = `${x},${y}`;
    this.visibleTiles.add(key);
    this.exploredTiles.add(key);
  }

  clearVisible(): void {
    this.visibleTiles.clear();
  }
}
