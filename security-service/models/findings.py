from pydantic import BaseModel, field_validator
from typing import Literal

class Finding(BaseModel):
    id: str
    # human readable: "Wildcard permissions on ClusterRole"
    title: str
    # EXACTLY one of: Critical / High / Medium / Low
    severity: Literal["Critical", "High", "Medium", "Low"]
    # EXACTLY one of: RBAC / Pod / Secrets / Network
    module: Literal["RBAC", "Pod", "Secrets", "Network"]
    # what k8s resource triggered this: "admin-role", "nginx-pod"
    resource_name: str
    # which namespace
    namespace: str = "cluster-wide"
    # what was found: "verbs: [*], resources: [*]"
    evidence: str = ""
    # numeric risk: 0.0 to 10.0
    score: float = 0.0
    # one line fix suggestion
    remediation_hint: str = ""

    @field_validator("score")
    @classmethod
    def score_range(cls, v):
        if not 0.0 <= v <= 10.0:
            raise ValueError("score must be between 0.0 and 10.0")
        return round(v, 1)

    @field_validator("severity")
    @classmethod
    def severity_case(cls, v):
        # Accept any case — normalize to title case
        normalized = v.strip().capitalize()
        allowed = {"Critical", "High", "Medium", "Low"}
        if normalized not in allowed:
            raise ValueError(f"severity must be one of {allowed}")
        return normalized

    @field_validator("module")
    @classmethod
    def module_case(cls, v):
        # Accept any case — normalize to standard
        mapping = {
            "rbac": "RBAC",
            "pod": "Pod",
            "pods": "Pod",
            "secret": "Secrets",
            "secrets": "Secrets",
            "network": "Network",
            "networking": "Network",
            "service exposure": "Network",
        }
        normalized = mapping.get(v.strip().lower(), v)
        allowed = {"RBAC", "Pod", "Secrets", "Network"}
        if normalized not in allowed:
            raise ValueError(f"module must be one of {allowed}")
        return normalized


#auto-assign based on severity
SEVERITY_DEFAULT_SCORES = {
    "Critical": 9.0,
    "High":     7.0,
    "Medium":   5.0,
    "Low":      3.0,
}

def make_finding(
    id: str,
    title: str,
    severity: str,
    module: str,
    resource_name: str,
    namespace: str = "cluster-wide",
    evidence: str = "",
    score: float = None,
    remediation_hint: str = "",
) -> Finding:
    """
    Helper function for developers to create findings without
    manually setting score every time.

    Usage:
        from models.finding import make_finding

        f = make_finding(
            id="RBAC-001",
            title="Wildcard permissions on ClusterRole",
            severity="Critical",
            module="RBAC",
            resource_name="cluster-admin",
            evidence="verbs: [*], resources: [*]",
            remediation_hint="Replace wildcards with specific verbs",
        )
    """
    if score is None:
        score = SEVERITY_DEFAULT_SCORES.get(severity.capitalize(), 5.0)

    return Finding(
        id=id,
        title=title,
        severity=severity,
        module=module,
        resource_name=resource_name,
        namespace=namespace,
        evidence=evidence,
        score=score,
        remediation_hint=remediation_hint,
    )