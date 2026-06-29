"""
analyzers/rbac/rules/privilege_esc.py
======================================
Detects privilege escalation paths via RBAC.

Rules:
    RBAC-ESC-001  Role can modify RBAC resources (can grant itself more permissions)
    RBAC-ESC-002  Role allows pod exec (shell access to any container)
    RBAC-ESC-003  Role allows listing all Secrets cluster-wide
    RBAC-ESC-004  Role allows impersonating users or service accounts
"""

from kubernetes.client import RbacAuthorizationV1Api
from models.finding import Finding, make_finding

SYSTEM_PREFIXES = ["system:", "kubeadm:", "calico", "flannel"]

# Verbs that allow modifying RBAC = self-escalation
DANGEROUS_RBAC_VERBS = {"create", "update", "patch", "delete", "*"}

# RBAC resources — modifying these = escalation
RBAC_RESOURCES = {
    "roles",
    "clusterroles",
    "rolebindings",
    "clusterrolebindings",
}


def is_system_role(name: str) -> bool:
    return any(name.startswith(p) for p in SYSTEM_PREFIXES)


def check(rbac_v1: RbacAuthorizationV1Api) -> list[Finding]:
    findings = []
    counter = 1

    cluster_roles = rbac_v1.list_cluster_role()

    for cr in cluster_roles.items:
        name = cr.metadata.name

        if is_system_role(name):
            continue

        if not cr.rules:
            continue

        for rule in cr.rules:
            verbs     = set(rule.verbs     or [])
            resources = set(rule.resources or [])

            # ── Rule 1: Can modify RBAC = can grant itself more power ──
            can_modify_rbac = (
                bool(verbs.intersection(DANGEROUS_RBAC_VERBS)) and
                bool(resources.intersection(RBAC_RESOURCES))
            )
            if can_modify_rbac:
                affected = sorted(resources.intersection(RBAC_RESOURCES))
                findings.append(make_finding(
                    id=f"RBAC-ESC-{counter:03d}",
                    title=(
                        f"ClusterRole '{name}' can modify RBAC resources "
                        f"— privilege escalation risk"
                    ),
                    severity="High",
                    module="RBAC",
                    resource_name=name,
                    namespace="cluster-wide",
                    evidence=(
                        f"verbs: {sorted(verbs)} on RBAC resources: "
                        f"{affected} — holder can grant themselves "
                        f"additional cluster permissions"
                    ),
                    score=8.2,
                    remediation_hint=(
                        "Remove create/update/patch permissions on RBAC "
                        "resources unless this is an intentional admin role. "
                        "Roles that can modify RBAC can escalate privileges."
                    ),
                ))
                counter += 1

            # ── Rule 2: Pod exec = shell in any container ──────────────
            if "create" in verbs and "pods/exec" in resources:
                findings.append(make_finding(
                    id=f"RBAC-ESC-{counter:03d}",
                    title=(
                        f"ClusterRole '{name}' allows exec into pods"
                    ),
                    severity="High",
                    module="RBAC",
                    resource_name=name,
                    namespace="cluster-wide",
                    evidence=(
                        f"verbs: {sorted(verbs)} on pods/exec — grants "
                        f"shell access to any running container in the cluster"
                    ),
                    score=8.0,
                    remediation_hint=(
                        "Remove pods/exec from this role unless absolutely "
                        "required. Pod exec effectively grants arbitrary "
                        "command execution inside any container."
                    ),
                ))
                counter += 1

            # ── Rule 3: List all Secrets = all credentials exposed ─────
            secret_read_verbs = {"list", "watch", "*"}
            if (
                verbs.intersection(secret_read_verbs) and
                "secrets" in resources
            ):
                findings.append(make_finding(
                    id=f"RBAC-ESC-{counter:03d}",
                    title=(
                        f"ClusterRole '{name}' can list all Secrets "
                        f"cluster-wide"
                    ),
                    severity="High",
                    module="RBAC",
                    resource_name=name,
                    namespace="cluster-wide",
                    evidence=(
                        f"verbs: {sorted(verbs.intersection(secret_read_verbs))} "
                        f"on secrets — exposes all credentials in all namespaces"
                    ),
                    score=7.5,
                    remediation_hint=(
                        "Remove 'list' and 'watch' from secrets. "
                        "Only grant 'get' on specific named secrets "
                        "using resourceNames field."
                    ),
                ))
                counter += 1

            # ── Rule 4: Impersonation = act as any user/SA ─────────────
            impersonate_resources = {
                "users", "groups", "serviceaccounts",
                "userextras"
            }
            if (
                "impersonate" in verbs and
                bool(resources.intersection(impersonate_resources))
            ):
                hit = sorted(resources.intersection(impersonate_resources))
                findings.append(make_finding(
                    id=f"RBAC-ESC-{counter:03d}",
                    title=(
                        f"ClusterRole '{name}' can impersonate "
                        f"users or service accounts"
                    ),
                    severity="Critical",
                    module="RBAC",
                    resource_name=name,
                    namespace="cluster-wide",
                    evidence=(
                        f"verb: impersonate on {hit} — holder can "
                        f"act as any user or service account in the cluster"
                    ),
                    score=9.3,
                    remediation_hint=(
                        "Remove impersonate permission unless this is a "
                        "dedicated proxy or auth service. Impersonation "
                        "bypasses all other access controls."
                    ),
                ))
                counter += 1

    return findings