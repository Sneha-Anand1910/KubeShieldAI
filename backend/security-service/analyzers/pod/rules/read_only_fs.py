from models.finding import make_finding

def check_read_only_fs(container):
    findings = []
    security_context = container.get("securityContext") or {}
    if security_context.get("readOnlyRootFilesystem") is False:
        findings.append(make_finding(
            id="POD-004",
            title="Writable root filesystem",
            severity="Medium",
            module="Pod",
            resource_name=container.get("name", "unknown"),
            evidence="readOnlyRootFilesystem: false",
            remediation_hint="Enable readOnlyRootFilesystem: true"
        ))
    return findings
