import hashlib
import yaml
from datetime import datetime, timezone
from fastapi import FastAPI, UploadFile, File, HTTPException
from fastapi.middleware.cors import CORSMiddleware
from fastapi.staticfiles import StaticFiles
from fastapi.responses import FileResponse, Response
from pydantic import BaseModel
import httpx
import os
import json
from redis_client import redis_client, REMEDIATION_TTL_SECONDS, SCORING_TTL_SECONDS
from db import init_db, get_session, ScanHistory, FindingState, ChatMessage, RemediationCache, ScoringCache

app = FastAPI(title="KubeShield Gateway")

@app.on_event("startup")
def on_startup():
    init_db()

# Allow React dev server (Vite on :5173) to call this during development
app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_methods=["*"],
    allow_headers=["*"],
)

# ── Internal service URLs ──────────────────────────────────────────────────
INGESTION_URL = os.getenv("INGESTION_SERVICE_URL", "http://localhost:8001")
SECURITY_URL  = os.getenv("SECURITY_SERVICE_URL",  "http://localhost:8002")
SCORING_URL   = os.getenv("SCORING_SERVICE_URL",   "http://localhost:8003")
AI_URL        = os.getenv("AI_SERVICE_URL",         "http://localhost:8004")


# ── /api/ingest/live ───────────────────────────────────────────────────────
@app.post("/api/ingest/live")
async def ingest_live():
    async with httpx.AsyncClient(timeout=30) as client:
        try:
            r = await client.post(f"{INGESTION_URL}/scan/live")
            r.raise_for_status()
            return r.json()
        except httpx.ConnectError:
            raise HTTPException(503, "ingestion-service is not running")


# ── /api/ingest/yaml ───────────────────────────────────────────────────────
@app.post("/api/ingest/yaml")
async def ingest_yaml(file: UploadFile = File(...)):
    contents = await file.read()
    async with httpx.AsyncClient(timeout=30) as client:
        try:
            r = await client.post(
                f"{INGESTION_URL}/scan/yaml",
                files={"file": (file.filename, contents, "application/octet-stream")},
            )
            r.raise_for_status()
            return r.json()
        except httpx.ConnectError:
            raise HTTPException(503, "ingestion-service is not running")


# ── /api/ingest/namespaces ────────────────────────────────────────────────
@app.get("/api/ingest/namespaces")
async def ingest_namespaces():
    async with httpx.AsyncClient(timeout=15) as client:
        try:
            r = await client.get(f"{INGESTION_URL}/ingest/namespaces")
            r.raise_for_status()
            return r.json()
        except httpx.ConnectError:
            raise HTTPException(503, "ingestion-service is not running")


# ── Finding normalization ──────────────────────────────────────────────────
_CATEGORY_FROM_MODULE = {
    "rbac":             "RBAC",
    "pod":              "Pod Security",
    "pods":             "Pod Security",
    "pod security":     "Pod Security",
    "secret":           "Secrets",
    "secrets":          "Secrets",
    "network":          "Network",
    "networking":       "Network",
    "service exposure": "Network",
}


def _pick(f: dict, *keys, default=""):
    for k in keys:
        v = f.get(k)
        if v not in (None, ""):
            return v
    return default


def normalize_finding(f: dict) -> dict:
    """Return a finding carrying BOTH capital-case (UI/scoring) and lowercase
    (AI model) keys so every downstream consumer finds what it expects."""
    severity = str(_pick(f, "Severity", "severity", default="Low")).strip().capitalize()
    module_raw = _pick(f, "check", "module", "category", default="Unknown")
    category = _CATEGORY_FROM_MODULE.get(str(module_raw).strip().lower(), module_raw)
    issue    = _pick(f, "Issue", "title", "issue")
    resource = _pick(f, "resource", "resource_name", "Resource")
    detail   = _pick(f, "Detail", "evidence", "detail")
    reco     = _pick(f, "Recommendation", "remediation_hint", "recommendation")

    return {
        **f,
        # Schema B (React pages + scoring-service)
        "Severity":       severity,
        "Issue":          issue,
        "check":          category,
        "resource":       resource,
        "Detail":         detail,
        "Recommendation": reco,
        # Schema A (AI-service Finding model)
        "severity":       severity,
        "module":         _pick(f, "module", default=module_raw),
        "title":          issue,
        "resource_name":  resource,
        "evidence":       detail,
        "remediation_hint": reco,
    }


def compute_finding_id(finding: dict) -> str:
    raw = (
        f"{finding.get('module', '')}:"
        f"{finding.get('title', '')}:"
        f"{finding.get('namespace', '')}:"
        f"{finding.get('resource_name', '')}"
    )
    return hashlib.sha256(raw.encode()).hexdigest()[:16]


def get_kubeconfig_user(kubeconfig_str: str) -> str:
    try:
        cfg = yaml.safe_load(kubeconfig_str) or {}
        current_context_name = cfg.get("current-context")
        for c in cfg.get("contexts", []) or []:
            if c.get("name") == current_context_name:
                return c.get("context", {}).get("user", "unknown")
        return "unknown"
    except Exception:
        return "unknown"

# ── /api/analyze ──────────────────────────────────────────────────────────
@app.post("/api/analyze")
async def analyze(body: dict):
    kubeconfig_path = os.path.expanduser("~/.kube/config")
    try:
        with open(kubeconfig_path, "r") as f:
            kubeconfig_str = f.read()
    except FileNotFoundError:
        raise HTTPException(500, f"kubeconfig not found at {kubeconfig_path}")

    scanned_by = get_kubeconfig_user(kubeconfig_str)

    async with httpx.AsyncClient(timeout=180) as client:
        try:
            sec_r = await client.post(
                f"{SECURITY_URL}/analyze",
                json={"kubeconfig_content": kubeconfig_str},
            )
        except httpx.ConnectError:
            raise HTTPException(503, "security-service is not running")
        except httpx.HTTPError as e:
            raise HTTPException(502, f"security-service request failed: {e}")

    result = sec_r.json()

    # Normalize every finding so the UI, scoring, AI, and finding_id all agree
    findings     = [normalize_finding(f) for f in result.get("findings", [])]
    by_severity  = result.get("by_severity") or {}
    by_module    = result.get("by_module") or {}
    cluster_info = result.get("cluster_info") or {}

    # Attach a stable finding_id + any persisted status (acknowledged /
    # won't fix / false positive) to each finding.
    db = get_session()
    try:
        for f in findings:
            f["finding_id"] = compute_finding_id(f)
            state = db.query(FindingState).filter_by(finding_id=f["finding_id"]).first()
            f["status"] = state.status if state else "open"
    finally:
        db.close()

    # security → (user reviews + marks status) → forward → scoring → AI.
    score: dict = {"risk_score": None}

    # ── Persist this scan to history ──────────────────────────────────────
    db = get_session()
    entry = ScanHistory(
        resource_count=len(findings),
        findings_count=len(findings),
        risk_score=None,
        grade=None,
        status="completed",
        by_severity=by_severity,
        by_module=by_module,
        created_by=scanned_by,
    )
    db.add(entry)
    db.commit()
    db.close()

    return {
        "findings":     findings,
        "cluster_info": cluster_info,
        "total_issues": len(findings),
        "analyzed":     len(findings),
        "skipped":      0,
        "by_severity":  by_severity,
        "by_module":    by_module,
        "score":        score,
    }


def compute_batch_hash(finding_ids: list[str]) -> str:
    """Stable hash of a forwarded set of finding_ids, regardless of order —
    lets us cache scoring results for a batch that's been forwarded before."""
    raw = ",".join(sorted(finding_ids))
    return hashlib.sha256(raw.encode()).hexdigest()[:16]


# ── /api/forward ─────────────────────────────────────────────────────────
@app.post("/api/forward")
async def forward_to_scoring(body: dict):
    findings = body.get("findings", [])
    if not findings:
        raise HTTPException(400, "body must include a non-empty 'findings' list")

    FORWARDABLE_STATUSES = {"open", "acknowledged"}
    open_findings = [f for f in findings if f.get("status", "open") in FORWARDABLE_STATUSES]
    if not open_findings:
        raise HTTPException(400, "no open or acknowledged findings to forward — everything sent was won't-fix or false positive")
    
    finding_ids = [f["finding_id"] for f in open_findings if "finding_id" in f]
    batch_hash = compute_batch_hash(finding_ids)
    ids_are_reliable = len(finding_ids) == len(open_findings) == len(set(finding_ids))
    redis_key = f"scoring:{batch_hash}"

    if ids_are_reliable:
        cached_raw = await redis_client.get(redis_key)
        if cached_raw:
            return {"score": json.loads(cached_raw), "cached": True, "cache_source": "redis", "forwarded_count": len(open_findings)}

        db = get_session()
        try:
            cached = db.query(ScoringCache).filter_by(batch_hash=batch_hash).first()
        finally:
            db.close()
        if cached:
            await redis_client.set(redis_key, json.dumps(cached.score), ex=SCORING_TTL_SECONDS)
            return {"score": cached.score, "cached": True, "cache_source": "postgres", "forwarded_count": len(open_findings)}
        
    by_severity: dict = {}
    for f in open_findings:
        sev = f.get("severity") or f.get("Severity") or "Unknown"
        by_severity[sev] = by_severity.get(sev, 0) + 1

    async with httpx.AsyncClient(timeout=60) as client:
        try:
            score_r = await client.post(
                f"{SCORING_URL}/score",
                json={"findings": open_findings, "summary": {"by_severity": by_severity}},
            )
            score_r.raise_for_status()
            score = score_r.json()
        except httpx.ConnectError:
            raise HTTPException(503, "scoring-service is not running")
        except httpx.HTTPError as e:
            raise HTTPException(502, f"scoring-service request failed: {e}")

    db = get_session()
    try:
        db.add(ScoringCache(batch_hash=batch_hash, score=score, finding_count=len(open_findings)))
        db.commit()
    finally:
        db.close()
    await redis_client.set(redis_key, json.dumps(score), ex=SCORING_TTL_SECONDS)
    return {"score": score, "cached": False, "cache_source": None, "forwarded_count": len(open_findings)}


class FindingStatusUpdate(BaseModel):
    status: str            # "open" | "acknowledged" | "wont_fix" | "false_positive"
    note: str | None = None


VALID_FINDING_STATUSES = {"open", "acknowledged", "wont_fix", "false_positive"}


# ── /api/findings/{finding_id}/status ───────────────────────────────────────
@app.patch("/api/findings/{finding_id}/status")
async def update_finding_status(finding_id: str, body: FindingStatusUpdate):
    if body.status not in VALID_FINDING_STATUSES:
        raise HTTPException(400, f"status must be one of {sorted(VALID_FINDING_STATUSES)}")

    db = get_session()
    try:
        state = db.query(FindingState).filter_by(finding_id=finding_id).first()
        if state:
            state.status = body.status
            state.note = body.note
            state.updated_at = datetime.now(timezone.utc)
        else:
            state = FindingState(finding_id=finding_id, status=body.status, note=body.note)
            db.add(state)
        db.commit()
        return {"finding_id": finding_id, "status": body.status}
    finally:
        db.close()


@app.get("/api/history")
async def get_history():
    db = get_session()
    try:
        rows = (
            db.query(ScanHistory)
            .order_by(ScanHistory.timestamp.desc())
            .limit(50)
            .all()
        )
        return {
            "history": [
                {
                    "id":        f"scan-{r.id}",
                    "timestamp": r.timestamp.replace(tzinfo=timezone.utc).isoformat(),
                    "resources": r.resource_count,
                    "findings":  r.findings_count,
                    "score":     r.risk_score if r.risk_score is not None else 0,
                    "grade":     r.grade,
                    "status":    r.status,
                }
                for r in rows
            ]
        }
    finally:
        db.close()


# ── /api/ai/explain ───────────────────────────────────────────────────────
@app.post("/api/ai/explain")
async def ai_explain(body: dict):
    async with httpx.AsyncClient(timeout=60) as client:
        try:
            r = await client.post(f"{AI_URL}/explain", json=body)
            r.raise_for_status()
            return r.json()
        except httpx.ConnectError:
            raise HTTPException(503, "ai-service is not running")


# ── /api/ai/remediate ───────────────────────────────────────────────────────
def _remediation_cache_to_dict(cache: RemediationCache) -> dict:
    return {
        "mode": cache.mode,
        "explanation": cache.explanation,
        "yaml_snippet": cache.yaml_snippet,
        "yaml_fix": cache.yaml_fix,
        "validated": cache.validated == "True",
        "validation_notes": cache.validation_notes,
    }


@app.post("/api/ai/remediate")
async def remediate(body: dict):
    finding = body.get("finding")
    if not finding or "finding_id" not in finding:
        raise HTTPException(400, "body must include a finding with a finding_id")

    finding_id = finding["finding_id"]
    redis_key = f"remediation:{finding_id}"

    cached_raw = await redis_client.get(redis_key)
    if cached_raw:
        result = json.loads(cached_raw)
        result["cached"] = True
        result["cache_source"] = "redis"
        return result

    db = get_session()
    try:
        pg_cache = db.query(RemediationCache).filter_by(finding_id=finding_id).first()
    finally:
        db.close()

    if pg_cache and pg_cache.explanation:
        result = _remediation_cache_to_dict(pg_cache)
        result["cached"] = True
        result["cache_source"] = "postgres"
        await redis_client.set(redis_key, json.dumps(result), ex=REMEDIATION_TTL_SECONDS)
        return result

    async with httpx.AsyncClient(timeout=60) as client:
        try:
            r = await client.post(f"{AI_URL}/remediate", json={"finding": finding})
            r.raise_for_status()
            result = r.json()
        except httpx.ConnectError:
            raise HTTPException(503, "ai-service is not running")

    db = get_session()
    try:
        cache = db.query(RemediationCache).filter_by(finding_id=finding_id).first()
        if not cache:
            cache = RemediationCache(finding_id=finding_id)
            db.add(cache)
        cache.mode = result.get("mode")
        cache.explanation = result.get("explanation")
        cache.yaml_snippet = result.get("yaml_snippet")
        cache.yaml_fix = result.get("yaml_fix")
        cache.validated = str(result.get("validated"))
        cache.validation_notes = result.get("validation_notes")
        cache.generated_at = datetime.now(timezone.utc)
        db.commit()
    finally:
        db.close()

    result["cached"] = False
    await redis_client.set(redis_key, json.dumps(result), ex=REMEDIATION_TTL_SECONDS)

    return result


# ── /api/ai/remediate/{finding_id}/download ─────────────────────────────────
@app.get("/api/ai/remediate/{finding_id}/download")
async def download_remediation(finding_id: str):
    db = get_session()
    try:
        cache = db.query(RemediationCache).filter_by(finding_id=finding_id).first()
    finally:
        db.close()

    if not cache or not cache.yaml_fix:
        raise HTTPException(404, "No generated fix found for this finding yet — call /api/ai/remediate first")

    return Response(
        content=cache.yaml_fix,
        media_type="application/x-yaml",
        headers={"Content-Disposition": f'attachment; filename="fix-{finding_id}.yaml"'},
    )


def _load_chat_history(db, scope_type: str, scope_id: str):
    rows = (
        db.query(ChatMessage)
        .filter_by(scope_type=scope_type, scope_id=scope_id)
        .order_by(ChatMessage.timestamp.asc())
        .all()
    )
    return [{"role": r.role, "content": r.content} for r in rows]


def _save_chat_turn(db, scope_type: str, scope_id: str, role: str, content: str):
    db.add(ChatMessage(scope_type=scope_type, scope_id=scope_id, role=role, content=content))
    db.commit()


async def _call_ai_chat(context: str, chat_history: list, message: str) -> str:
    async with httpx.AsyncClient(timeout=60) as client:
        try:
            r = await client.post(
                f"{AI_URL}/chat",
                json={"context": context, "chat_history": chat_history, "message": message},
            )
            r.raise_for_status()
            return r.json()["reply"]
        except httpx.ConnectError:
            raise HTTPException(503, "ai-service is not running")

# ── /api/ai/chat/finding ─────────────────────────────────────────────────────
@app.post("/api/ai/chat/finding")
async def chat_finding(body: dict):
    finding = body.get("finding")
    message = body.get("message")
    if not finding or "finding_id" not in finding or not message:
        raise HTTPException(400, "body must include finding (with finding_id) and message")

    finding_id = finding["finding_id"]
    context = (
        f"Finding: {finding.get('title')}\n"
        f"Severity: {finding.get('severity')}\n"
        f"Module: {finding.get('module')}\n"
        f"Resource: {finding.get('resource_name')} (namespace: {finding.get('namespace')})\n"
        f"Evidence: {finding.get('evidence', 'N/A')}\n"
        f"Remediation hint: {finding.get('remediation_hint', 'N/A')}"
    )

    db = get_session()
    try:
        history = _load_chat_history(db, "finding", finding_id)
    finally:
        db.close()

    cached = False
    if not history:
        cache_key = _chat_cache_key("finding", finding_id, message)
        cached_reply = await redis_client.get(cache_key)
        if cached_reply:
            reply = cached_reply
            cached = True

    if not cached:
        reply = await _call_ai_chat(context, history, message)
        if not history:
            cache_key = _chat_cache_key("finding", finding_id, message)
            await redis_client.set(cache_key, reply, ex=REMEDIATION_TTL_SECONDS)

    db = get_session()
    try:
        _save_chat_turn(db, "finding", finding_id, "user", message)
        _save_chat_turn(db, "finding", finding_id, "assistant", reply)
    finally:
        db.close()

    return {"reply": reply, "cached": cached}

# ── /api/ai/chat/cluster ────────────────────────────────────────────────────
@app.post("/api/ai/chat/cluster")
async def chat_cluster(body: dict):
    scan_id = body.get("scan_id")
    message = body.get("message")
    summary = body.get("summary", {})
    if not scan_id or not message:
        raise HTTPException(400, "body must include scan_id and message")

    top_priorities = summary.get("top_priorities", [])
    priorities_text = "\n".join(
        f"- {p.get('title', p)} (impact: {p.get('impact_score', '?')})" for p in top_priorities
    ) or "No priority data available."

    context = (
        f"Overall risk score: {summary.get('risk_score', '?')} (grade: {summary.get('grade', '?')})\n"
        f"Severity breakdown: {summary.get('by_severity', {})}\n"
        f"Top priority findings:\n{priorities_text}"
    )

    db = get_session()
    try:
        history = _load_chat_history(db, "cluster", scan_id)
    finally:
        db.close()

    cached = False
    if not history:
        cache_key = _chat_cache_key("cluster", scan_id, message)
        cached_reply = await redis_client.get(cache_key)
        if cached_reply:
            reply = cached_reply
            cached = True

    if not cached:
        reply = await _call_ai_chat(context, history, message)
        if not history:
            cache_key = _chat_cache_key("cluster", scan_id, message)
            await redis_client.set(cache_key, reply, ex=REMEDIATION_TTL_SECONDS)

    db = get_session()
    try:
        _save_chat_turn(db, "cluster", scan_id, "user", message)
        _save_chat_turn(db, "cluster", scan_id, "assistant", reply)
    finally:
        db.close()

    return {"reply": reply, "cached": cached}


# ── /api/health ────────────────────────────────────────────────────────
@app.get("/api/health")
async def health():
    statuses = {}
    async with httpx.AsyncClient(timeout=5) as client:
        for name, url in [
            ("ingestion", INGESTION_URL),
            ("security",  SECURITY_URL),
            ("scoring",   SCORING_URL),
            ("ai",        AI_URL),
        ]:
            try:
                r = await client.get(f"{url}/health")
                statuses[name] = "ok" if r.status_code == 200 else "error"
            except Exception:
                statuses[name] = "unreachable"

    all_ok = all(v == "ok" for v in statuses.values())
    return {"status": "ok" if all_ok else "degraded", "services": statuses}


# ── Serve React build in production ──────────────────────────────────────
DIST = os.path.join(os.path.dirname(__file__), "..", "frontend", "dist")
if os.path.exists(DIST):
    app.mount("/assets", StaticFiles(directory=os.path.join(DIST, "assets")), name="assets")

    @app.get("/{full_path:path}")
    def serve_react(full_path: str):
        return FileResponse(os.path.join(DIST, "index.html"))