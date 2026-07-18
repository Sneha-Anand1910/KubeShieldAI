"""
Rules:
    RBAC-SA-001  Default SA automounts token (not explicitly disabled)
    RBAC-SA-002  Default SA has explicit RoleBinding granting it permissions
"""

from kubernetes import client
from kubernetes.client import RbacAuthorizationV1Api
from models.findings import Finding, make_finding

SKIP_NAMESPACES = {
    "kube-system",
    "kube-public",
    "kube-node-lease",
    "local-path-storage",
}


def check(rbac_v1: RbacAuthorizationV1Api) -> list[Finding]:
    findings = []
    counter = 1

    v1 = client.CoreV1Api()

    try:
        namespaces = v1.list_namespace()
    except Exception as e:
        return findings

    for ns in namespaces.items:
        ns_name = ns.metadata.name

        if ns_name in SKIP_NAMESPACES:
            continue

        # ── Rule 1: Default SA automounts token ────────────────────────
        try:
            default_sa = v1.read_namespaced_service_account(
                name="default",
                namespace=ns_name,
            )
        except Exception:
            continue

        automount = default_sa.automount_service_account_token
        if automount is None or automount is True:
            try:
                pods = v1.list_namespaced_pod(ns_name)
                in_use = any(
                    (p.spec.service_account_name in (None, "default"))
                    for p in pods.items
                )
            except Exception:
                in_use = True  

            if not in_use:
                continue

            findings.append(make_finding(
                id=f"RBAC-SA-{counter:03d}",
                title=(
                    f"Default ServiceAccount in '{ns_name}' "
                    f"automounts API token"
                ),
                severity="Medium",
                module="RBAC",
                resource_name="default",
                namespace=ns_name,
                evidence=(
                    f"automountServiceAccountToken is "
                    f"{'not set — defaults to true' if automount is None else 'explicitly true'} "
                    f"on default SA in namespace '{ns_name}'. "
                    f"Every pod in this namespace gets a mounted API token "
                    f"unless it opts out."
                ),
                score=5.5,
                remediation_hint=(
                    f"Disable automount on the default SA: "
                    f"kubectl patch serviceaccount default "
                    f"-n {ns_name} "
                    f"-p '{{\"automountServiceAccountToken\": false}}'"
                ),
            ))
            counter += 1

    # ── Rule 2: Default SA has explicit RoleBinding ────────────────────
    try:
        role_bindings = rbac_v1.list_role_binding_for_all_namespaces()
    except Exception:
        return findings

    for rb in role_bindings.items:
        rb_name   = rb.metadata.name
        namespace = rb.metadata.namespace

        if namespace in SKIP_NAMESPACES:
            continue

        subjects = rb.subjects or []
        for subject in subjects:
            if (
                subject.kind == "ServiceAccount" and
                subject.name == "default" and
                subject.namespace == namespace
            ):
                findings.append(make_finding(
                    id=f"RBAC-SA-{counter:03d}",
                    title=(
                        f"Default ServiceAccount in '{namespace}' "
                        f"has explicit RoleBinding '{rb_name}'"
                    ),
                    severity="Medium",
                    module="RBAC",
                    resource_name="default",
                    namespace=namespace,
                    evidence=(
                        f"RoleBinding '{rb_name}' in namespace '{namespace}' "
                        f"grants role '{rb.role_ref.name}' to the default "
                        f"ServiceAccount — every pod in this namespace "
                        f"inherits these permissions."
                    ),
                    score=6.0,
                    remediation_hint=(
                        f"Create a dedicated ServiceAccount for the workload "
                        f"and bind '{rb.role_ref.name}' to that instead of "
                        f"the default SA."
                    ),
                ))
                counter += 1

    return findings