def analyze_pod(container):
    findings = []

    if container["securityContext"]["runAsUser"] == 0:
        findings.append({
            "Issue": "Container running as root",
            "Severity": "Critical",
            "Recommendation": "Use a non-root user"
        })

    if container["securityContext"]["privileged"] == True:
        findings.append({
            "Issue": "Privileged container",
            "Severity": "Critical",
            "Recommendation": "Disable privileged mode"
        })

    if container["securityContext"].get("allowPrivilegeEscalation") == True:
        findings.append({
            "Issue": "Privilege escalation allowed",
            "Severity": "High",
            "Recommendation": "Set allowPrivilegeEscalation to false"
        })
    if container["securityContext"].get("readOnlyRootFilesystem") == False:
       findings.append({
        "Issue": "Writable root filesystem",
        "Severity": "Medium",
        "Recommendation": "Enable readOnlyRootFilesystem"
    })

    return findings