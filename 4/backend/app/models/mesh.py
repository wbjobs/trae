from datetime import datetime
from sqlalchemy import Column, Integer, String, DateTime, ForeignKey, JSON, Float

from app.models.database import Base
from sqlalchemy.orm import relationship


class MeshConfig(Base):
    __tablename__ = "mesh_configs"

    id = Column(Integer, primary_key=True, index=True)
    project_id = Column(Integer, ForeignKey("projects.id"), nullable=False)
    geometry_id = Column(Integer, ForeignKey("geometries.id"), nullable=True)
    element_type = Column(String(20), default="tetra")
    mesh_size = Column(Float, default=1.0)
    min_mesh_size = Column(Float, default=0.1)
    max_mesh_size = Column(Float, default=5.0)
    algorithm_2d = Column(Integer, default=8)
    algorithm_3d = Column(Integer, default=4)
    smoothing_iterations = Column(Integer, default=5)
    element_order = Column(Integer, default=1)
    structured = Column(Integer, default=0)
    additional_options = Column(JSON, nullable=True)
    created_at = Column(DateTime, default=datetime.utcnow)


class Mesh(Base):
    __tablename__ = "meshes"

    id = Column(Integer, primary_key=True, index=True)
    project_id = Column(Integer, ForeignKey("projects.id"), nullable=False)
    geometry_id = Column(Integer, ForeignKey("geometries.id"), nullable=True)
    config_id = Column(Integer, ForeignKey("mesh_configs.id"), nullable=True)
    name = Column(String(255), nullable=False)
    file_path = Column(String(512), nullable=True)
    element_type = Column(String(20))
    num_nodes = Column(Integer)
    num_elements = Column(Integer)
    status = Column(String(50), default="pending")
    error_message = Column(Text, nullable=True)
    quality_stats = Column(JSON, nullable=True)
    created_at = Column(DateTime, default=datetime.utcnow)

    project = relationship("Project", back_populates="meshes")
