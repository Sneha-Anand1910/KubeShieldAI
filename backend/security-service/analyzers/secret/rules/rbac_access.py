from models.finding import Finding


def check(resource):

    findings = []

    kind = resource.get("kind", "")

    if kind not in ["Role", "ClusterRole"]:
        return findings

    metadata = resource.get("metadata", {})
    name = metadata.get("name", "unknown")
    namespace = metadata.get("namespace", "cluster-wide")

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