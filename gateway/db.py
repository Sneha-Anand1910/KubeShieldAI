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
    "postgresql://kubeshield:changeme@localhost:5432/kubeshield",
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


class FindingState(Base):
    """
    Tracks user decisions on a finding (acknowledged / won't fix / false
    positive) keyed by a stable finding_id, so the status persists across
    rescans instead of resetting every time a new scan runs.
    """
    __tablename__ = "finding_state"

    finding_id = Column(String, primary_key=True)
    status     = Column(String, default="open")   # open | acknowledged | wont_fix | false_positive
    note       = Column(String, nullable=True)
    updated_at = Column(DateTime, default=lambda: datetime.now(timezone.utc))


class ChatMessage(Base):
    """
    One row per chat turn. scope_type is 'finding' or 'cluster'; scope_id is
    the finding_id or a scan/session id — lets both chat surfaces share one
    table without their histories mixing.
    """
    __tablename__ = "chat_messages"

    id         = Column(Integer, primary_key=True, autoincrement=True)
    scope_type = Column(String)   # "finding" | "cluster"
    scope_id   = Column(String)
    role       = Column(String)   # "user" | "assistant"
    content    = Column(String)
    timestamp  = Column(DateTime, default=lambda: datetime.now(timezone.utc))


class RemediationCache(Base):
    """
    Caches the last generated fix per finding_id so the frontend can offer a
    'download corrected YAML' button without regenerating the fix on every
    click (and without needing to re-call the AI service just to download).
    """
    __tablename__ = "remediation_cache"

    finding_id       = Column(String, primary_key=True)
    mode             = Column(String)               # "explain" | "fix"
    explanation      = Column(String, nullable=True)
    yaml_snippet     = Column(String, nullable=True)
    yaml_fix         = Column(String, nullable=True)
    validated        = Column(String, nullable=True)   # store as string to keep it simple across DBs
    validation_notes = Column(String, nullable=True)
    generated_at     = Column(DateTime, default=lambda: datetime.now(timezone.utc))


def init_db():
    Base.metadata.create_all(bind=engine)


def get_session():
    return SessionLocal()