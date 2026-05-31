class AStar {
    constructor(gridWidth, gridHeight, cellSize) {
        this.gridWidth = gridWidth;
        this.gridHeight = gridHeight;
        this.cellSize = cellSize;
        this.cols = Math.floor(gridWidth / cellSize);
        this.rows = Math.floor(gridHeight / cellSize);
        this.grid = this.createGrid();
    }

    createGrid() {
        const grid = [];
        for (let y = 0; y < this.rows; y++) {
            grid[y] = [];
            for (let x = 0; x < this.cols; x++) {
                grid[y][x] = {
                    x: x,
                    y: y,
                    walkable: true,
                    g: 0,
                    h: 0,
                    f: 0,
                    parent: null
                };
            }
        }
        return grid;
    }

    setObstacle(worldX, worldY, radius) {
        const centerCol = Math.floor(worldX / this.cellSize);
        const centerRow = Math.floor(worldY / this.cellSize);
        const obstacleRadius = Math.ceil(radius / this.cellSize);

        for (let dy = -obstacleRadius; dy <= obstacleRadius; dy++) {
            for (let dx = -obstacleRadius; dx <= obstacleRadius; dx++) {
                const col = centerCol + dx;
                const row = centerRow + dy;
                if (this.isValidCell(col, row)) {
                    const dist = Math.sqrt(dx * dx + dy * dy);
                    if (dist <= obstacleRadius) {
                        this.grid[row][col].walkable = false;
                    }
                }
            }
        }
    }

    isValidCell(col, row) {
        return col >= 0 && col < this.cols && row >= 0 && row < this.rows;
    }

    findPath(startX, startY, endX, endY) {
        const startCol = Math.floor(startX / this.cellSize);
        const startRow = Math.floor(startY / this.cellSize);
        const endCol = Math.floor(endX / this.cellSize);
        const endRow = Math.floor(endY / this.cellSize);

        if (!this.isValidCell(startCol, startRow) || !this.isValidCell(endCol, endRow)) {
            return [];
        }

        const startNode = this.grid[startRow][startCol];
        const endNode = this.grid[endRow][endCol];

        if (!startNode.walkable || !endNode.walkable) {
            return [];
        }

        this.resetGrid();

        const openSet = [startNode];
        const closedSet = new Set();

        startNode.g = 0;
        startNode.h = this.heuristic(startNode, endNode);
        startNode.f = startNode.g + startNode.h;

        while (openSet.length > 0) {
            let currentIndex = 0;
            for (let i = 1; i < openSet.length; i++) {
                if (openSet[i].f < openSet[currentIndex].f) {
                    currentIndex = i;
                }
            }

            const current = openSet[currentIndex];

            if (current === endNode) {
                return this.reconstructPath(current);
            }

            openSet.splice(currentIndex, 1);
            closedSet.add(current);

            const neighbors = this.getNeighbors(current);

            for (const neighbor of neighbors) {
                if (closedSet.has(neighbor) || !neighbor.walkable) {
                    continue;
                }

                const tentativeG = current.g + this.getDistance(current, neighbor);

                if (!openSet.includes(neighbor)) {
                    openSet.push(neighbor);
                } else if (tentativeG >= neighbor.g) {
                    continue;
                }

                neighbor.parent = current;
                neighbor.g = tentativeG;
                neighbor.h = this.heuristic(neighbor, endNode);
                neighbor.f = neighbor.g + neighbor.h;
            }
        }

        return [];
    }

    getNeighbors(node) {
        const neighbors = [];
        const directions = [
            { x: 0, y: -1 },
            { x: 1, y: 0 },
            { x: 0, y: 1 },
            { x: -1, y: 0 },
            { x: 1, y: -1 },
            { x: 1, y: 1 },
            { x: -1, y: 1 },
            { x: -1, y: -1 }
        ];

        for (const dir of directions) {
            const col = node.x + dir.x;
            const row = node.y + dir.y;
            if (this.isValidCell(col, row)) {
                neighbors.push(this.grid[row][col]);
            }
        }

        return neighbors;
    }

    getDistance(a, b) {
        const dx = Math.abs(a.x - b.x);
        const dy = Math.abs(a.y - b.y);
        if (dx > dy) {
            return 1.414 * dy + 1 * (dx - dy);
        }
        return 1.414 * dx + 1 * (dy - dx);
    }

    heuristic(a, b) {
        const dx = Math.abs(a.x - b.x);
        const dy = Math.abs(a.y - b.y);
        return Math.sqrt(dx * dx + dy * dy);
    }

    reconstructPath(endNode) {
        const path = [];
        let current = endNode;
        while (current) {
            path.unshift({
                x: current.x * this.cellSize + this.cellSize / 2,
                y: current.y * this.cellSize + this.cellSize / 2
            });
            current = current.parent;
        }
        return path;
    }

    resetGrid() {
        for (let y = 0; y < this.rows; y++) {
            for (let x = 0; x < this.cols; x++) {
                this.grid[y][x].g = 0;
                this.grid[y][x].h = 0;
                this.grid[y][x].f = 0;
                this.grid[y][x].parent = null;
            }
        }
    }

    drawDebug(ctx) {
        for (let y = 0; y < this.rows; y++) {
            for (let x = 0; x < this.cols; x++) {
                const cell = this.grid[y][x];
                ctx.strokeStyle = 'rgba(255, 255, 255, 0.1)';
                ctx.lineWidth = 1;
                ctx.strokeRect(
                    x * this.cellSize,
                    y * this.cellSize,
                    this.cellSize,
                    this.cellSize
                );

                if (!cell.walkable) {
                    ctx.fillStyle = 'rgba(255, 0, 0, 0.2)';
                    ctx.fillRect(
                        x * this.cellSize,
                        y * this.cellSize,
                        this.cellSize,
                        this.cellSize
                    );
                }
            }
        }
    }
}

class PathSmoother {
    static smoothPath(path, iterations = 2) {
        if (path.length < 3) return path;

        let smoothPath = [...path];

        for (let iter = 0; iter < iterations; iter++) {
            const newPath = [smoothPath[0]];

            for (let i = 1; i < smoothPath.length - 1; i++) {
                const prev = newPath[newPath.length - 1];
                const curr = smoothPath[i];
                const next = smoothPath[i + 1];

                const newX = (prev.x + curr.x + next.x) / 3;
                const newY = (prev.y + curr.y + next.y) / 3;

                newPath.push({ x: newX, y: newY });
            }

            newPath.push(smoothPath[smoothPath.length - 1]);
            smoothPath = newPath;
        }

        return smoothPath;
    }

    static getPointOnPath(path, distance) {
        let accumulatedDist = 0;

        for (let i = 0; i < path.length - 1; i++) {
            const start = path[i];
            const end = path[i + 1];
            const segmentDist = Math.hypot(end.x - start.x, end.y - start.y);

            if (accumulatedDist + segmentDist >= distance) {
                const t = (distance - accumulatedDist) / segmentDist;
                return {
                    x: start.x + (end.x - start.x) * t,
                    y: start.y + (end.y - start.y) * t,
                    angle: Math.atan2(end.y - start.y, end.x - start.x)
                };
            }

            accumulatedDist += segmentDist;
        }

        const lastPoint = path[path.length - 1];
        const secondLast = path[path.length - 2];
        return {
            x: lastPoint.x,
            y: lastPoint.y,
            angle: Math.atan2(lastPoint.y - secondLast.y, lastPoint.x - secondLast.x)
        };
    }

    static getPathLength(path) {
        let length = 0;
        for (let i = 0; i < path.length - 1; i++) {
            length += Math.hypot(
                path[i + 1].x - path[i].x,
                path[i + 1].y - path[i].y
            );
        }
        return length;
    }
}
