from models.findings import make_finding
def check_root_user(container):
    findings = []
    security_context = container.get("securityContext", {})
    if security_context.get("runAsUser") == 0:
        findings.append(make_finding(
            id="POD-001",
            title="Container running as root",
            severity="Critical",
            module="Pod",
            resource_name=container.get("name", "unknown"),
            evidence="runAsUser: 0",
            remediation_hint="Use a non-root user"
        ))
    return findings