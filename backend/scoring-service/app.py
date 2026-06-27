from fastapi import FastAPI
from pydantic import BaseModel
from typing import Any
import uvicorn

app = FastAPI(title="KubeShield Scoring Service")

# ── Input model ───────────────────────────────────────────────────────────────
class FindingsInput(BaseModel):
    findings: list[dict[str, Any]]
    summary: dict[str, Any] = {}

# ── Scoring weights per severity ──────────────────────────────────────────────
SEVERITY_WEIGHTS = {
    "Critical": 25,
    "High":     15,
    "Medium":    7,
    "Low":       2,
}

# Per-check category multipliers (some checks matter more than others)
CHECK_MULTIPLIERS = {
    "Pod Security":      1.0,
    "RBAC":              1.2,   # misconfig here = full cluster compromise
    "Secrets":           1.3,   # hardcoded creds = instant breach
    "Service Exposure":  1.1,
}

MAX_SCORE = 100

# ── Scoring logic ─────────────────────────────────────────────────────────────
def calculate_score(findings: list[dict]) -> dict:
    if not findings:
        return {
            "risk_score": 0,
            "grade": "A",
            "risk_level": "Secure",
            "breakdown": {},
            "weighted_total": 0,
        }

    # Per-check breakdown
    breakdown: dict[str, dict] = {}
    weighted_total = 0.0

    for f in findings:
        check = f.get("check", "Unknown")
        severity = f.get("Severity", "Low")

        base  = SEVERITY_WEIGHTS.get(severity, 2)
        mult  = CHECK_MULTIPLIERS.get(check, 1.0)
        score = base * mult

        weighted_total += score

        if check not in breakdown:
            breakdown[check] = {
                "findings_count": 0,
                "raw_score": 0.0,
                "Critical": 0, "High": 0, "Medium": 0, "Low": 0,
            }
        breakdown[check]["findings_count"] += 1
        breakdown[check]["raw_score"]      += score
        breakdown[check][severity]         += 1

    # Normalise to 0-100 using a soft cap curve so a single Critical
    # doesn't immediately pin the score to 100.
    # Formula: score = 100 * (1 - e^(-weighted_total / 60))
    # This gives:
    #   1 Critical  (~25pts)  → ~34
    #   2 Criticals (~50pts)  → ~57
    #   4 Criticals (~100pts) → ~81
    #   8 Criticals (~200pts) → ~96
    import math
    normalised = int(100 * (1 - math.exp(-weighted_total / 60)))
    normalised = min(normalised, MAX_SCORE)

    grade, risk_level = score_to_grade(normalised)

    # Round breakdown raw scores for display
    for v in breakdown.values():
        v["raw_score"] = round(v["raw_score"], 1)

    return {
        "risk_score":    normalised,
        "grade":         grade,
        "risk_level":    risk_level,
        "breakdown":     breakdown,
        "weighted_total": round(weighted_total, 1),
    }

def score_to_grade(score: int) -> tuple[str, str]:
    if score == 0:
        return "A+", "Secure"
    elif score <= 15:
        return "A",  "Low Risk"
    elif score <= 30:
        return "B",  "Moderate Risk"
    elif score <= 50:
        return "C",  "Elevated Risk"
    elif score <= 70:
        return "D",  "High Risk"
    else:
        return "F",  "Critical Risk"

# ── Remediation priorities ────────────────────────────────────────────────────
def prioritise_remediations(findings: list[dict]) -> list[dict]:
    """
    Return findings sorted by impact (severity + check multiplier),
    each annotated with a priority rank and effort estimate.
    """
    EFFORT = {
        "Pod Security":      "Low",    # single YAML field change
        "RBAC":              "Medium", # requires policy review
        "Secrets":           "Medium", # need to create K8s Secret objects
        "Service Exposure":  "Low",    # service type / Ingress change
    }

    scored = []
    for f in findings:
        sev   = f.get("Severity", "Low")
        check = f.get("check", "Unknown")
        impact = SEVERITY_WEIGHTS.get(sev, 2) * CHECK_MULTIPLIERS.get(check, 1.0)
        scored.append({**f, "_impact": impact})

    scored.sort(key=lambda x: -x["_impact"])

    priorities = []
    for rank, f in enumerate(scored, start=1):
        priorities.append({
            "rank":           rank,
            "check":          f.get("check"),
            "resource":       f.get("resource"),
            "Issue":          f.get("Issue"),
            "Severity":       f.get("Severity"),
            "Recommendation": f.get("Recommendation"),
            "effort":         EFFORT.get(f.get("check", ""), "Medium"),
            "impact_score":   round(f["_impact"], 1),
        })

    return priorities

# ── Risk badge helper ─────────────────────────────────────────────────────────
BADGE_COLORS = {
    "A+": "#16a34a",   # green-600
    "A":  "#22c55e",   # green-500
    "B":  "#84cc16",   # lime-500
    "C":  "#f59e0b",   # amber-500
    "D":  "#f97316",   # orange-500
    "F":  "#dc2626",   # red-600
}

# ── Endpoint ──────────────────────────────────────────────────────────────────
@app.post("/score")
def score(body: FindingsInput):
    findings = body.findings

    scoring   = calculate_score(findings)
    priorities = prioritise_remediations(findings)

    counts = body.summary.get("by_severity", {
        "Critical": sum(1 for f in findings if f.get("Severity") == "Critical"),
        "High":     sum(1 for f in findings if f.get("Severity") == "High"),
        "Medium":   sum(1 for f in findings if f.get("Severity") == "Medium"),
        "Low":      sum(1 for f in findings if f.get("Severity") == "Low"),
    })

    return {
        "risk_score":       scoring["risk_score"],
        "grade":            scoring["grade"],
        "risk_level":       scoring["risk_level"],
        "badge_color":      BADGE_COLORS.get(scoring["grade"], "#6b7280"),
        "breakdown":        scoring["breakdown"],
        "weighted_total":   scoring["weighted_total"],
        "severity_counts":  counts,
        "top_priorities":   priorities[:5],    # top-5 for dashboard quick-view
        "all_priorities":   priorities,
        "total_findings":   len(findings),
        "checks_evaluated": list(scoring["breakdown"].keys()),
    }

@app.get("/health")
def health():
    return {"status": "ok", "service": "scoring-service"}


if __name__ == "__main__":
    uvicorn.run(app, host="0.0.0.0", port=8001)