from models.findings import make_finding

def check_privilege_escalation(container):
    findings = []
    security_context = container.get("securityContext") or {}
    if security_context.get("allowPrivilegeEscalation") is True:
        findings.append(make_finding(
            id="POD-003",
            title="Privilege escalation allowed",
            severity="High",
            module="Pod",
            resource_name=container.get("name", "unknown"),
            evidence="allowPrivilegeEscalation: true",
            remediation_hint="Set allowPrivilegeEscalation to false"
        ))
    return findings