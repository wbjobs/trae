export interface Room {
  x: number;
  y: number;
  width: number;
  height: number;
  centerX: number;
  centerY: number;
}

interface BSPNode {
  x: number;
  y: number;
  width: number;
  height: number;
  left?: BSPNode;
  right?: BSPNode;
  room?: Room;
}

export enum TileType {
  WALL = 0,
  FLOOR = 1,
}

export class BSPDungeon {
  public readonly width: number;
  public readonly height: number;
  public tiles: TileType[][];
  public rooms: Room[] = [];

  private readonly minRoomSize = 6;
  private readonly maxRoomSize = 12;

  constructor(width: number, height: number) {
    this.width = width;
    this.height = height;
    this.tiles = this.createWallGrid();
  }

  generate(): void {
    this.tiles = this.createWallGrid();
    this.rooms = [];

    const root: BSPNode = {
      x: 1,
      y: 1,
      width: this.width - 2,
      height: this.height - 2,
    };

    this.splitNode(root, 0);
    this.createRooms(root);
    this.connectRooms(root);
  }

  private createWallGrid(): TileType[][] {
    const grid: TileType[][] = [];
    for (let y = 0; y < this.height; y++) {
      grid[y] = [];
      for (let x = 0; x < this.width; x++) {
        grid[y][x] = TileType.WALL;
      }
    }
    return grid;
  }

  private splitNode(node: BSPNode, depth: number): void {
    if (depth > 6) return;

    const canSplitH = node.height >= this.minRoomSize * 2;
    const canSplitV = node.width >= this.minRoomSize * 2;

    if (!canSplitH && !canSplitV) return;

    let splitHorizontally: boolean;
    if (canSplitH && canSplitV) {
      splitHorizontally = Math.random() > 0.5;
    } else {
      splitHorizontally = canSplitH;
    }

    if (splitHorizontally) {
      const maxSplit = node.height - this.minRoomSize;
      const splitPos = this.minRoomSize + Math.floor(Math.random() * (maxSplit - this.minRoomSize + 1));

      node.left = {
        x: node.x,
        y: node.y,
        width: node.width,
        height: splitPos,
      };
      node.right = {
        x: node.x,
        y: node.y + splitPos,
        width: node.width,
        height: node.height - splitPos,
      };
    } else {
      const maxSplit = node.width - this.minRoomSize;
      const splitPos = this.minRoomSize + Math.floor(Math.random() * (maxSplit - this.minRoomSize + 1));

      node.left = {
        x: node.x,
        y: node.y,
        width: splitPos,
        height: node.height,
      };
      node.right = {
        x: node.x + splitPos,
        y: node.y,
        width: node.width - splitPos,
        height: node.height,
      };
    }

    this.splitNode(node.left, depth + 1);
    this.splitNode(node.right, depth + 1);
  }

  private createRooms(node: BSPNode): void {
    if (node.left && node.right) {
      this.createRooms(node.left);
      this.createRooms(node.right);
    } else {
      const roomWidth = Math.min(
        this.maxRoomSize,
        this.minRoomSize + Math.floor(Math.random() * (node.width - this.minRoomSize))
      );
      const roomHeight = Math.min(
        this.maxRoomSize,
        this.minRoomSize + Math.floor(Math.random() * (node.height - this.minRoomSize))
      );

      const roomX = node.x + Math.floor(Math.random() * (node.width - roomWidth));
      const roomY = node.y + Math.floor(Math.random() * (node.height - roomHeight));

      const room: Room = {
        x: roomX,
        y: roomY,
        width: roomWidth,
        height: roomHeight,
        centerX: Math.floor(roomX + roomWidth / 2),
        centerY: Math.floor(roomY + roomHeight / 2),
      };

      node.room = room;
      this.rooms.push(room);
      this.carveRoom(room);
    }
  }

  private carveRoom(room: Room): void {
    for (let y = room.y; y < room.y + room.height; y++) {
      for (let x = room.x; x < room.x + room.width; x++) {
        if (y >= 0 && y < this.height && x >= 0 && x < this.width) {
          this.tiles[y][x] = TileType.FLOOR;
        }
      }
    }
  }

  private connectRooms(node: BSPNode): void {
    if (node.left && node.right && node.left.room && node.right.room) {
      this.createCorridor(node.left.room, node.right.room);
    }
    if (node.left) this.connectRooms(node.left);
    if (node.right) this.connectRooms(node.right);
  }

  private createCorridor(roomA: Room, roomB: Room): void {
    let x = roomA.centerX;
    let y = roomA.centerY;

    const targetX = roomB.centerX;
    const targetY = roomB.centerY;

    const horizontalFirst = Math.random() > 0.5;

    if (horizontalFirst) {
      this.carveHorizontalCorridor(x, targetX, y);
      this.carveVerticalCorridor(y, targetY, targetX);
    } else {
      this.carveVerticalCorridor(y, targetY, x);
      this.carveHorizontalCorridor(x, targetX, targetY);
    }
  }

  private carveHorizontalCorridor(x1: number, x2: number, y: number): void {
    const start = Math.min(x1, x2);
    const end = Math.max(x1, x2);
    for (let x = start; x <= end; x++) {
      if (y >= 0 && y < this.height && x >= 0 && x < this.width) {
        this.tiles[y][x] = TileType.FLOOR;
      }
    }
  }

  private carveVerticalCorridor(y1: number, y2: number, x: number): void {
    const start = Math.min(y1, y2);
    const end = Math.max(y1, y2);
    for (let y = start; y <= end; y++) {
      if (y >= 0 && y < this.height && x >= 0 && x < this.width) {
        this.tiles[y][x] = TileType.FLOOR;
      }
    }
  }

  isWalkable(x: number, y: number): boolean {
    if (x < 0 || x >= this.width || y < 0 || y >= this.height) return false;
    return this.tiles[y][x] === TileType.FLOOR;
  }

  getRandomRoom(): Room {
    return this.rooms[Math.floor(Math.random() * this.rooms.length)];
  }
}
