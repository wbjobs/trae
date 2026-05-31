from sqlalchemy import (
    Column,
    Integer,
    String,
    Float,
    DateTime,
    Boolean,
    ForeignKey,
    Index,
    Text,
)
from sqlalchemy.orm import relationship
from datetime import datetime

from app.database import Base


class Warehouse(Base):
    __tablename__ = "warehouses"

    id = Column(Integer, primary_key=True, index=True)
    name = Column(String(255), nullable=False)
    latitude = Column(Float, nullable=False)
    longitude = Column(Float, nullable=False)
    capacity = Column(Integer, default=10000)
    region = Column(String(100))

    orders_from = relationship(
        "Order",
        foreign_keys="Order.origin_warehouse_id",
        back_populates="origin_warehouse",
    )
    orders_to = relationship(
        "Order",
        foreign_keys="Order.destination_warehouse_id",
        back_populates="destination_warehouse",
    )

    __table_args__ = (
        Index("idx_warehouse_location", "latitude", "longitude"),
    )


class Vehicle(Base):
    __tablename__ = "vehicles"

    id = Column(Integer, primary_key=True, index=True)
    plate_number = Column(String(50), unique=True, nullable=False)
    vehicle_type = Column(String(50))
    max_load = Column(Float, default=20.0)
    home_warehouse_id = Column(Integer, ForeignKey("warehouses.id"))
    status = Column(String(50), default="active")

    orders = relationship("Order", back_populates="assigned_vehicle")


class Order(Base):
    __tablename__ = "orders"

    id = Column(Integer, primary_key=True, index=True)
    order_number = Column(String(100), unique=True, nullable=False, index=True)
    origin_warehouse_id = Column(Integer, ForeignKey("warehouses.id"), nullable=False)
    destination_warehouse_id = Column(Integer, ForeignKey("warehouses.id"), nullable=False)
    vehicle_id = Column(Integer, ForeignKey("vehicles.id"))
    weight = Column(Float, nullable=False)
    scheduled_pickup_time = Column(DateTime, nullable=False)
    actual_pickup_time = Column(DateTime)
    scheduled_delivery_time = Column(DateTime, nullable=False)
    actual_delivery_time = Column(DateTime)
    status = Column(String(50), default="pending")
    created_at = Column(DateTime, default=datetime.utcnow, index=True)

    origin_warehouse = relationship(
        "Warehouse",
        foreign_keys=[origin_warehouse_id],
        back_populates="orders_from",
    )
    destination_warehouse = relationship(
        "Warehouse",
        foreign_keys=[destination_warehouse_id],
        back_populates="orders_to",
    )
    assigned_vehicle = relationship("Vehicle", back_populates="orders")
    anomalies = relationship("OrderAnomaly", back_populates="order")

    __table_args__ = (
        Index("idx_order_scheduled_pickup", "scheduled_pickup_time"),
        Index("idx_order_created_at", "created_at"),
    )


class OrderAnomaly(Base):
    __tablename__ = "order_anomalies"

    id = Column(Integer, primary_key=True, index=True)
    order_id = Column(Integer, ForeignKey("orders.id"), nullable=False, index=True)
    anomaly_type = Column(String(50), nullable=False)
    anomaly_score = Column(Float, nullable=False)
    anomaly_level = Column(String(20), default="medium")
    detected_at = Column(DateTime, default=datetime.utcnow, index=True)
    details = Column(Text)
    is_reviewed = Column(Boolean, default=False)

    order = relationship("Order", back_populates="anomalies")

    __table_args__ = (
        Index("idx_anomaly_score", "anomaly_score"),
        Index("idx_anomaly_detected", "detected_at"),
    )


class DailyStats(Base):
    __tablename__ = "daily_stats"

    id = Column(Integer, primary_key=True, index=True)
    stats_date = Column(DateTime, unique=True, nullable=False, index=True)
    total_orders = Column(Integer, default=0)
    avg_transit_hours = Column(Float, default=0.0)
    anomaly_count = Column(Integer, default=0)
    total_weight = Column(Float, default=0.0)
    created_at = Column(DateTime, default=datetime.utcnow)
