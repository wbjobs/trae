from datetime import datetime
from sqlalchemy import Column, Integer, String, DateTime, ForeignKey, JSON, Text

from app.models.database import Base
from sqlalchemy.orm import relationship


class Result(Base):
    __tablename__ = "results"

    id = Column(Integer, primary_key=True, index=True)
    project_id = Column(Integer, ForeignKey("projects.id"), nullable=False)
    mesh_id = Column(Integer, ForeignKey("meshes.id"), nullable=True)
    name = Column(String(255), nullable=False)
    file_path = Column(String(512), nullable=True)
    file_format = Column(String(20))
    result_type = Column(String(50))
    fields = Column(JSON, nullable=True)
    num_timesteps = Column(Integer, default=1)
    metadata = Column(JSON, nullable=True)
    created_at = Column(DateTime, default=datetime.utcnow)

    project = relationship("Project", back_populates="results")
