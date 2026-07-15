"""
scoring-service/app.py
======================
KubeShield Scoring Engine.

Pipeline (matches the architecture diagram):

    Findings
       │
       ▼  1. Dedupe + Blast Radius   -> collapse identical issues, remember spread
       ▼  2. Weighted Severity        -> base points per distinct issue
       ▼  3. Raw Risk Calculation     -> severity × sensitivity × breadth  (+ attack chains)
       ▼  4. Normalize (Soft Cap)     -> 0–100, e^ curve so big clusters don't all pin to 100
       ▼  5. Grade (A+ … F)
       ▼  Explanation + Attack Paths  -> the score explains itself

Why dedupe: a Deployment with 185 replicas reports the SAME misconfig 185 times.
That is one real problem, not 185. We count it once (full weight) and use the
count only as a small "how widespread" nudge — so the score reflects distinct
problems, weighted by where they live and whether they chain into an attack path.
"""

from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware
from pydantic import BaseModel
from typing import Any
import math
import re
import uvicorn

app = FastAPI(title="KubeShield Scoring Service")

app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_methods=["*"],
    allow_headers=["*"],
)


# ── Input model ───────────────────────────────────────────────────────────────
class FindingsInput(BaseModel):
    findings: list[dict[str, Any]]
    summary: dict[str, Any] = {}


# ══════════════════════════════════════════════════════════════════════════════
# CALIBRATION CONSTANTS
# ══════════════════════════════════════════════════════════════════════════════

# 1. Base points per severity (your spec)
SEVERITY_WEIGHTS = {"Critical": 10, "High": 7, "Medium": 4, "Low": 1}
SEVERITY_ORDER   = {"Critical": 0, "High": 1, "Medium": 2, "Low": 3}

# 2. Sensitivity multiplier — WHERE the problem lives matters, not just how bad.
#    RBAC / Secrets are "keys to the kingdom".
CATEGORY_WEIGHTS = {
    "Pod Security":     1.0,
    "Network":          1.1,
    "RBAC":             1.3,
    "Secrets":          1.3,
}

# 3. Breadth (blast radius): 1 + BREADTH_K * log10(affected_count)
#    1 pod -> ×1.00 | 10 -> ×1.50 | 100 -> ×2.00 | 185 -> ×2.13
#    Log-scaled so 185 replicas boost the score a little, never 185×.
BREADTH_K = 0.5

# 4. Attack-chain boost: each detected attack path adds +CHAIN_STEP, capped.
CHAIN_STEP = 0.20
CHAIN_CAP  = 1.60   # max ×1.60 total (i.e. +60%)

# 5. Soft-cap constant for the normalize curve: 100 * (1 - e^(-raw/K))
SOFT_CAP_K = 50

# Effort estimate per category (for the remediation checklist)
EFFORT = {
    "Pod Security":     "Low",     # single YAML field
    "Network":          "Low",     # service type / Ingress change
    "RBAC":             "Medium",  # policy review
    "Secrets":          "Medium",  # create K8s Secret objects
}

# security-service `module` values → scoring/UI category names
CATEGORY_FROM_MODULE = {
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


# ══════════════════════════════════════════════════════════════════════════════
# SCHEMA-TOLERANT FIELD ACCESSORS
# Findings may arrive as Schema A (severity/title/module/resource_name) or
# Schema B (Severity/Issue/check/resource). These read either.
# ══════════════════════════════════════════════════════════════════════════════

def _first(f: dict, *keys, default=""):
    for k in keys:
        v = f.get(k)
        if v not in (None, ""):
            return v
    return default

def f_severity(f: dict) -> str:
    return str(_first(f, "Severity", "severity", default="Low")).strip().capitalize()

def f_category(f: dict) -> str:
    raw = _first(f, "check", "module", "category", default="Unknown")
    return CATEGORY_FROM_MODULE.get(str(raw).strip().lower(), raw)

def f_issue(f: dict) -> str:
    return _first(f, "Issue", "title", "issue", default="Security finding")

def f_resource(f: dict) -> str:
    return _first(f, "resource", "resource_name", "Resource")

def f_namespace(f: dict) -> str:
    return _first(f, "namespace", "Namespace", default="cluster-wide")

def f_reco(f: dict) -> str:
    return _first(f, "Recommendation", "remediation_hint", "recommendation")


# ══════════════════════════════════════════════════════════════════════════════
# STAGE 1 — DEDUPE + BLAST RADIUS
# ══════════════════════════════════════════════════════════════════════════════

_QUOTED = re.compile(r"['\"][^'\"]*['\"]")   # strip 'names' inside titles
_DIGITS = re.compile(r"\d+")

def _issue_type(f: dict) -> str:
    """A stable label for 'the same kind of problem', with specific
    resource names/numbers stripped so replicas collapse together."""
    title = f_issue(f)
    cleaned = _QUOTED.sub("", title)          # ClusterRole 'x' has ... -> ClusterRole  has ...
    cleaned = _DIGITS.sub("", cleaned)
    cleaned = re.sub(r"\s+", " ", cleaned).strip()
    return cleaned or title

def group_findings(findings: list[dict]) -> list[dict]:
    """Collapse identical issues. Returns one row per distinct (issue_type, category)
    with: severity (worst seen), affected_count, sample resource, namespaces, reco."""
    groups: dict[tuple, dict] = {}
    for f in findings:
        cat = f_category(f)
        key = (_issue_type(f), cat)
        sev = f_severity(f)
        if key not in groups:
            groups[key] = {
                "issue":       f_issue(f),
                "category":    cat,
                "severity":    sev,
                "count":       0,
                "resources":   set(),
                "namespaces":  set(),
                "reco":        f_reco(f),
            }
        g = groups[key]
        g["count"] += 1
        g["resources"].add(f_resource(f) or "unknown")
        g["namespaces"].add(f_namespace(f))
        # keep the worst severity + a representative title/reco from it
        if SEVERITY_ORDER.get(sev, 9) < SEVERITY_ORDER.get(g["severity"], 9):
            g["severity"] = sev
            g["issue"]    = f_issue(f)
            g["reco"]     = f_reco(f)
    # finalise
    out = []
    for g in groups.values():
        g["resources"]  = sorted(g["resources"])
        g["namespaces"] = sorted(g["namespaces"])
        out.append(g)
    return out


def breadth_factor(count: int) -> float:
    if count <= 1:
        return 1.0
    return 1.0 + BREADTH_K * math.log10(count)


# ══════════════════════════════════════════════════════════════════════════════
# STAGE 3b — ATTACK-CHAIN DETECTION
# Approximate (findings carry limited linkage): correlate capabilities per
# namespace. When ingredients of a known attack path co-occur, boost the score.
# ══════════════════════════════════════════════════════════════════════════════

def detect_attack_paths(groups: list[dict]) -> list[dict]:
    """Return a list of detected attack paths: {name, why, namespace}."""
    # Which capabilities appear in each namespace
    caps_by_ns: dict[str, set] = {}
    for g in groups:
        cap = None
        if g["category"] == "Pod Security":     cap = "PRIV"      # root / privileged / esc
        elif g["category"] == "Secrets":        cap = "SECRET"    # secret exposure/access
        elif g["category"] == "RBAC":           cap = "RBAC_ESC"  # wildcard / cluster-admin
        elif g["category"] == "Network":        cap = "EXPOSURE"
        if not cap:
            continue
        for ns in g["namespaces"]:
            caps_by_ns.setdefault(ns, set()).add(cap)

    WHY = {
        "Privilege → credential theft":
            "A privileged or root workload sits alongside exposed secret access — "
            "an attacker who breaks into the pod could read those secrets.",
        "Exposed workload breakout":
            "An internet-reachable workload also runs as root or privileged — "
            "an attacker reaching it could break out onto the host.",
        "RBAC escalation → cluster takeover":
            "An over-permissive RBAC role is combined with workload or secret "
            "access — these can be chained together to take over the cluster.",
    }

    # Merge by path TYPE: one row per attack path, with every scope (namespace)
    # it was found in listed together — so the same path isn't repeated per namespace.
    scopes: dict[str, set] = {}
    for ns, caps in caps_by_ns.items():
        if "PRIV" in caps and "SECRET" in caps:
            scopes.setdefault("Privilege → credential theft", set()).add(ns)
        if "EXPOSURE" in caps and "PRIV" in caps:
            scopes.setdefault("Exposed workload breakout", set()).add(ns)
        if "RBAC_ESC" in caps and ("PRIV" in caps or "SECRET" in caps):
            scopes.setdefault("RBAC escalation → cluster takeover", set()).add(ns)

    return [
        {"name": name, "why": WHY[name], "namespace": ", ".join(sorted(ns_set))}
        for name, ns_set in scopes.items()
    ]


# ══════════════════════════════════════════════════════════════════════════════
# STAGE 4 — GRADE
# ══════════════════════════════════════════════════════════════════════════════

def score_to_grade(score: int) -> tuple[str, str]:
    if score <= 10:  return "A+", "Secure"
    if score <= 20:  return "A",  "Low Risk"
    if score <= 35:  return "B",  "Moderate Risk"
    if score <= 50:  return "C",  "Elevated Risk"
    if score <= 65:  return "D",  "High Risk"
    if score <= 80:  return "E",  "Severe Risk"
    return "F", "Critical Risk"

BADGE_COLORS = {
    "A+": "#16a34a", "A": "#22c55e", "B": "#84cc16", "C": "#f59e0b",
    "D": "#f97316",  "E": "#ea580c", "F": "#dc2626",
}


# ══════════════════════════════════════════════════════════════════════════════
# MAIN SCORING
# ══════════════════════════════════════════════════════════════════════════════

def compute(findings: list[dict]) -> dict:
    groups = group_findings(findings)

    # Empty / clean cluster
    if not groups:
        return {
            "risk_score": 0, "grade": "A+", "risk_level": "Secure",
            "weighted_total": 0.0, "breakdown": {}, "priorities": [],
            "attack_paths": [], "distinct_issues": 0,
            "chain_multiplier": 1.0,
        }

    # ── Stages 2 & 3: weighted severity × sensitivity × breadth, per distinct issue
    breakdown: dict[str, dict] = {}
    base_raw = 0.0
    scored_groups = []
    for g in groups:
        base   = SEVERITY_WEIGHTS.get(g["severity"], 1)
        sens   = CATEGORY_WEIGHTS.get(g["category"], 1.0)
        spread = breadth_factor(g["count"])
        impact = base * sens * spread
        base_raw += impact
        g = {**g, "impact": impact}
        scored_groups.append(g)

        cat = g["category"]
        b = breakdown.setdefault(cat, {"findings_count": 0, "distinct_issues": 0, "raw_score": 0.0,
                                       "Critical": 0, "High": 0, "Medium": 0, "Low": 0})
        b["findings_count"] += g["count"]        # raw count (matches Findings page)
        b["distinct_issues"] += 1
        b["raw_score"] += impact
        if g["severity"] in b:
            b[g["severity"]] += 1

    # ── Stage 3b: attack-chain boost
    attack_paths = detect_attack_paths(groups)
    chain_multiplier = min(1.0 + CHAIN_STEP * len(attack_paths), CHAIN_CAP)
    total_raw = base_raw * chain_multiplier

    # ── Stage 4: normalize (soft cap) + grade
    risk_score = int(min(100, 100 * (1 - math.exp(-total_raw / SOFT_CAP_K))))
    grade, risk_level = score_to_grade(risk_score)

    for b in breakdown.values():
        b["raw_score"] = round(b["raw_score"], 1)

    # ── Priorities: distinct issues ranked by impact
    scored_groups.sort(key=lambda g: -g["impact"])
    priorities = []
    for rank, g in enumerate(scored_groups, start=1):
        n = g["count"]
        where = g["resources"][0] if g["resources"] else "unknown"
        if n > 1:
            where = f"{n} resources affected"
        priorities.append({
            "rank":           rank,
            "check":          g["category"],
            "resource":       where,
            "Issue":          g["issue"],
            "Severity":       g["severity"],
            "Recommendation": g["reco"],
            "effort":         EFFORT.get(g["category"], "Medium"),
            "impact_score":   round(g["impact"], 1),
            "affected_count": n,
        })

    return {
        "risk_score": risk_score, "grade": grade, "risk_level": risk_level,
        "weighted_total": round(total_raw, 1), "breakdown": breakdown,
        "priorities": priorities, "attack_paths": attack_paths,
        "distinct_issues": len(groups), "chain_multiplier": round(chain_multiplier, 2),
    }


def build_explanation(res: dict, total_findings: int, counts: dict) -> str:
    if res["distinct_issues"] == 0:
        return "No security findings — cluster looks clean."

    crit_high = (counts.get("Critical", 0) or 0) + (counts.get("High", 0) or 0)
    top = res["priorities"][0]
    n = top.get("affected_count", 1)
    res_word = "resource" if n == 1 else "resources"

    msg = (f"Grade {res['grade']} due to {total_findings} findings across "
           f"{res['distinct_issues']} distinct security issue(s).")
    if crit_high:
        verb = "finding is" if crit_high == 1 else "findings are"
        msg += f" {crit_high} {verb} Critical or High severity."
    msg += f" The highest-impact issue, \"{top['Issue']}\", affects {n} {res_word}"
    if res["attack_paths"]:
        names = "; ".join(sorted({p["name"] for p in res["attack_paths"]}))
        msg += f", and an attack path to potential compromise was detected: {names}."
    else:
        msg += "."
    return msg


# ══════════════════════════════════════════════════════════════════════════════
# ENDPOINT
# ══════════════════════════════════════════════════════════════════════════════

@app.post("/score")
def score(body: FindingsInput):
    findings = body.findings
    res = compute(findings)

    # Unique objects with at least one finding: (namespace, resource) pairs.
    # e.g. Pod A with root + privileged = 2 findings but counts as 1 resource.
    resources_affected = len({(f_namespace(f), f_resource(f)) for f in findings})

    # Severity counts over RAW findings (so the pie chart matches the Findings page)
    counts = body.summary.get("by_severity") or {
        "Critical": sum(1 for f in findings if f_severity(f) == "Critical"),
        "High":     sum(1 for f in findings if f_severity(f) == "High"),
        "Medium":   sum(1 for f in findings if f_severity(f) == "Medium"),
        "Low":      sum(1 for f in findings if f_severity(f) == "Low"),
    }

    return {
        # ── fields the existing Score.jsx already reads ──
        "risk_score":       res["risk_score"],
        "grade":            res["grade"],
        "risk_level":       res["risk_level"],
        "badge_color":      BADGE_COLORS.get(res["grade"], "#6b7280"),
        "breakdown":        res["breakdown"],
        "weighted_total":   res["weighted_total"],
        "severity_counts":  counts,
        "top_priorities":   res["priorities"][:5],
        "all_priorities":   res["priorities"],
        "total_findings":   len(findings),
        "checks_evaluated": list(res["breakdown"].keys()),
        # ── new signals (additive; UI shows them if present) ──
        "resources_affected": resources_affected,
        "distinct_issues":  res["distinct_issues"],
        "attack_paths":     res["attack_paths"],
        "chain_multiplier": res["chain_multiplier"],
        "explanation":      build_explanation(res, len(findings), counts),
    }


@app.get("/health")
def health():
    return {"status": "ok", "service": "scoring-service"}


if __name__ == "__main__":
    uvicorn.run(app, host="0.0.0.0", port=8001)
