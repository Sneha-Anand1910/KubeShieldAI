from models.findings import Finding


# Built-in roles that are SUPPOSED to read secrets — Kubernetes ships these and
# the cluster needs them to run. Flagging them is noise, so we skip them and only
# report secret-read grants that a human actually created.

# Skip any role whose name starts with one of these (system + common CNI/addons)
SYSTEM_PREFIXES = [
    "system:",
    "kubeadm:",
    "calico",
    "flannel",
    "weave",
    "canal",
    "cilium",
]

# Skip these exact built-in aggregated ClusterRoles (they legitimately read secrets)
BUILTIN_ROLE_NAMES = {
    "admin",
    "edit",
    "view",
    "cluster-admin",
}


def is_builtin_role(name: str) -> bool:
    """True for Kubernetes-shipped roles we should NOT flag."""
    if name in BUILTIN_ROLE_NAMES:
        return True
    return any(name.startswith(p) for p in SYSTEM_PREFIXES)


def check(resource):

    findings = []

    kind = resource.get("kind", "")

    if kind not in ["Role", "ClusterRole"]:
        return findings

    metadata = resource.get("metadata", {})
    name = metadata.get("name", "unknown")
    namespace = metadata.get("namespace", "cluster-wide")

    # ── Skip built-in / system roles — only flag human-created secret access ──
    if is_builtin_role(name):
        return findings

    rules = resource.get("rules", [])

    for rule in rules:

        resources = rule.get("resources", [])
        verbs = rule.get("verbs", [])

        if "secrets" in resources:

            dangerous = (
                "*" in verbs
                or "get" in verbs
                or "list" in verbs
                or "watch" in verbs
            )

            if dangerous:

                findings.append(
                    Finding(
                        id="SEC-003",
                        title="Secret Read Access Granted",
                        severity="High",
                        module="Secrets",
                        resource_name=name,
                        namespace=namespace,
                        evidence=f"resources={resources}, verbs={verbs}",
                        score=8.0,
                        remediation_hint="Restrict secret access permissions to only required identities."
                    )
                )

    return findings
