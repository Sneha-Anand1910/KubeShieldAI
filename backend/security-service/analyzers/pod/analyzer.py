from analyzers.pod.rules.root_user import check_root_user
from analyzers.pod.rules.privileged import check_privileged
from analyzers.pod.rules.privilege_esc import check_privilege_escalation
from analyzers.pod.rules.read_only_fs import check_read_only_fs

def analyze_pod(resource):
    findings = []
    spec = resource.get("spec", {})
    containers = spec.get("containers") or \
                 spec.get("template", {}).get("spec", {}).get("containers", [])
    for container in containers:
        findings.extend(check_root_user(container))
        findings.extend(check_privileged(container))
        findings.extend(check_privilege_escalation(container))
        findings.extend(check_read_only_fs(container))
    return [f.model_dump() for f in findings]