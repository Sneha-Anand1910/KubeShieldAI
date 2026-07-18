import os
from datetime import datetime, timezone
from dotenv import load_dotenv
from sqlalchemy import create_engine, Column, Integer, String, DateTime, JSON
from sqlalchemy.orm import declarative_base, sessionmaker

load_dotenv()

DATABASE_URL = os.getenv("DATABASE_URL")
if not DATABASE_URL:
    raise RuntimeError(
        "DATABASE_URL is not set. Add it to gateway/.env "
        "(e.g. DATABASE_URL=postgresql://user:pass@host/db?sslmode=require)"
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
    created_by     = Column(String, nullable=True, default="unknown")

#keeps track of the state of each finding (acknowledged, wont_fix, false_positive)
class FindingState(Base):
    __tablename__ = "finding_state"

    finding_id = Column(String, primary_key=True)
    status     = Column(String, default="open")  
    note       = Column(String, nullable=True)
    updated_at = Column(DateTime, default=lambda: datetime.now(timezone.utc))


class ChatMessage(Base):
    __tablename__ = "chat_messages"

    id         = Column(Integer, primary_key=True, autoincrement=True)
    scope_type = Column(String)   # "finding" | "cluster"
    scope_id   = Column(String)
    role       = Column(String)   # "user" | "assistant"
    content    = Column(String)
    timestamp  = Column(DateTime, default=lambda: datetime.now(timezone.utc))


class RemediationCache(Base):
    __tablename__ = "remediation_cache"

    finding_id       = Column(String, primary_key=True)
    mode             = Column(String)               # "explain" | "fix"
    explanation      = Column(String, nullable=True)
    yaml_snippet     = Column(String, nullable=True)
    yaml_fix         = Column(String, nullable=True)
    validated        = Column(String, nullable=True)   # store as string to keep it simple across DBs
    validation_notes = Column(String, nullable=True)
    generated_at     = Column(DateTime, default=lambda: datetime.now(timezone.utc))
    
class ScoringCache(Base):
    __tablename__ = "scoring_cache"

    batch_hash     = Column(String, primary_key=True)
    score          = Column(JSON, nullable=True)
    finding_count  = Column(Integer, default=0)
    created_at     = Column(DateTime, default=lambda: datetime.now(timezone.utc))


def init_db():
    Base.metadata.create_all(bind=engine)


def get_session():
    return SessionLocal()