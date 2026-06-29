"""
analyzers/rbac/analyzer.py
===========================
RBAC Analyzer — orchestrates all RBAC rule checks.

Runs all 4 rule modules in sequence and returns a merged list of findings.
Each rule module is independent — a failure in one does not stop the others.

Usage:
    from analyzers.rbac.analyzer import analyze
    findings = analyze(rbac_v1)
"""

import logging
from kubernetes.client import RbacAuthorizationV1Api
from models.finding import Finding

from analyzers.rbac.rules import (
    wildcard_check,
    cluster_admin,
    privilege_esc,
    default_sa,
)

logger = logging.getLogger("rbac-analyzer")


def analyze(rbac_v1: RbacAuthorizationV1Api) -> list[Finding]:
    """
    Run all RBAC security checks against the live cluster.

    Args:
        rbac_v1: Kubernetes RbacAuthorizationV1Api client

    Returns:
        List of Finding objects sorted by score descending
    """
    findings = []

    # ── Run each rule module independently ────────────────────────────────
    checks = [
        ("Wildcard permission check",      wildcard_check),
        ("Cluster-admin binding check",    cluster_admin),
        ("Privilege escalation check",     privilege_esc),
        ("Default service account check",  default_sa),
    ]

    for name, module in checks:
        logger.info(f"Running RBAC: {name}")
        try:
            result = module.check(rbac_v1)
            findings.extend(result)
            logger.info(f"  → {len(result)} finding(s)")
        except Exception as e:
            logger.error(f"  → FAILED: {e}")
            # Continue — one failed rule should not block the rest

    # Sort by score descending so highest risk appears first
    findings.sort(key=lambda f: -f.score)

    logger.info(f"RBAC analysis complete: {len(findings)} total finding(s)")
    return findings