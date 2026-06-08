"""
ai-service — KubeShield AI
POST /explain  →  Gemini-powered remediation explanation
POST /health   →  liveness probe
"""

import os
import json
import logging
from typing import Optional
import google.generativeai as genai
from fastapi import FastAPI, HTTPException
from fastapi.middleware.cors import CORSMiddleware
from pydantic import BaseModel

logging.basicConfig(level=logging.INFO)
logger = logging.getLogger("ai-service")

# ── Gemini setup (API key injected via k8s Secret as env var) ──────────────
GEMINI_API_KEY = os.environ.get("GEMINI_API_KEY")
if not GEMINI_API_KEY:
    logger.warning("GEMINI_API_KEY not set — /explain will return mock responses")
else:
    genai.configure(api_key=GEMINI_API_KEY)
    logger.info("Gemini configured successfully")

app = FastAPI(
    title="KubeShield AI Service",
    description="LLM-powered remediation explanation for Kubernetes security findings",
    version="1.0.0",
)

app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_methods=["*"],
    allow_headers=["*"],
)


# ── Pydantic models ────────────────────────────────────────────────────────

class Finding(BaseModel):
    id: str
    title: str
    severity: str          # CRITICAL / HIGH / MEDIUM / LOW
    module: str            # rbac / pod / secret / service
    resource_name: str
    namespace: Optional[str] = "default"
    evidence: Optional[str] = ""
    score: Optional[float] = 0.0


class ExplainRequest(BaseModel):
    findings: list[Finding]
    cluster_context: Optional[str] = "production Kubernetes cluster"


class ExplainResponse(BaseModel):
    explanation: str
    remediation: list[str]
    examples: list[str]
    severity_summary: str
    findings_count: int


# ── Prompt builder ─────────────────────────────────────────────────────────

def build_prompt(findings: list[Finding], cluster_context: str) -> str:
    findings_text = ""
    for i, f in enumerate(findings, 1):
        findings_text += f"""
Finding {i}:
  - Title: {f.title}
  - Severity: {f.severity}
  - Module: {f.module}
  - Resource: {f.resource_name} (namespace: {f.namespace})
  - Risk Score: {f.score}/10
  - Evidence: {f.evidence or 'N/A'}
"""

    return f"""You are a Kubernetes security expert. Analyze the following security findings from a {cluster_context} and provide:

1. A concise overall explanation of what these findings mean for the cluster's security posture (2-3 sentences, plain English for a DevOps engineer).
2. A prioritized remediation checklist (ordered from most critical to least).
3. 2-3 concrete YAML examples showing the secure configuration for the most critical finding.
4. A one-sentence severity summary.

FINDINGS:
{findings_text}

Respond ONLY in this exact JSON format (no markdown, no extra text):
{{
  "explanation": "<2-3 sentence plain English summary>",
  "remediation": [
    "<step 1 — most critical>",
    "<step 2>",
    "<step 3>",
    "<step N>"
  ],
  "examples": [
    "<YAML example 1 as a single string with \\n newlines>",
    "<YAML example 2 as a single string>"
  ],
  "severity_summary": "<one sentence>"
}}"""


# ── Mock response (when no API key) ───────────────────────────────────────

def mock_response(findings: list[Finding]) -> ExplainResponse:
    modules = list(set(f.module for f in findings))
    severities = list(set(f.severity for f in findings))
    return ExplainResponse(
        explanation=(
            f"Your cluster has {len(findings)} security finding(s) across "
            f"{', '.join(modules)} module(s). The most critical issues involve "
            f"{severities[0] if severities else 'unknown'} severity misconfigurations "
            "that could allow privilege escalation or unauthorized data access. "
            "Immediate remediation is recommended before production deployment."
        ),
        remediation=[
            "Remove wildcard (*) permissions from all non-system RoleBindings",
            "Set runAsNonRoot: true and runAsUser: 1000 in all pod securityContexts",
            "Replace base64-encoded secrets in env vars with secretKeyRef references",
            "Add NetworkPolicy resources to restrict service exposure",
            "Audit cluster-admin bindings and remove unnecessary assignments",
        ],
        examples=[
            "# Secure pod securityContext\napiVersion: v1\nkind: Pod\nspec:\n  securityContext:\n    runAsNonRoot: true\n    runAsUser: 1000\n    fsGroup: 2000\n  containers:\n  - name: app\n    securityContext:\n      allowPrivilegeEscalation: false\n      readOnlyRootFilesystem: true\n      capabilities:\n        drop: [ALL]",
            "# Secure secret reference (not hardcoded)\nenv:\n- name: DB_PASSWORD\n  valueFrom:\n    secretKeyRef:\n      name: db-credentials\n      key: password",
        ],
        severity_summary=(
            f"This cluster has {len(findings)} active security finding(s) "
            "requiring immediate attention to prevent privilege escalation and data exposure."
        ),
        findings_count=len(findings),
    )


# ── Routes ─────────────────────────────────────────────────────────────────

@app.get("/health")
def health():
    return {"status": "ok", "service": "ai-service", "gemini_configured": bool(GEMINI_API_KEY)}


@app.post("/explain", response_model=ExplainResponse)
async def explain(req: ExplainRequest):
    if not req.findings:
        raise HTTPException(status_code=400, detail="No findings provided")

    if len(req.findings) > 50:
        raise HTTPException(status_code=400, detail="Max 50 findings per request")

    # Use mock when no API key (dev mode)
    if not GEMINI_API_KEY:
        logger.info("Using mock response (no GEMINI_API_KEY)")
        return mock_response(req.findings)

    try:
        model = genai.GenerativeModel("gemini-1.5-flash")
        prompt = build_prompt(req.findings, req.cluster_context)
        logger.info(f"Calling Gemini for {len(req.findings)} findings")

        response = model.generate_content(
            prompt,
            generation_config=genai.GenerationConfig(
                temperature=0.2,
                max_output_tokens=2048,
            ),
        )

        raw = response.text.strip()
        # Strip markdown code fences if Gemini wraps in ```json
        if raw.startswith("```"):
            raw = raw.split("```")[1]
            if raw.startswith("json"):
                raw = raw[4:]
        raw = raw.strip()

        data = json.loads(raw)
        return ExplainResponse(
            explanation=data.get("explanation", ""),
            remediation=data.get("remediation", []),
            examples=data.get("examples", []),
            severity_summary=data.get("severity_summary", ""),
            findings_count=len(req.findings),
        )

    except json.JSONDecodeError as e:
        logger.error(f"JSON parse error from Gemini: {e}")
        logger.error(f"Raw response: {response.text[:500]}")
        # Fallback to mock on parse failure
        return mock_response(req.findings)

    except Exception as e:
        logger.error(f"Gemini API error: {e}")
        raise HTTPException(status_code=502, detail=f"AI service error: {str(e)}")
