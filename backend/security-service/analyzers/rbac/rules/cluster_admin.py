"""
analyzers/rbac/rules/cluster_admin.py
======================================
Detects dangerous cluster-admin bindings.

Rules:
    RBAC-CADM-001  ServiceAccount with cluster-admin outside system namespaces
    RBAC-CADM-002  Regular user with cluster-admin binding
    RBAC-CADM-003  Anonymous / unauthenticated group with cluster-admin
    RBAC-CADM-004  Broad group (system:authenticated) with cluster-admin
"""

from kubernetes.client import RbacAuthorizationV1Api
from models.finding import Finding, make_finding

# Namespaces where cluster-admin on a SA is expected/acceptable
SAFE_NAMESPACES = {
    "kube-system",
    "kube-public",
    "kube-node-lease",
}

# System users that legitimately hold cluster-admin
SAFE_USERS = {
    "kubernetes-admin",
    "admin",
}


def check(rbac_v1: RbacAuthorizationV1Api) -> list[Finding]:
    findings = []
    counter = 1

    crbs = rbac_v1.list_cluster_role_binding()

    for crb in crbs.items:
        crb_name = crb.metadata.name

        # Only care about bindings that grant cluster-admin
        if crb.role_ref.name != "cluster-admin":
            continue

        subjects = crb.subjects or []

        for subject in subjects:

            # ── Rule 1: ServiceAccount with cluster-admin ──────────────
            if subject.kind == "ServiceAccount":
                sa_namespace = subject.namespace or "default"

                if sa_namespace not in SAFE_NAMESPACES:
                    findings.append(make_finding(
                        id=f"RBAC-CADM-{counter:03d}",
                        title=(
                            f"ServiceAccount '{subject.name}' has "
                            f"cluster-admin access"
                        ),
                        severity="Critical",
                        module="RBAC",
                        resource_name=crb_name,
                        namespace=sa_namespace,
                        evidence=(
                            f"ClusterRoleBinding '{crb_name}' grants "
                            f"cluster-admin to ServiceAccount "
                            f"'{subject.name}' in namespace '{sa_namespace}'"
                        ),
                        score=9.5,
                        remediation_hint=(
                            f"Remove cluster-admin from ServiceAccount "
                            f"'{subject.name}'. Create a scoped Role with "
                            f"only the permissions this SA actually needs."
                        ),
                    ))
                    counter += 1

            # ── Rule 2: Regular user with cluster-admin ────────────────
            elif subject.kind == "User":
                # Skip known system users
                if subject.name.startswith("system:"):
                    continue
                if subject.name in SAFE_USERS:
                    continue

                findings.append(make_finding(
                    id=f"RBAC-CADM-{counter:03d}",
                    title=(
                        f"User '{subject.name}' has cluster-admin binding"
                    ),
                    severity="High",
                    module="RBAC",
                    resource_name=crb_name,
                    namespace="cluster-wide",
                    evidence=(
                        f"ClusterRoleBinding '{crb_name}' grants "
                        f"cluster-admin to user '{subject.name}'"
                    ),
                    score=8.8,
                    remediation_hint=(
                        f"Audit whether user '{subject.name}' requires "
                        f"cluster-admin. Replace with namespace-scoped "
                        f"RoleBindings where possible."
                    ),
                ))
                counter += 1

            # ── Rule 3: Anonymous / unauthenticated group ──────────────
            elif subject.kind == "Group":
                if subject.name in {
                    "system:unauthenticated",
                    "system:anonymous",
                }:
                    findings.append(make_finding(
                        id=f"RBAC-CADM-{counter:03d}",
                        title="Anonymous users have cluster-admin access",
                        severity="Critical",
                        module="RBAC",
                        resource_name=crb_name,
                        namespace="cluster-wide",
                        evidence=(
                            f"Group '{subject.name}' bound to cluster-admin "
                            f"via '{crb_name}' — any unauthenticated request "
                            f"has full cluster access"
                        ),
                        score=10.0,
                        remediation_hint=(
                            "IMMEDIATE ACTION REQUIRED. Remove this binding: "
                            f"kubectl delete clusterrolebinding {crb_name}"
                        ),
                    ))
                    counter += 1

                # ── Rule 4: system:authenticated = every user ──────────
                elif subject.name == "system:authenticated":
                    findings.append(make_finding(
                        id=f"RBAC-CADM-{counter:03d}",
                        title=(
                            "All authenticated users have cluster-admin access"
                        ),
                        severity="Critical",
                        module="RBAC",
                        resource_name=crb_name,
                        namespace="cluster-wide",
                        evidence=(
                            f"Group 'system:authenticated' bound to "
                            f"cluster-admin via '{crb_name}' — every "
                            f"authenticated user is a cluster admin"
                        ),
                        score=9.9,
                        remediation_hint=(
                            "Remove this binding immediately. "
                            f"kubectl delete clusterrolebinding {crb_name}"
                        ),
                    ))
                    counter += 1

    return findings