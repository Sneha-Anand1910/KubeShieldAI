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


# ── /api/analyze ──────────────────────────────────────────────────────────
# After ingestion, the frontend triggers analysis
# Gateway → security-service /analyze → scoring-service /score → combined response
@app.post("/api/analyze")
async def analyze(body: dict):
    async with httpx.AsyncClient(timeout=30) as client:
        # Step 1 — security-service
        try:
            kubeconfig_path = os.path.expanduser("~/.kube/config")
            with open(kubeconfig_path, "r") as f:
                kubeconfig_str = f.read()

            sec_r = await client.post(
                f"{SECURITY_URL}/analyze",
                json={"kubeconfig_content": kubeconfig_str}
            )
            sec_r.raise_for_status()
            security_result = sec_r.json()
        except httpx.ConnectError:
            raise HTTPException(503, "security-service is not running")

        # Step 2 — scoring-service
        # ── Scoring bypassed for now ──────────────────────────────
        # try:
        #     score_r = await client.post(f"{SCORING_URL}/score", ...)
        #     scoring_result = score_r.json()
        # except httpx.ConnectError:
        #     raise HTTPException(503, "scoring-service is not running")

    # Step 3 — return combined result to frontend
    return {
        "findings":     security_result["findings"],
        "cluster_info": security_result.get("cluster_info", {}),
        "total_issues": security_result.get("total_issues", 0),
        "by_severity":  security_result.get("by_severity", {}),
        "by_module":    security_result.get("by_module", {}),
        "score":        None,
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
