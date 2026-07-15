"""
KubeShield Gateway
------------------
This is the ONLY service the React frontend talks to.
It receives requests from the browser and forwards them
to the correct microservice internally.

Runs on port 8000.
"""

from fastapi import FastAPI, UploadFile, File, HTTPException
from fastapi.middleware.cors import CORSMiddleware
from fastapi.staticfiles import StaticFiles
from fastapi.responses import FileResponse
import httpx
import os

app = FastAPI(title="KubeShield Gateway")

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
# React frontend calls this when user clicks "Start live cluster scan"
# Gateway → ingestion-service → returns parsed resources
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
# React frontend calls this when user uploads a YAML file
# Gateway → ingestion-service → PyYAML parse → returns parsed resources
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


# ── Finding normalization ──────────────────────────────────────────────────
# The security-service can emit findings in two shapes depending on the build:
#   Schema A (repo source): severity / title / module / resource_name /
#                           evidence / remediation_hint
#   Schema B (frontend):    Severity / Issue  / check  / resource /
#                           Detail   / Recommendation
# The React pages (Findings/Score/AIAdvice) and scoring-service both read
# Schema B, so we normalize every finding to a Schema-B superset here. This
# makes the whole pipeline work regardless of which security image is deployed.

# security-service module name → scoring/UI category name
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
        # Schema A (kept for the AI-service Finding model)
        "severity":       severity,
        "module":         _pick(f, "module", default=module_raw),
        "title":          issue,
        "resource_name":  resource,
        "evidence":       detail,
        "remediation_hint": reco,
    }


# ── /api/analyze ──────────────────────────────────────────────────────────
# After ingestion, the frontend triggers analysis
# Gateway → security-service /analyze → scoring-service /score → combined response
@app.post("/api/analyze")
async def analyze(body: dict):
    # Security scans the LIVE cluster itself (via the kubeconfig mounted into its
    # container), so ONE call returns every finding across all modules — RBAC,
    # Pod, Secrets, Network. The frontend still sends {resources}/{yaml_content},
    # but we no longer forward them per-resource; security reads the cluster
    # directly. Live scan is the primary path; YAML upload is a fallback.
    async with httpx.AsyncClient(timeout=180) as client:
        try:
            sec_r = await client.post(f"{SECURITY_URL}/analyze", json={})
        except httpx.ConnectError:
            raise HTTPException(503, "security-service is not running")
        except httpx.HTTPError as e:
            raise HTTPException(502, f"security-service request failed: {e}")

    if sec_r.status_code != 200:
        raise HTTPException(502, f"security-service error: {sec_r.text[:300]}")

    result = sec_r.json()

    # Normalize every finding so the UI, scoring, and AI all agree on field names
    findings     = [normalize_finding(f) for f in result.get("findings", [])]
    by_severity  = result.get("by_severity") or {}
    by_module    = result.get("by_module") or {}
    cluster_info = result.get("cluster_info") or {}
    analyzed     = len(findings)
    skipped      = 0

    # ── Call scoring-service to get the real risk score ──────────────────────
    # A scoring failure must not break the scan — fall back to a null score.
    score: dict = {"risk_score": None}
    async with httpx.AsyncClient(timeout=30) as client:
        try:
            score_r = await client.post(
                f"{SCORING_URL}/score",
                json={"findings": findings, "summary": {"by_severity": by_severity}},
            )
            if score_r.status_code == 200:
                score = score_r.json()
        except httpx.HTTPError:
            pass  # scoring-service down/unreachable — keep the null score

    return {
        "findings":     findings,
        "cluster_info": cluster_info,
        "total_issues": len(findings),
        "analyzed":     analyzed,
        "skipped":      skipped,
        "by_severity":  by_severity,
        "by_module":    by_module,
        "score":        score,
    }

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
