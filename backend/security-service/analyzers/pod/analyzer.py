from analyzers.pod.rules.root_user import check_root_user
from analyzers.pod.rules.privileged import check_privileged
from analyzers.pod.rules.privilege_esc import check_privilege_escalation
from analyzers.pod.rules.read_only_fs import check_read_only_fs


def _snake_to_camel(key: str) -> str:
    parts = key.split("_")
    return parts[0] + "".join(p.title() for p in parts[1:])


def _normalize_keys(obj):
    """Recursively convert snake_case dict keys to camelCase.
    Needed because /scan/live (kubernetes client .to_dict()) returns
    snake_case, while /scan/yaml (raw manifest) returns camelCase.
    Rule modules only understand camelCase.
    """
    if isinstance(obj, dict):
        return {_snake_to_camel(k): _normalize_keys(v) for k, v in obj.items()}
    if isinstance(obj, list):
        return [_normalize_keys(v) for v in obj]
    return obj


def _analyze_single_pod(resource):
    """Run all pod-level rule checks against a single pod resource (dict)."""
    resource = _normalize_keys(resource)

    metadata  = resource.get("metadata", {})
    pod_name  = metadata.get("name", "unknown")
    namespace = metadata.get("namespace", "default")

    findings = []
    spec = resource.get("spec", {})
    containers = spec.get("containers") or \
                 spec.get("template", {}).get("spec", {}).get("containers", [])

    for container in containers:
        c_findings = []
        c_findings.extend(check_root_user(container))
        c_findings.extend(check_privileged(container))
        c_findings.extend(check_privilege_escalation(container))
        c_findings.extend(check_read_only_fs(container))

        # The rules only know the container name. Stamp the real pod identity
        # (namespace + pod name) so "Resources Affected" counts unique pods —
        # e.g. Pod A with root + privileged = 2 findings but 1 resource.
        for f in c_findings:
            f.resource_name = pod_name
            f.namespace = namespace
        findings.extend(c_findings)

    return findings


def analyze_pod(v1):
    """
    Contract entry point: accepts a live CoreV1Api client,
    fetches all pods cluster-wide, and runs the rule checks on each.

    Returns a list of Finding objects (NOT dicts) — app.py's endpoints
    call .model_dump() on each item themselves.
    """
    pods = v1.list_pod_for_all_namespaces()

    all_findings = []
    for pod in pods.items:
        pod_dict = pod.to_dict()
        all_findings.extend(_analyze_single_pod(pod_dict))

    return all_findings
