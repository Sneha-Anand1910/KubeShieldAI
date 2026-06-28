from fastapi import FastAPI
from pydantic import BaseModel
from typing import Any
import uvicorn

from analyzers.pod.analyzer import analyze_pod

app = FastAPI(title="KubeShield Security Service")

class YAMLInput(BaseModel):
    yaml_content: dict[str, Any]

@app.post("/analyze")
def analyze(body: YAMLInput):
    parsed = body.yaml_content
    findings = analyze_pod(parsed)

    severity_order = {"Critical": 0, "High": 1, "Medium": 2, "Low": 3}
    findings.sort(key=lambda f: severity_order.get(f["Severity"], 99))

    counts = {"Critical": 0, "High": 0, "Medium": 0, "Low": 0}
    for f in findings:
        counts[f["Severity"]] = counts.get(f["Severity"], 0) + 1

    return {
        "findings": findings,
        "summary": {
            "total": len(findings),
            "by_severity": counts,
            "resource_kind": parsed.get("kind", "Unknown")
        }
    }

@app.get("/health")
def health():
    return {"status": "ok", "service": "security-service"}

if __name__ == "__main__":
    uvicorn.run(app, host="0.0.0.0", port=8000)