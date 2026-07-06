from models.finding import make_finding

def check_privileged(container):
    findings = []
    security_context = container.get("securityContext") or {}
    if security_context.get("privileged") is True:
        findings.append(make_finding(
            id="POD-002",
            title="Privileged container",
            severity="Critical",
            module="Pod",
            resource_name=container.get("name", "unknown"),
            evidence="privileged: true",
            remediation_hint="Disable privileged mode"
        ))
    return findings
