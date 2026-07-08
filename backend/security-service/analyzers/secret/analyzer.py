from kubernetes.client import CoreV1Api, RbacAuthorizationV1Api
from models.findings import Finding

from analyzers.secret.rules import hardcoded
from analyzers.secret.rules import env_exposure
from analyzers.secret.rules import rbac_access


def analyze(v1: CoreV1Api, rbac_v1: RbacAuthorizationV1Api = None) -> list[Finding]:
    findings = []

    # ── Pod-level secret checks (hardcoded + env_exposure) ────────────────
    pods = v1.list_pod_for_all_namespaces()

    for pod in pods.items:
        containers = []
        for c in (pod.spec.containers or []):
            env_vars = []
            if c.env:
                for e in c.env:
                    env_entry = {"name": e.name}
                    if e.value:
                        env_entry["value"] = e.value
                    if e.value_from:
                        value_from = {}
                        if e.value_from.secret_key_ref:
                            value_from["secretKeyRef"] = {
                                "name": e.value_from.secret_key_ref.name,
                                "key":  e.value_from.secret_key_ref.key,
                            }
                        env_entry["valueFrom"] = value_from
                    env_vars.append(env_entry)

            containers.append({
                "name": c.name,
                "env":  env_vars,
            })

        resource = {
            "metadata": {
                "name":      pod.metadata.name,
                "namespace": pod.metadata.namespace,
            },
            "spec": {
                "containers": containers,
            }
        }

        findings.extend(hardcoded.check(resource))
        findings.extend(env_exposure.check(resource))

    # ── RBAC-level secret checks (rbac_access) ────────────────────────────
    if rbac_v1:
        # Check ClusterRoles
        for cr in rbac_v1.list_cluster_role().items:
            resource = {
                "kind":     "ClusterRole",
                "metadata": {
                    "name":      cr.metadata.name,
                    "namespace": "cluster-wide",
                },
                "rules": [
                    {
                        "resources": r.resources or [],
                        "verbs":     r.verbs or [],
                    }
                    for r in (cr.rules or [])
                ],
            }
            findings.extend(rbac_access.check(resource))

        # Check namespaced Roles
        for role in rbac_v1.list_role_for_all_namespaces().items:
            resource = {
                "kind":     "Role",
                "metadata": {
                    "name":      role.metadata.name,
                    "namespace": role.metadata.namespace,
                },
                "rules": [
                    {
                        "resources": r.resources or [],
                        "verbs":     r.verbs or [],
                    }
                    for r in (role.rules or [])
                ],
            }
            findings.extend(rbac_access.check(resource))

    return findings