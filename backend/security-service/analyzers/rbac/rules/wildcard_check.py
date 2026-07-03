"""
analyzers/rbac/rules/wildcard_check.py
=======================================
Detects wildcard (*) permissions on Roles and ClusterRoles.

Rules:
    RBAC-WILD-001  ClusterRole with full wildcard (* verbs + * resources)
    RBAC-WILD-002  ClusterRole with wildcard verbs on Secrets specifically
    RBAC-WILD-003  ClusterRole with wildcard verbs on any sensitive resource
    RBAC-WILD-004  Namespaced Role with wildcard permissions
"""

from kubernetes.client import RbacAuthorizationV1Api
from models.findings import Finding, make_finding

# Skip built-in system roles — they are intentionally permissive
SYSTEM_PREFIXES = [
    "system:",
    "kubeadm:",
    "calico",
    "flannel",
    "weave",
    "canal",
    "cilium",
]

# Resources that are sensitive even without full wildcard
SENSITIVE_RESOURCES = {
    "secrets",
    "serviceaccounts",
    "pods/exec",
    "pods/attach",
    "nodes",
    "persistentvolumes",
    "clusterrolebindings",
    "rolebindings",
}


def is_system_role(name: str) -> bool:
    return any(name.startswith(p) for p in SYSTEM_PREFIXES)


def check(rbac_v1: RbacAuthorizationV1Api) -> list[Finding]:
    findings = []
    counter = 1

    # ── ClusterRoles ───────────────────────────────────────────────────────
    cluster_roles = rbac_v1.list_cluster_role()

    for cr in cluster_roles.items:
        name = cr.metadata.name

        if is_system_role(name):
            continue

        if not cr.rules:
            continue

        for rule in cr.rules:
            verbs      = rule.verbs      or []
            resources  = rule.resources  or []
            api_groups = rule.api_groups or []

            # Rule 1 — full wildcard: * verbs + * resources = god mode
            if "*" in verbs and "*" in resources:
                findings.append(make_finding(
                    id=f"RBAC-WILD-{counter:03d}",
                    title=f"ClusterRole '{name}' has full wildcard permissions",
                    severity="Critical",
                    module="RBAC",
                    resource_name=name,
                    namespace="cluster-wide",
                    evidence=(
                        f"verbs: {verbs}, resources: {resources}, "
                        f"apiGroups: {api_groups}"
                    ),
                    score=9.8,
                    remediation_hint=(
                        "Replace wildcard (*) verbs and resources with specific "
                        "permissions. Example: verbs: [get, list, watch] "
                        "resources: [pods]"
                    ),
                ))
                counter += 1
                continue  # no need to check other rules on this role

            # Rule 2 — wildcard verbs on Secrets specifically
            if "*" in verbs and "secrets" in resources:
                findings.append(make_finding(
                    id=f"RBAC-WILD-{counter:03d}",
                    title=f"ClusterRole '{name}' has wildcard verbs on Secrets",
                    severity="Critical",
                    module="RBAC",
                    resource_name=name,
                    namespace="cluster-wide",
                    evidence=f"verbs: {verbs} on resources: secrets",
                    score=9.5,
                    remediation_hint=(
                        "Restrict secret access to only 'get' on specific "
                        "named secrets using resourceNames. Never grant "
                        "list or watch on secrets cluster-wide."
                    ),
                ))
                counter += 1

            # Rule 3 — wildcard verbs on any other sensitive resource
            elif "*" in verbs:
                hit = SENSITIVE_RESOURCES.intersection(set(resources))
                if hit:
                    findings.append(make_finding(
                        id=f"RBAC-WILD-{counter:03d}",
                        title=(
                            f"ClusterRole '{name}' has wildcard verbs "
                            f"on sensitive resources"
                        ),
                        severity="High",
                        module="RBAC",
                        resource_name=name,
                        namespace="cluster-wide",
                        evidence=(
                            f"verbs: {verbs} on sensitive resources: "
                            f"{sorted(hit)}"
                        ),
                        score=7.8,
                        remediation_hint=(
                            f"Replace wildcard verbs with specific verbs "
                            f"(get, list, watch) on {sorted(hit)}"
                        ),
                    ))
                    counter += 1

    # ── Namespaced Roles ───────────────────────────────────────────────────
    roles = rbac_v1.list_role_for_all_namespaces()

    for role in roles.items:
        name      = role.metadata.name
        namespace = role.metadata.namespace

        if is_system_role(name):
            continue

        if not role.rules:
            continue

        for rule in role.rules:
            verbs     = rule.verbs     or []
            resources = rule.resources or []

            # Rule 4 — namespaced Role with full wildcard
            if "*" in verbs and "*" in resources:
                findings.append(make_finding(
                    id=f"RBAC-WILD-{counter:03d}",
                    title=(
                        f"Role '{name}' in namespace '{namespace}' "
                        f"has wildcard permissions"
                    ),
                    severity="High",   # HIGH not CRITICAL — namespace-scoped
                    module="RBAC",
                    resource_name=name,
                    namespace=namespace,
                    evidence=f"verbs: {verbs}, resources: {resources}",
                    score=7.5,
                    remediation_hint=(
                        f"Replace wildcard permissions in Role '{name}' "
                        f"with specific verbs and resources"
                    ),
                ))
                counter += 1

    return findings