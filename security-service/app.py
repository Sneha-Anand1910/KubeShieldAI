from fastapi import FastAPI
from pydantic import BaseModel
from typing import Any
import uvicorn

app = FastAPI(title="KubeShield Security Service")

# ── Input model ──────────────────────────────────────────────────────────────
class YAMLInput(BaseModel):
    yaml_content: dict[str, Any]

# ── Helpers ──────────────────────────────────────────────────────────────────
def get_containers(parsed: dict) -> list[dict]:
    """Extract containers from any Kubernetes resource kind."""
    spec = parsed.get("spec", {})
    # Deployment / ReplicaSet / DaemonSet / StatefulSet
    pod_spec = spec.get("template", {}).get("spec", {})
    containers = pod_spec.get("containers", [])
    # Bare Pod
    if not containers:
        containers = spec.get("containers", [])
    return containers if containers else []

def get_metadata(parsed: dict) -> dict:
    return parsed.get("metadata", {})

def get_rules(parsed: dict) -> list[dict]:
    """For RBAC: ClusterRole / Role resources."""
    return parsed.get("rules", [])

def get_subjects(parsed: dict) -> list[dict]:
    """For RoleBinding / ClusterRoleBinding."""
    return parsed.get("subjects", [])

# ── Analyzer 1 — Pod Security ─────────────────────────────────────────────────
def analyze_pod_security(parsed: dict) -> list[dict]:
    findings = []
    kind = parsed.get("kind", "")

    for container in get_containers(parsed):
        name = container.get("name", "unnamed")
        sc = container.get("securityContext", {})

        # 1. Running as root
        run_as_non_root = sc.get("runAsNonRoot", False)
        run_as_user = sc.get("runAsUser", None)
        if not run_as_non_root and (run_as_user is None or run_as_user == 0):
            findings.append({
                "check": "Pod Security",
                "resource": f"{kind}/{name}",
                "Issue": "Container running as root (UID 0)",
                "Severity": "Critical",
                "Detail": f"Container '{name}' has no runAsNonRoot or runAsUser set.",
                "Recommendation": "Set securityContext.runAsNonRoot: true and runAsUser to a non-zero UID."
            })

        # 2. Privileged mode
        if sc.get("privileged", False):
            findings.append({
                "check": "Pod Security",
                "resource": f"{kind}/{name}",
                "Issue": "Privileged container detected",
                "Severity": "Critical",
                "Detail": f"Container '{name}' runs in privileged mode — full host kernel access.",
                "Recommendation": "Remove securityContext.privileged: true unless absolutely necessary."
            })

        # 3. Privilege escalation
        if sc.get("allowPrivilegeEscalation", True):  # default is True in K8s
            findings.append({
                "check": "Pod Security",
                "resource": f"{kind}/{name}",
                "Issue": "Privilege escalation allowed",
                "Severity": "High",
                "Detail": f"Container '{name}' may escalate privileges via setuid/setgid binaries.",
                "Recommendation": "Set securityContext.allowPrivilegeEscalation: false."
            })

        # 4. Read-only root filesystem
        if not sc.get("readOnlyRootFilesystem", False):
            findings.append({
                "check": "Pod Security",
                "resource": f"{kind}/{name}",
                "Issue": "Writable root filesystem",
                "Severity": "Medium",
                "Detail": f"Container '{name}' can write to root filesystem — malware persistence risk.",
                "Recommendation": "Set securityContext.readOnlyRootFilesystem: true."
            })

        # 5. Dangerous capabilities
        caps_add = sc.get("capabilities", {}).get("add", [])
        dangerous = ["SYS_ADMIN", "NET_ADMIN", "SYS_PTRACE", "ALL"]
        for cap in caps_add:
            if cap in dangerous:
                findings.append({
                    "check": "Pod Security",
                    "resource": f"{kind}/{name}",
                    "Issue": f"Dangerous Linux capability added: {cap}",
                    "Severity": "Critical",
                    "Detail": f"Container '{name}' adds capability {cap} which grants excessive host access.",
                    "Recommendation": f"Remove {cap} from securityContext.capabilities.add."
                })

        # 6. Resource limits missing
        resources = container.get("resources", {})
        if not resources.get("limits"):
            findings.append({
                "check": "Pod Security",
                "resource": f"{kind}/{name}",
                "Issue": "No resource limits defined",
                "Severity": "Medium",
                "Detail": f"Container '{name}' has no CPU/memory limits — denial-of-service risk.",
                "Recommendation": "Add resources.limits with cpu and memory values."
            })

        # 7. Host path volume mounts
        volumes = parsed.get("spec", {}).get("template", {}).get("spec", {}).get("volumes", [])
        for v in volumes:
            if "hostPath" in v:
                findings.append({
                    "check": "Pod Security",
                    "resource": f"{kind}/{v.get('name', 'volume')}",
                    "Issue": f"HostPath volume mounted: {v.get('hostPath', {}).get('path', '?')}",
                    "Severity": "High",
                    "Detail": "HostPath mounts expose the node's filesystem to the container.",
                    "Recommendation": "Use PersistentVolumeClaims instead of hostPath."
                })

    return findings

# ── Analyzer 2 — RBAC ─────────────────────────────────────────────────────────
def analyze_rbac(parsed: dict) -> list[dict]:
    findings = []
    kind = parsed.get("kind", "")

    if kind not in ("Role", "ClusterRole", "RoleBinding", "ClusterRoleBinding"):
        return findings

    rules = get_rules(parsed)
    for rule in rules:
        verbs = rule.get("verbs", [])
        resources = rule.get("resources", [])
        api_groups = rule.get("apiGroups", [])

        # Wildcard permissions
        if "*" in verbs or "*" in resources:
            findings.append({
                "check": "RBAC",
                "resource": kind,
                "Issue": "Wildcard (*) permissions granted",
                "Severity": "Critical",
                "Detail": f"Verbs: {verbs}, Resources: {resources}",
                "Recommendation": "Replace wildcards with specific verbs and resource names."
            })

        # Write access to secrets
        if "secrets" in resources and any(v in verbs for v in ["get", "list", "watch", "*"]):
            findings.append({
                "check": "RBAC",
                "resource": kind,
                "Issue": "Read access to Secrets granted",
                "Severity": "High",
                "Detail": "Secrets can contain credentials, API keys, and TLS certs.",
                "Recommendation": "Restrict secrets access to only the pods that absolutely require it."
            })

        # Cluster-scoped write access
        if kind == "ClusterRole" and any(v in verbs for v in ["create", "delete", "patch", "update", "*"]):
            findings.append({
                "check": "RBAC",
                "resource": kind,
                "Issue": "Cluster-wide write permission",
                "Severity": "High",
                "Detail": f"Write verbs {[v for v in verbs if v in ['create','delete','patch','update','*']]} on {resources}",
                "Recommendation": "Scope to a namespace Role instead of ClusterRole where possible."
            })

    # Check for dangerous subjects in bindings
    subjects = get_subjects(parsed)
    for sub in subjects:
        if sub.get("name") == "system:anonymous":
            findings.append({
                "check": "RBAC",
                "resource": kind,
                "Issue": "Role bound to anonymous user",
                "Severity": "Critical",
                "Detail": "system:anonymous means ANY unauthenticated request gets these permissions.",
                "Recommendation": "Remove system:anonymous from role bindings immediately."
            })
        if sub.get("name") == "system:unauthenticated":
            findings.append({
                "check": "RBAC",
                "resource": kind,
                "Issue": "Role bound to unauthenticated group",
                "Severity": "Critical",
                "Detail": "Grants permissions to all unauthenticated requests.",
                "Recommendation": "Remove system:unauthenticated from role bindings."
            })

    return findings

# ── Analyzer 3 — Secrets ──────────────────────────────────────────────────────
def analyze_secrets(parsed: dict) -> list[dict]:
    findings = []
    kind = parsed.get("kind", "")

    # Plaintext secrets in env vars
    for container in get_containers(parsed):
        name = container.get("name", "unnamed")
        env = container.get("env", [])
        sensitive_keywords = [
            "password", "passwd", "secret", "token", "api_key", "apikey",
            "auth", "credential", "private_key", "access_key", "aws_secret"
        ]
        for var in env:
            var_name_lower = var.get("name", "").lower()
            if any(kw in var_name_lower for kw in sensitive_keywords):
                if "value" in var and var["value"]:  # hardcoded value (not valueFrom)
                    findings.append({
                        "check": "Secrets",
                        "resource": f"{kind}/{name}",
                        "Issue": f"Hardcoded sensitive value in env var: {var['name']}",
                        "Severity": "Critical",
                        "Detail": "Credentials stored as plaintext in YAML are visible in kubectl, logs, and version control.",
                        "Recommendation": "Use secretKeyRef: { name: <secret-name>, key: <key> } instead."
                    })

    # Secret resource itself: check for opaque type with no data
    if kind == "Secret":
        secret_type = parsed.get("type", "Opaque")
        data = parsed.get("data", {})
        string_data = parsed.get("stringData", {})

        if string_data:
            findings.append({
                "check": "Secrets",
                "resource": "Secret",
                "Issue": "stringData field used instead of data (base64)",
                "Severity": "Medium",
                "Detail": "stringData stores values in plaintext in etcd before encoding — use data with base64 values.",
                "Recommendation": "Always use data: with base64-encoded values."
            })

        if not data and not string_data:
            findings.append({
                "check": "Secrets",
                "resource": "Secret",
                "Issue": "Empty Secret resource",
                "Severity": "Low",
                "Detail": "Secret object has no data or stringData fields.",
                "Recommendation": "Populate the Secret or delete it if unused."
            })

    return findings

# ── Analyzer 4 — Service Exposure ─────────────────────────────────────────────
def analyze_services(parsed: dict) -> list[dict]:
    findings = []
    kind = parsed.get("kind", "")

    if kind == "Service":
        spec = parsed.get("spec", {})
        svc_type = spec.get("type", "ClusterIP")
        name = parsed.get("metadata", {}).get("name", "unknown-service")
        ports = spec.get("ports", [])

        if svc_type == "NodePort":
            findings.append({
                "check": "Service Exposure",
                "resource": f"Service/{name}",
                "Issue": "NodePort service exposes port on every cluster node",
                "Severity": "Medium",
                "Detail": "NodePort opens a port (30000-32767) on all nodes — accessible from outside the cluster.",
                "Recommendation": "Use ClusterIP for internal services; use Ingress with TLS for external access."
            })

        if svc_type == "LoadBalancer":
            findings.append({
                "check": "Service Exposure",
                "resource": f"Service/{name}",
                "Issue": "LoadBalancer service is publicly internet-facing",
                "Severity": "High",
                "Detail": "LoadBalancer creates a cloud provider LB with a public IP — directly reachable from internet.",
                "Recommendation": "Restrict source IPs with spec.loadBalancerSourceRanges, or use Ingress."
            })

        # Dangerous ports
        sensitive_ports = {
            22: "SSH", 3306: "MySQL", 5432: "PostgreSQL",
            6379: "Redis", 27017: "MongoDB", 9200: "Elasticsearch"
        }
        for port in ports:
            port_num = port.get("port") or port.get("targetPort")
            if port_num in sensitive_ports:
                findings.append({
                    "check": "Service Exposure",
                    "resource": f"Service/{name}",
                    "Issue": f"Sensitive port {port_num} ({sensitive_ports[port_num]}) exposed via {svc_type}",
                    "Severity": "Critical" if svc_type in ("NodePort", "LoadBalancer") else "High",
                    "Detail": f"{sensitive_ports[port_num]} port should never be internet-accessible.",
                    "Recommendation": "Keep database/cache services as ClusterIP only."
                })

    if kind == "Ingress":
        name = parsed.get("metadata", {}).get("name", "unknown-ingress")
        spec = parsed.get("spec", {})
        tls = spec.get("tls", [])

        if not tls:
            findings.append({
                "check": "Service Exposure",
                "resource": f"Ingress/{name}",
                "Issue": "Ingress has no TLS configured",
                "Severity": "High",
                "Detail": "Traffic to this Ingress is unencrypted — credentials and data sent in plaintext.",
                "Recommendation": "Add a tls: block with a valid certificate (cert-manager recommended)."
            })

    return findings

# ── Main endpoint ─────────────────────────────────────────────────────────────
@app.post("/analyze")
def analyze(body: YAMLInput):
    parsed = body.yaml_content

    pod_findings     = analyze_pod_security(parsed)
    rbac_findings    = analyze_rbac(parsed)
    secret_findings  = analyze_secrets(parsed)
    service_findings = analyze_services(parsed)

    all_findings = pod_findings + rbac_findings + secret_findings + service_findings

    severity_order = {"Critical": 0, "High": 1, "Medium": 2, "Low": 3}
    all_findings.sort(key=lambda f: severity_order.get(f["Severity"], 99))

    counts = {"Critical": 0, "High": 0, "Medium": 0, "Low": 0}
    for f in all_findings:
        counts[f["Severity"]] = counts.get(f["Severity"], 0) + 1

    return {
        "findings": all_findings,
        "summary": {
            "total": len(all_findings),
            "by_severity": counts,
            "checks_run": ["Pod Security", "RBAC", "Secrets", "Service Exposure"],
            "resource_kind": parsed.get("kind", "Unknown")
        }
    }

@app.get("/health")
def health():
    return {"status": "ok", "service": "security-service"}


if __name__ == "__main__":
    uvicorn.run(app, host="0.0.0.0", port=8000)