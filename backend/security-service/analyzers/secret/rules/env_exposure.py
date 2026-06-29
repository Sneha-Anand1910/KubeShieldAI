from models.finding import Finding


def check(resource):

    findings = []

    metadata = resource.get("metadata", {})
    name = metadata.get("name", "unknown")
    namespace = metadata.get("namespace", "default")

    spec = resource.get("spec", {})

    containers = spec.get("containers", [])

    secret_env_count = 0

    for container in containers:

        env_vars = container.get("env", [])

        for env in env_vars:

            value_from = env.get("valueFrom", {})

            if "secretKeyRef" in value_from:
                secret_env_count += 1

    if secret_env_count > 5:

        findings.append(
            Finding(
                id="SEC-002",
                title="Excessive Secret Exposure",
                severity="Medium",
                module="Secrets",
                resource_name=name,
                namespace=namespace,
                evidence=f"{secret_env_count} secrets injected as environment variables",
                score=5.5,
                remediation_hint="Reduce unnecessary secret exposure and use least-privilege design."
            )
        )

    return findings