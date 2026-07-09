"""
Database layer for KubeShield Gateway.
Stores one row per completed scan so the History page has real data.
"""

import os
from datetime import datetime, timezone
from sqlalchemy import create_engine, Column, Integer, String, DateTime, JSON
from sqlalchemy.orm import declarative_base, sessionmaker

DATABASE_URL = os.getenv(
    "DATABASE_URL",
    "postgresql://kubeshield:kubeshield_dev@localhost:5432/kubeshield",
)

engine = create_engine(DATABASE_URL, pool_pre_ping=True)
SessionLocal = sessionmaker(bind=engine, autoflush=False, autocommit=False)
Base = declarative_base()


class ScanHistory(Base):
    __tablename__ = "scan_history"

    id             = Column(Integer, primary_key=True, autoincrement=True)
    timestamp      = Column(DateTime, default=lambda: datetime.now(timezone.utc))
    resource_count = Column(Integer, default=0)
    findings_count = Column(Integer, default=0)
    risk_score     = Column(Integer, nullable=True)
    grade          = Column(String, nullable=True)
    status         = Column(String, default="completed")
    by_severity    = Column(JSON, nullable=True)
    by_module      = Column(JSON, nullable=True)


def init_db():
    Base.metadata.create_all(bind=engine)


def get_session():
    return SessionLocal()