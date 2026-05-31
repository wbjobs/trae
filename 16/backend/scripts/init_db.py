import sys
import os
sys.path.insert(0, os.path.dirname(os.path.dirname(os.path.abspath(__file__))))

from app.database import Base, engine
from app.models import Warehouse, Vehicle, Order, OrderAnomaly, DailyStats

print("Creating database tables...")
Base.metadata.create_all(bind=engine)
print("Database tables created successfully!")
