"""
ai-service — KubeShield AI
POST /explain  →  Gemini-powered remediation explanation
POST /health   →  liveness probe
"""

import os
import json
import logging
from typing import Optional
from dotenv import load_dotenv
import google.generativeai as genai
from fastapi import FastAPI, HTTPException
from fastapi.middleware.cors import CORSMiddleware
from pydantic import BaseModel

load_dotenv()

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

1. A concise overall explanation of what these findings mean for the cluster's security posture (plain English for a DevOps engineer).
2. A prioritized remediation checklist (ordered from most critical to least).
3. Few concrete YAML examples showing the secure configuration for the most critical finding.
4. And a suitable severity summary.

FINDINGS:
{findings_text}

Respond ONLY in this exact JSON format (no markdown, no extra text):
{{
  "explanation": "<Plain English summary>",
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

    if not GEMINI_API_KEY:
        raise HTTPException(503, "GEMINI_API_KEY is not configured — AI explanations are unavailable")

    try:
        model = genai.GenerativeModel("gemini-3.5-flash")
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
        raise HTTPException(502, "AI service returned an unparseable response")

# ── Per-finding remediation (severity-gated) ────────────────────────────────
HIGH_CRIT = {"High", "Critical", "HIGH", "CRITICAL"}


class RemediateRequest(BaseModel):
    finding: Finding
    cluster_context: Optional[str] = "production Kubernetes cluster"


class RemediateResponse(BaseModel):
    mode: str                      # "explain" | "fix"
    explanation: str
    yaml_snippet: Optional[str] = None   # Low/Medium
    yaml_fix: Optional[str] = None       # High/Critical — full deployable manifest
    validated: Optional[bool] = None     # High/Critical only
    validation_notes: Optional[str] = None


def _explain_prompt(f: Finding, cluster_context: str) -> str:
    return f"""You are a Kubernetes security expert. A {cluster_context} has this finding:

Title: {f.title}
Severity: {f.severity}
Module: {f.module}
Resource: {f.resource_name} (namespace: {f.namespace})
Evidence: {f.evidence or 'N/A'}

Respond ONLY in this exact JSON format (no markdown, no extra text):
{{
  "explanation": "<Plain English summary>",
  "yaml_snippet": "<a short YAML snippet showing the fixed field(s), as a single string with \\n newlines>"
}}"""


def _fix_prompt(f: Finding, cluster_context: str) -> str:
    return f"""You are a Kubernetes security expert. A {cluster_context} has this finding:

Title: {f.title}
Severity: {f.severity}
Module: {f.module}
Resource: {f.resource_name} (namespace: {f.namespace})
Evidence: {f.evidence or 'N/A'}

Generate a complete, corrected, directly deployable Kubernetes YAML manifest
that fixes this specific issue for this specific resource.

Respond ONLY in this exact JSON format (no markdown, no extra text):
{{
  "explanation": "<Plain English summary>",
  "yaml_fix": "<the complete corrected manifest as a single string with \\n newlines>"
}}"""


def _validate_prompt(f: Finding, yaml_fix: str) -> str:
    return f"""You are reviewing a proposed Kubernetes fix, independently — you did not write it.

Original finding: {f.title} (severity: {f.severity}, resource: {f.resource_name})
Evidence: {f.evidence or 'N/A'}

Proposed fix:
{yaml_fix}

Check: (a) is this syntactically valid Kubernetes YAML, (b) does it actually
resolve the specific finding described, (c) does it introduce any new risk.

Respond ONLY in this exact JSON format (no markdown, no extra text):
{{
  "validated": <true or false>,
  "notes": "<one or two sentences explaining your verdict>"
}}"""


def _call_gemini_json(prompt: str) -> dict:
    model = genai.GenerativeModel("gemini-3.5-flash")
    response = model.generate_content(
        prompt,
        generation_config=genai.GenerationConfig(temperature=0.2, max_output_tokens=2048),
    )
    raw = response.text.strip()
    if raw.startswith("```"):
        raw = raw.split("```")[1]
        if raw.startswith("json"):
            raw = raw[4:]
    return json.loads(raw.strip())


@app.post("/remediate", response_model=RemediateResponse)
async def remediate(req: RemediateRequest):
    f = req.finding
    high_priority = f.severity in HIGH_CRIT

    if not GEMINI_API_KEY:
        raise HTTPException(503, "GEMINI_API_KEY is not configured — AI remediation is unavailable")
    
    try:
        if not high_priority:
            data = _call_gemini_json(_explain_prompt(f, req.cluster_context))
            return RemediateResponse(
                mode="explain",
                explanation=data.get("explanation", ""),
                yaml_snippet=data.get("yaml_snippet"),
            )

        fix_data = _call_gemini_json(_fix_prompt(f, req.cluster_context))
        yaml_fix = fix_data.get("yaml_fix", "")

        # Independent second call — fresh context, no reasoning carried over
        validation = _call_gemini_json(_validate_prompt(f, yaml_fix))

        return RemediateResponse(
            mode="fix",
            explanation=fix_data.get("explanation", ""),
            yaml_fix=yaml_fix,
            validated=validation.get("validated", False),
            validation_notes=validation.get("notes", ""),
        )
    except json.JSONDecodeError as e:
        logger.error(f"JSON parse error from Gemini in /remediate: {e}")
        raise HTTPException(502, "AI service returned an unparseable response")
    except Exception as e:
        _raise_ai_error(e, "/remediate")


def _raise_ai_error(e: Exception, endpoint: str):
    msg = str(e)
    logger.error(f"Gemini API error in {endpoint}: {msg}")
    if "429" in msg or "quota" in msg.lower() or "ResourceExhausted" in type(e).__name__:
        raise HTTPException(
            429,
            "Gemini API daily quota reached (free tier is capped at a small "
            "number of requests/day). Try again later, or use a paid API key "
            "for higher limits.",
        )
    raise HTTPException(502, f"AI service error: {msg}")


# ── Grounded chat ────────────────────────────────────────────────────────────
class ChatMessage(BaseModel):
    role: str       # "user" | "assistant"
    content: str


class ChatRequest(BaseModel):
    context: str                     # pre-built context string (finding detail or cluster summary)
    chat_history: list[ChatMessage] = []
    message: str


class ChatResponse(BaseModel):
    reply: str


@app.post("/chat", response_model=ChatResponse)
async def chat(req: ChatRequest):
    if not GEMINI_API_KEY:
        raise HTTPException(503, "GEMINI_API_KEY is not configured — AI chat is unavailable")

    system_preamble = (
        "You are a Kubernetes security assistant for the KubeShield tool. "
        "Answer only using the context provided below — don't invent cluster "
        "details that aren't given to you. Be concise and practical.\n\n"
        f"CONTEXT:\n{req.context}"
    )

    try:
        model = genai.GenerativeModel("gemini-3.5-flash", system_instruction=system_preamble)
        history = [{"role": ("model" if m.role == "assistant" else "user"), "parts": [m.content]}
                   for m in req.chat_history]
        convo = model.start_chat(history=history)
        response = convo.send_message(req.message)
        return ChatResponse(reply=response.text.strip())
    except Exception as e:
        _raise_ai_error(e, "/chat")