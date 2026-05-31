from sqlalchemy import Column, Integer, String, Boolean, DateTime, Text, JSON, ForeignKey, Float
from sqlalchemy.orm import relationship
from database import Base
from datetime import datetime

class DataSource(Base):
    __tablename__ = "datasources"
    
    id = Column(Integer, primary_key=True, index=True)
    name = Column(String(100), nullable=False)
    type = Column(String(50), nullable=False)
    connection_info = Column(JSON, nullable=False)
    field_mapping = Column(JSON, nullable=False)
    created_at = Column(DateTime, default=datetime.utcnow)
    updated_at = Column(DateTime, default=datetime.utcnow, onupdate=datetime.utcnow)
    is_active = Column(Boolean, default=True)
    
    anomaly_rules = relationship("AnomalyDetectionRule", back_populates="datasource")
    anomaly_records = relationship("AnomalyRecord", back_populates="datasource")

class ShareLink(Base):
    __tablename__ = "share_links"
    
    id = Column(Integer, primary_key=True, index=True)
    token = Column(String(64), unique=True, index=True, nullable=False)
    datasource_id = Column(Integer, ForeignKey("datasources.id"), nullable=False)
    config = Column(JSON, nullable=False)
    expires_at = Column(DateTime, nullable=True)
    is_active = Column(Boolean, default=True)
    view_count = Column(Integer, default=0)
    password_hash = Column(String(255), nullable=True)
    created_by = Column(String(100), default="anonymous")
    created_at = Column(DateTime, default=datetime.utcnow)
    last_accessed_at = Column(DateTime, nullable=True)
    
    datasource = relationship("DataSource")

class AnomalyDetectionRule(Base):
    __tablename__ = "anomaly_detection_rules"
    
    id = Column(Integer, primary_key=True, index=True)
    name = Column(String(100), nullable=False)
    datasource_id = Column(Integer, ForeignKey("datasources.id"), nullable=False)
    algorithm = Column(String(50), nullable=False)
    params = Column(JSON, nullable=False)
    window_size = Column(Integer, default=60)
    threshold = Column(Float, default=3.0)
    min_continuous = Column(Integer, default=1)
    is_active = Column(Boolean, default=True)
    created_at = Column(DateTime, default=datetime.utcnow)
    updated_at = Column(DateTime, default=datetime.utcnow, onupdate=datetime.utcnow)
    
    datasource = relationship("DataSource", back_populates="anomaly_rules")
    alert_rules = relationship("AlertRule", back_populates="anomaly_rule")
    anomaly_records = relationship("AnomalyRecord", back_populates="anomaly_rule")

class AlertRule(Base):
    __tablename__ = "alert_rules"
    
    id = Column(Integer, primary_key=True, index=True)
    name = Column(String(100), nullable=False)
    anomaly_rule_id = Column(Integer, ForeignKey("anomaly_detection_rules.id"), nullable=False)
    channel_type = Column(String(50), nullable=False)
    channel_config = Column(JSON, nullable=False)
    is_active = Column(Boolean, default=True)
    created_at = Column(DateTime, default=datetime.utcnow)
    updated_at = Column(DateTime, default=datetime.utcnow, onupdate=datetime.utcnow)
    
    anomaly_rule = relationship("AnomalyDetectionRule", back_populates="alert_rules")
    alert_histories = relationship("AlertHistory", back_populates="alert_rule")

class AlertHistory(Base):
    __tablename__ = "alert_histories"
    
    id = Column(Integer, primary_key=True, index=True)
    alert_rule_id = Column(Integer, ForeignKey("alert_rules.id"), nullable=False)
    anomaly_record_id = Column(Integer, ForeignKey("anomaly_records.id"), nullable=True)
    channel_type = Column(String(50), nullable=False)
    status = Column(String(50), nullable=False)
    error_message = Column(Text, nullable=True)
    sent_at = Column(DateTime, default=datetime.utcnow)
    response_data = Column(JSON, nullable=True)
    
    alert_rule = relationship("AlertRule", back_populates="alert_histories")
    anomaly_record = relationship("AnomalyRecord")

class AnomalyRecord(Base):
    __tablename__ = "anomaly_records"
    
    id = Column(Integer, primary_key=True, index=True)
    datasource_id = Column(Integer, ForeignKey("datasources.id"), nullable=False)
    anomaly_rule_id = Column(Integer, ForeignKey("anomaly_detection_rules.id"), nullable=False)
    timestamp = Column(DateTime, nullable=False)
    value = Column(Float, nullable=False)
    severity = Column(String(50), nullable=False)
    description = Column(Text, nullable=True)
    context_data = Column(JSON, nullable=True)
    status = Column(String(50), default="new")
    cause = Column(Text, nullable=True)
    created_at = Column(DateTime, default=datetime.utcnow)
    updated_at = Column(DateTime, default=datetime.utcnow, onupdate=datetime.utcnow)
    
    datasource = relationship("DataSource", back_populates="anomaly_records")
    anomaly_rule = relationship("AnomalyDetectionRule", back_populates="anomaly_records")
