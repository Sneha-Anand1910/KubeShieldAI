"""
KubeShield Gateway
------------------
This is the ONLY service the React frontend talks to.
It receives requests from the browser and forwards them
to the correct microservice internally.

Runs on port 8000.
"""

import hashlib
from datetime import datetime, timezone
from fastapi import FastAPI, UploadFile, File, HTTPException
from fastapi.middleware.cors import CORSMiddleware
from fastapi.staticfiles import StaticFiles
from fastapi.responses import FileResponse, Response
from pydantic import BaseModel
import httpx
import os
from db import init_db, get_session, ScanHistory, FindingState, ChatMessage, RemediationCache

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
# When running locally: these use localhost + different ports
# When running on cluster: these use Kubernetes service names
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
# security-service can emit findings in two shapes depending on the build:
#   Schema A (repo source): severity / title / module / resource_name /
#                            evidence / remediation_hint
#   Schema B (frontend):     Severity / Issue  / check  / resource /
#                            Detail   / Recommendation
# React pages, scoring-service, and finding_id/status all rely on stable
# field names, so we normalize every finding to a superset carrying BOTH
# forms before anything else touches it.

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
    """
    Stable ID for a finding, independent of any one scan — same rule +
    resource + namespace should hash to the same ID every time, so a
    user's acknowledge/won't-fix decision survives rescans.
    Uses the normalized (Schema A) fields so it's stable regardless of
    which schema security-service happened to emit.
    """
    raw = (
        f"{finding.get('module', '')}:"
        f"{finding.get('title', '')}:"
        f"{finding.get('namespace', '')}:"
        f"{finding.get('resource_name', '')}"
    )
    return hashlib.sha256(raw.encode()).hexdigest()[:16]


# ── /api/analyze ──────────────────────────────────────────────────────────
# After ingestion, the frontend triggers analysis.
# Gateway → security-service /analyze → scoring-service /score → combined response.
#
# security-service does NOT read its own kubeconfig — it expects the
# gateway to read ~/.kube/config and forward it as kubeconfig_content
# on every request. security-service only holds it in a temp file for
# the duration of the request and deletes it immediately after
# (see security-service/app.py: load_clients()). Live scan is the
# primary path; YAML upload is a fallback.
@app.post("/api/analyze")
async def analyze(body: dict):
    kubeconfig_path = os.path.expanduser("~/.kube/config")
    try:
        with open(kubeconfig_path, "r") as f:
            kubeconfig_str = f.read()
    except FileNotFoundError:
        raise HTTPException(500, f"kubeconfig not found at {kubeconfig_path}")

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

    # For scoring, drop findings the user dismissed:
    #   false_positive → not a real problem
    #   wont_fix       → real, but the team accepted the risk
    # "acknowledged" still counts — it's a real, unfixed risk.
    active = [f for f in findings if f.get("status") not in ("false_positive", "wont_fix")]

    # ── Call scoring-service to get the real risk score ──────────────────
    # A scoring failure must not break the scan — fall back to a null score.
    score: dict = {"risk_score": None}
    async with httpx.AsyncClient(timeout=30) as client:
        try:
            score_r = await client.post(
                f"{SCORING_URL}/score",
                json={"findings": active, "summary": {}},
            )
            if score_r.status_code == 200:
                score = score_r.json()
        except httpx.HTTPError:
            pass  # scoring-service down/unreachable — keep the null score

    # ── Persist this scan to history ──────────────────────────────────────
    try:
        db = get_session()
        entry = ScanHistory(
            resource_count=len(findings),
            findings_count=len(findings),
            risk_score=score.get("risk_score"),
            grade=score.get("grade"),
            status="completed",
            by_severity=by_severity,
            by_module=by_module,
        )
        db.add(entry)
        db.commit()
        db.close()
    except Exception as e:
        # Don't fail the whole scan just because history logging failed
        print(f"Warning: failed to save scan history: {e}")

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


class FindingStatusUpdate(BaseModel):
    status: str            # "open" | "acknowledged" | "wont_fix" | "false_positive"
    note: str | None = None


VALID_FINDING_STATUSES = {"open", "acknowledged", "wont_fix", "false_positive"}


# ── /api/findings/{finding_id}/status ───────────────────────────────────────
# Frontend calls this when a user marks a finding as acknowledged, won't-fix,
# or false-positive. Persists across rescans since it's keyed on finding_id,
# not on any one scan.
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
# React AI page sends findings, gateway forwards to ai-service → Gemini
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
# Frontend sends one finding (already carries finding_id from /api/analyze).
# Gateway calls ai-service, which internally branches on severity:
#   Low/Medium    → explanation + inline YAML snippet
#   High/Critical → full deployable YAML fix + independent validation
# Result is cached by finding_id so the download endpoint doesn't need to
# regenerate it, and so re-opening a finding shows the last generated fix.
@app.post("/api/ai/remediate")
async def remediate(body: dict):
    finding = body.get("finding")
    if not finding or "finding_id" not in finding:
        raise HTTPException(400, "body must include a finding with a finding_id")
    finding_id = finding["finding_id"]

    # ── CACHE READ: if we already generated this fix, return it instantly ──
    # (no Gemini call → no tokens, no wait, no rate-limit risk). Shared across
    # the whole team since Postgres is a shared Neon instance.
    db = get_session()
    try:
        cached = db.query(RemediationCache).filter_by(finding_id=finding_id).first()
        if cached and (cached.yaml_fix or cached.yaml_snippet):
            return {
                "mode":             cached.mode,
                "explanation":      cached.explanation,
                "yaml_snippet":     cached.yaml_snippet,
                "yaml_fix":         cached.yaml_fix,
                "validated":        cached.validated == "True",
                "validation_notes": cached.validation_notes,
                "cached":           True,
            }
    finally:
        db.close()

    async with httpx.AsyncClient(timeout=60) as client:
        try:
            r = await client.post(f"{AI_URL}/remediate", json={"finding": finding})
            r.raise_for_status()
            result = r.json()
        except httpx.ConnectError:
            raise HTTPException(503, "ai-service is not running")

    db = get_session()
    try:
        finding_id = finding["finding_id"]
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

    return result


# ── /api/ai/remediate/{finding_id}/download ─────────────────────────────────
# Returns the last-generated YAML fix for a finding as a downloadable file.
# Requires /api/ai/remediate to have been called for this finding at least once.
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
# Deep-dive chat scoped to one finding. Context = that finding's full detail.
# History persists across requests, keyed on finding_id.
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
        reply = await _call_ai_chat(context, history, message)
        _save_chat_turn(db, "finding", finding_id, "user", message)
        _save_chat_turn(db, "finding", finding_id, "assistant", reply)
    finally:
        db.close()

    return {"reply": reply}


# ── /api/ai/chat/cluster ────────────────────────────────────────────────────
# Cross-cutting chat scoped to the whole scan. Context = the scoring
# summary the frontend already has (top priorities, risk score, grade) —
# not the raw findings list, to keep every message's payload small.
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
        reply = await _call_ai_chat(context, history, message)
        _save_chat_turn(db, "cluster", scan_id, "user", message)
        _save_chat_turn(db, "cluster", scan_id, "assistant", reply)
    finally:
        db.close()

    return {"reply": reply}


# ── /api/health ───────────────────────────────────────────────────────────
# Quick check — frontend can poll this to show cluster connectivity status
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
# When deployed, the built React files sit in ../frontend/dist
# The gateway serves them directly so only one pod is needed
DIST = os.path.join(os.path.dirname(__file__), "..", "frontend", "dist")
if os.path.exists(DIST):
    app.mount("/assets", StaticFiles(directory=os.path.join(DIST, "assets")), name="assets")

    @app.get("/{full_path:path}")
    def serve_react(full_path: str):
        return FileResponse(os.path.join(DIST, "index.html"))