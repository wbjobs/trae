"""
地形系统定义
"""

from typing import Dict, List, Tuple
import random
from .constants import TerrainType, TERRAIN_BONUSES, GRID_SIZE


class TerrainGrid:
    def __init__(self, size: int = GRID_SIZE):
        self.size = size
        self.grid: List[List[TerrainType]] = self._generate_grid()

    def _generate_grid(self) -> List[List[TerrainType]]:
        grid = []
        for _ in range(self.size):
            row = []
            for _ in range(self.size):
                roll = random.random()
                if roll < 0.6:
                    row.append(TerrainType.PLAIN)
                elif roll < 0.8:
                    row.append(TerrainType.FOREST)
                elif roll < 0.95:
                    row.append(TerrainType.MOUNTAIN)
                else:
                    row.append(TerrainType.WATER)
            grid.append(row)
        return grid

    def get_terrain(self, position: Tuple[int, int]) -> TerrainType:
        x, y = position
        if 0 <= x < self.size and 0 <= y < self.size:
            return self.grid[x][y]
        return TerrainType.PLAIN

    def get_bonuses(self, position: Tuple[int, int]) -> Dict[str, float]:
        terrain = self.get_terrain(position)
        return TERRAIN_BONUSES[terrain]

    def is_walkable(self, position: Tuple[int, int]) -> bool:
        terrain = self.get_terrain(position)
        return terrain != TerrainType.WATER

    def get_distance(self, pos1: Tuple[int, int], pos2: Tuple[int, int]) -> int:
        return abs(pos1[0] - pos2[0]) + abs(pos1[1] - pos2[1])

    def get_reachable_positions(
        self, start: Tuple[int, int], move_range: int
    ) -> List[Tuple[int, int]]:
        reachable = []
        for x in range(self.size):
            for y in range(self.size):
                pos = (x, y)
                if pos != start and self.is_walkable(pos):
                    if self.get_distance(start, pos) <= move_range:
                        reachable.append(pos)
        return reachable

    def get_positions_in_range(
        self, center: Tuple[int, int], range_val: int
    ) -> List[Tuple[int, int]]:
        positions = []
        for x in range(self.size):
            for y in range(self.size):
                pos = (x, y)
                if pos != center and self.get_distance(center, pos) <= range_val:
                    positions.append(pos)
        return positions

    def to_dict(self) -> Dict:
        return {
            "size": self.size,
            "grid": [[terrain.value for terrain in row] for row in self.grid],
        }

    @classmethod
    def from_dict(cls, data: Dict) -> "TerrainGrid":
        terrain = cls(size=data["size"])
        terrain.grid = [
            [TerrainType(t) for t in row] for row in data["grid"]
        ]
        return terrain
