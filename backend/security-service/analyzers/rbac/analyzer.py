import logging
from kubernetes.client import RbacAuthorizationV1Api
from models.findings import Finding, make_finding

from analyzers.rbac.rules import (
    wildcard_check,
    cluster_admin,
    privilege_esc,
    default_sa,
)

logger = logging.getLogger("rbac-analyzer")


def analyze_rbac(rbac_v1: RbacAuthorizationV1Api) -> list[Finding]:
    findings = []

    # ── Run each rule module independently ────────────────────────────────
    checks = [
        ("Wildcard permission check",      wildcard_check),
        ("Cluster-admin binding check",    cluster_admin),
        ("Privilege escalation check",     privilege_esc),
        ("Default service account check",  default_sa),
    ]

    findings.sort(key=lambda f: -f.score)
    return findings