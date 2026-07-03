from models.finding import Finding


SECRET_KEYWORDS = [
    "password",
    "passwd",
    "secret",
    "token",
    "apikey",
    "api_key",
    "access_key",
    "db_password"
]


def check(resource):

    findings = []

    metadata = resource.get("metadata", {})
    name = metadata.get("name", "unknown")
    namespace = metadata.get("namespace", "default")

    spec = resource.get("spec", {})

    # Pod
    if "containers" in spec:
        containers = spec.get("containers", [])

    # Deployment / StatefulSet / DaemonSet / Job / CronJob
    else:
        containers = (
            spec.get("template", {})
                .get("spec", {})
                .get("containers", [])
        )

    for container in containers:

        env_vars = container.get("env", [])

        for env in env_vars:

            env_name = env.get("name", "").lower()

            if any(keyword in env_name for keyword in SECRET_KEYWORDS):

                if "value" in env:

                    findings.append(
                        Finding(
                            id="SEC-001",
                            title="Hardcoded Secret Detected",
                            severity="High",
                            module="Secrets",
                            resource_name=name,
                            namespace=namespace,
                            evidence=f"{env_name} contains plaintext value",
                            score=8.5,
                            remediation_hint="Store sensitive values using Kubernetes Secret objects."
                        )
                    )

    return findings