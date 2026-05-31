import random
from datetime import datetime
from pydantic import BaseModel


class StockData(BaseModel):
    timestamp: str
    price: float
    volume: int


class StockDataGenerator:
    def __init__(self):
        self.base_price = 100.0
        self.volatility = 0.002

    def generate(self) -> StockData:
        change = random.gauss(0, self.volatility * self.base_price)
        if random.random() < 0.02:
            change *= 10
        self.base_price = max(1.0, self.base_price + change)
        return StockData(
            timestamp=datetime.utcnow().isoformat() + "Z",
            price=round(self.base_price, 2),
            volume=random.randint(100, 10000),
        )
