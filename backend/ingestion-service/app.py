"""
KubeShield Ingestion Service
-----------------------------
Two scan modes:
  POST /scan/live  → query the live Kubernetes API server using in-cluster credentials
  POST /scan/yaml  → accept an uploaded YAML file, parse with PyYAML

Both return the same response shape so the gateway and frontend
don't need to care which mode was used.

Runs on port 8001.
"""

from importlib import resources

from fastapi import FastAPI, UploadFile, File, HTTPException
from fastapi.middleware.cors import CORSMiddleware
import uvicorn
import yaml
import os
from prometheus_fastapi_instrumentator import Instrumentator


app = FastAPI(title="KubeShield Ingestion Service")
Instrumentator().instrument(app).expose(app)
app.add_middleware(CORSMiddleware, allow_origins=["*"], allow_methods=["*"], allow_headers=["*"])


# ── Shared response builder ───────────────────────────────────────────────

def build_resource_summary(resources: list[dict]) -> dict:
    """Count resources by kind."""
    counts = {
        "pods": 0, "deployments": 0, "services": 0,
        "secrets": 0, "rbac_roles": 0, "network_policies": 0,
        "other": 0,
    }
    kind_map = {
        "Pod": "pods", "Deployment": "deployments", "Service": "services",
        "Secret": "secrets", "ClusterRole": "rbac_roles", "Role": "rbac_roles",
        "ClusterRoleBinding": "rbac_roles", "RoleBinding": "rbac_roles",
        "NetworkPolicy": "network_policies",
    }
    for r in resources:
        kind = r.get("kind", "")
        key = kind_map.get(kind, "other")
        counts[key] += 1
    return counts


# ── Mode 1: Live cluster scan ─────────────────────────────────────────────

@app.post("/scan/live")
def scan_live():
    """
    Query the Kubernetes API server using the in-cluster ServiceAccount.
    This works when ingestion-service is deployed as a pod on the cluster.
    Locally it will fail gracefully — use /scan/yaml for local dev.
    """
    try:
        from kubernetes import client, config
        # load_incluster_config() works inside a pod
        # load_kube_config() works on your laptop with ~/.kube/config
        try:
            config.load_incluster_config()
        except Exception:
            config.load_kube_config()  # fallback for local dev

        v1   = client.CoreV1Api()
        apps = client.AppsV1Api()
        rbac = client.RbacAuthorizationV1Api()
        net  = client.NetworkingV1Api()

        resources = []

        # Fetch pods across all namespaces
        for pod in v1.list_pod_for_all_namespaces().items:
            d = pod.to_dict()
            d["kind"] = "Pod"
            resources.append(d)

        #Fetch deployments
        for dep in apps.list_deployment_for_all_namespaces().items:
            d = dep.to_dict()
            d["kind"] = "Deployment"
            resources.append(d)

        # Fetch services
        for svc in v1.list_service_for_all_namespaces().items:
            d = svc.to_dict()
            d["kind"] = "Service"
            resources.append(d)

        # Fetch secrets (names only — not data, for safety)
        for sec in v1.list_secret_for_all_namespaces().items:
            d = sec.to_dict()
            d["kind"] = "Secret"
            d["data"] = {k: "***REDACTED***" for k in (d.get("data") or {})}
            resources.append(d)

        # Fetch RBAC
        for role in rbac.list_cluster_role().items:
            d = role.to_dict()
            d["kind"] = "ClusterRole"
            resources.append(d)

        for binding in rbac.list_cluster_role_binding().items:
            d = binding.to_dict()
            d["kind"] = "ClusterRoleBinding"
            resources.append(d)

        # Fetch NetworkPolicies
        for np in net.list_network_policy_for_all_namespaces().items:
            d = np.to_dict()
            d["kind"] = "NetworkPolicy"
            resources.append(d)

        summary = build_resource_summary(resources)

        return {
            "mode": "live",
            "resources": resources,
            "resource_count": len(resources),
            "summary": summary,
        }

    except ImportError:
        raise HTTPException(
            500,
            "kubernetes Python package not installed. Run: pip install kubernetes"
        )
    except Exception as e:
        raise HTTPException(500, f"Failed to connect to cluster: {str(e)}")
    

@app.get("/ingest/namespaces")
async def get_namespaces():
    """
    Returns all namespaces + pods per namespace from the live cluster.
    Called by the frontend on load and every 30 seconds.
    """
    try:
        from kubernetes import client, config
        try:
            config.load_incluster_config()
        except Exception:
            config.load_kube_config()

        v1 = client.CoreV1Api()

        # Get all namespaces
        ns_list = v1.list_namespace(_request_timeout=10)

        # Get all pods in one API call (more efficient)
        all_pods = v1.list_pod_for_all_namespaces(_request_timeout=10)

        # Group pods by namespace
        pods_by_ns = {}
        for pod in all_pods.items:
            ns = pod.metadata.namespace
            if ns not in pods_by_ns:
                pods_by_ns[ns] = []
            pods_by_ns[ns].append({
                "name":   pod.metadata.name,
                "status": pod.status.phase or "Unknown",
            })

        namespaces = []
        for ns in ns_list.items:
            name = ns.metadata.name
            pods = pods_by_ns.get(name, [])
            namespaces.append({
                "name":      name,
                "status":    ns.status.phase or "Active",
                "pod_count": len(pods),
                "pods":      pods,
            })

        # Get node info
        nodes = v1.list_node(_request_timeout=10)
        version = client.VersionApi().get_code(_request_timeout=10)

        return {
            "namespaces": namespaces,
            "cluster_info": {
                "node_count":         len(nodes.items),
                "nodes":              [n.metadata.name for n in nodes.items],
                "kubernetes_version": version.git_version,
            }
        }
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))

# ── Mode 2: YAML file upload ──────────────────────────────────────────────

@app.post("/scan/yaml")
async def scan_yaml(file: UploadFile = File(...)):
    """
    Accept a YAML file upload, parse all documents inside it with PyYAML,
    and return the same format as /scan/live.
    """
    raw = await file.read()
    try:
        text = raw.decode("utf-8")
    except UnicodeDecodeError:
        raise HTTPException(400, "File must be UTF-8 encoded")

    try:
        # yaml.safe_load_all handles multi-document YAML (--- separators)
        docs = list(yaml.safe_load_all(text))
        # Filter out None (empty documents from trailing ---)
        resources = [d for d in docs if d is not None]
    except yaml.YAMLError as e:
        raise HTTPException(400, f"Invalid YAML: {str(e)}")

    if not resources:
        raise HTTPException(400, "YAML file contains no valid resources")

    summary = build_resource_summary(resources)

    return {
        "mode": "yaml",
        "filename": file.filename,
        "resources": resources,
        "resource_count": len(resources),
        "summary": summary,
    }


# ── Health check ──────────────────────────────────────────────────────────

@app.get("/health")
def health():
    return {"status": "ok", "service": "ingestion-service"}


if __name__ == "__main__":
    uvicorn.run(app, host="0.0.0.0", port=8001)
