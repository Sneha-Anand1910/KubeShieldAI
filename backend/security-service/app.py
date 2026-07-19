import os
import tempfile
import logging
from typing import Optional
from fastapi import FastAPI, HTTPException
from fastapi.middleware.cors import CORSMiddleware
from pydantic import BaseModel
from kubernetes import client, config
from kubernetes.client.rest import ApiException
from prometheus_fastapi_instrumentator import Instrumentator

from models.findings import Finding

# ── Analyzer imports ─────────────────────────────────────────────────────
from analyzers.rbac.analyzer import analyze_rbac
from analyzers.pod.analyzer import analyze_pod
from analyzers.secret.analyzer  import analyze as analyze_secret
from analyzers.network.analyzer import analyze_network

logging.basicConfig(level=logging.INFO)
logger = logging.getLogger("security-service")

app = FastAPI(
    title="KubeShield Security Service",
    description="Live Kubernetes cluster security analysis — RBAC, Pod, Secret, Network",
    version="1.0.0",
)
Instrumentator().instrument(app).expose(app)

app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_methods=["*"],
    allow_headers=["*"],
)


# REQUEST SCHEMA
class AnalyzeRequest(BaseModel):
    kubeconfig_content: Optional[str] = None

# KUBERNETES CLIENT LOADER
def load_clients(kubeconfig_str: Optional[str] = None):
    if kubeconfig_str:
        with tempfile.NamedTemporaryFile(
            mode="w", suffix=".yaml", delete=False
        ) as f:
            f.write(kubeconfig_str)
            tmp = f.name
        try:
            config.load_kube_config(config_file=tmp)
        finally:
            os.unlink(tmp)   # always delete, even if load_kube_config raises
    else:
        # No kubeconfig passed — use the mounted config or in-cluster credentials
        try:
            config.load_incluster_config()
        except Exception:
            config.load_kube_config()   # default path: ~/.kube/config (mounted)

    return (
        client.CoreV1Api(),
        client.RbacAuthorizationV1Api(),
        client.NetworkingV1Api(),
    )


def get_cluster_info(v1: client.CoreV1Api) -> dict:
    try:
        nodes   = v1.list_node()
        version = client.VersionApi().get_code()
        return {
            "node_count":         len(nodes.items),
            "nodes":              [n.metadata.name for n in nodes.items],
            "kubernetes_version": version.git_version,
        }
    except Exception as e:
        return {"error": str(e)}

# HELPERS
def summarize(findings: list[Finding]) -> dict:
    """Build the by_severity and by_module breakdown from a list of Finding objects."""
    by_severity = {"Critical": 0, "High": 0, "Medium": 0, "Low": 0}
    by_module   = {"RBAC": 0, "Pod": 0, "Secrets": 0, "Network": 0}

    for f in findings:
        by_severity[f.severity] = by_severity.get(f.severity, 0) + 1
        by_module[f.module]     = by_module.get(f.module, 0) + 1

    return {"by_severity": by_severity, "by_module": by_module}

# ROUTES
@app.get("/")
def root():
    return {
        "service":   "KubeShield Security Service",
        "version":   "1.0.0",
        "endpoints": {
            "health":           "GET  /health",
            "analyze_rbac":     "POST /analyze/rbac",
            "analyze_pod":      "POST /analyze/pod",
            "analyze_secret":   "POST /analyze/secret",    
            "analyze_network":  "POST /analyze/network",   
            "analyze_all":      "POST /analyze",
            "docs":             "GET  /docs",
        }
    }

@app.get("/health")
def health():
    return {"status": "ok", "service": "security-service"}


# ── Per-module endpoints — useful for isolated testing ─────────────────────

@app.post("/analyze/rbac")
async def analyze_rbac_endpoint(req: AnalyzeRequest):
    """Run RBAC analysis only. Useful for testing the RBAC module in isolation."""
    try:
        _, rbac_v1, _ = load_clients(req.kubeconfig_content)
        findings = analyze_rbac(rbac_v1)
        return {
            "module":   "rbac",
            "findings": [f.model_dump() for f in findings],
            "total":    len(findings),
            **summarize(findings),
        }
    except ApiException as e:
        logger.error(f"Kubernetes API error: {e}")
        raise HTTPException(status_code=502, detail=f"Kubernetes API error: {e.reason}")
    except Exception as e:
        logger.error(f"RBAC analysis failed: {e}")
        raise HTTPException(status_code=500, detail=str(e))


@app.post("/analyze/pod")
async def analyze_pod_endpoint(req: AnalyzeRequest):
    """Run Pod security analysis only. Useful for testing the Pod module in isolation."""
    try:
        v1, _, _ = load_clients(req.kubeconfig_content)
        findings = analyze_pod(v1)
        return {
            "module":   "pod",
            "findings": [f.model_dump() for f in findings],
            "total":    len(findings),
            **summarize(findings),
        }
    except ApiException as e:
        logger.error(f"Kubernetes API error: {e}")
        raise HTTPException(status_code=502, detail=f"Kubernetes API error: {e.reason}")
    except Exception as e:
        logger.error(f"Pod analysis failed: {e}")
        raise HTTPException(status_code=500, detail=str(e))
    
@app.post("/analyze/secret")
async def analyze_secret_endpoint(req: AnalyzeRequest):
    """Run Secret analysis only."""
    try:
        v1, rbac_v1, _ = load_clients(req.kubeconfig_content)
        findings = analyze_secret(v1, rbac_v1)
        return {
            "module":   "secret",
            "findings": [f.model_dump() for f in findings],
            "total":    len(findings),
            **summarize(findings),
        }
    except ApiException as e:
        logger.error(f"Kubernetes API error: {e}")
        raise HTTPException(status_code=502, detail=f"Kubernetes API error: {e.reason}")
    except Exception as e:
        logger.error(f"Secret analysis failed: {e}")
        raise HTTPException(status_code=500, detail=str(e))


@app.post("/analyze/network")
async def analyze_network_endpoint(req: AnalyzeRequest):
    """Run Network analysis only."""
    try:
        v1, _, net_v1 = load_clients(req.kubeconfig_content)
        findings = analyze_network(v1, net_v1)
        return {
            "module":   "network",
            "findings": [f.model_dump() for f in findings],
            "total":    len(findings),
            **summarize(findings),
        }
    except ApiException as e:
        logger.error(f"Kubernetes API error: {e}")
        raise HTTPException(status_code=502, detail=f"Kubernetes API error: {e.reason}")
    except Exception as e:
        logger.error(f"Network analysis failed: {e}")
        raise HTTPException(status_code=500, detail=str(e))


# ── Full combined analysis ──────────────────────────────────────────────────

@app.post("/analyze")
async def analyze_all(req: AnalyzeRequest | None = None):
    """
    Run full security analysis — all modules — against the live cluster.

    Called with no body (gateway) → uses the mounted kubeconfig.
    Each analyzer is wrapped independently so a failure in one module
    (e.g. RBAC API call fails) does not block findings from other modules.
    """
    try:
        v1, rbac_v1, net_v1 = load_clients(req.kubeconfig_content if req else None)
        cluster_info = get_cluster_info(v1)

        all_findings: list[Finding] = []

        # ── RBAC ─────────────────────────────────────────────────────────
        try:
            all_findings.extend(analyze_rbac(rbac_v1))
        except Exception as e:
            logger.error(f"RBAC analyzer failed: {e}")

        # ── Pod ──────────────────────────────────────────────────────────
        try:
            all_findings.extend(analyze_pod(v1))
        except Exception as e:
            logger.error(f"Pod analyzer failed: {e}")

        # ── Secret ───────────────────────────────────────────────────
        try:
            all_findings.extend(analyze_secret(v1, rbac_v1))
        except Exception as e:
            logger.error(f"Secret analyzer failed: {e}")

        # ── Network ──────────────────────────────────────────────────
        try:
            all_findings.extend(analyze_network(v1, net_v1))
        except Exception as e:
            logger.error(f"Network analyzer failed: {e}")

        # Sort highest risk first
        all_findings.sort(key=lambda f: -f.score)

        return {
        "cluster_info": cluster_info,
        "findings":     [f.model_dump() for f in all_findings],  # ← add .model_dump()
        "total_issues": len(all_findings),
        **summarize(all_findings),
        }

    except ApiException as e:
        logger.error(f"Kubernetes API error: {e}")
        raise HTTPException(status_code=502, detail=f"Kubernetes API error: {e.reason}")
    except Exception as e:
        logger.error(f"Full analysis failed: {e}")
        raise HTTPException(status_code=500, detail=str(e))