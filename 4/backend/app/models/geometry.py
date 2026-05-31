from datetime import datetime
from sqlalchemy import Column, Integer, String, DateTime, ForeignKey, Text, JSON
from sqlalchemy.orm import relationship

from app.models.database import Base


class Geometry(Base):
    __tablename__ = "geometries"

    id = Column(Integer, primary_key=True, index=True)
    project_id = Column(Integer, ForeignKey("projects.id"), nullable=False)
    name = Column(String(255), nullable=False)
    file_path = Column(String(512), nullable=True)
    file_format = Column(String(20), nullable=True)
    geometry_type = Column(String(20), default="uploaded")
    dimensions = Column(Integer, default=3)
    parameters = Column(JSON, nullable=True)
    bounding_box = Column(JSON, nullable=True)
    created_at = Column(DateTime, default=datetime.utcnow)

    project = relationship("Project", back_populates="geometries")
