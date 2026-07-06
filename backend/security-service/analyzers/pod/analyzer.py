from analyzers.pod.rules.root_user import check_root_user
from analyzers.pod.rules.privileged import check_privileged
from analyzers.pod.rules.privilege_esc import check_privilege_escalation
from analyzers.pod.rules.read_only_fs import check_read_only_fs


def _to_camel_case(snake_str: str) -> str:
    parts = snake_str.split('_')
    return parts[0] + ''.join(p.title() for p in parts[1:])


def _normalize_keys(obj):
    """Recursively convert snake_case keys to camelCase."""
    if isinstance(obj, dict):
        return {_to_camel_case(k): _normalize_keys(v) for k, v in obj.items()}
    elif isinstance(obj, list):
        return [_normalize_keys(i) for i in obj]
    return obj


def analyze_pod(resource):
    resource = _normalize_keys(resource)

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