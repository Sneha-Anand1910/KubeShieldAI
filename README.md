<img width="1182" height="1600" alt="image" src="https://github.com/user-attachments/assets/6cfb01cd-0b9c-429e-b75b-7eb59501d52d" />

```text
KubeShieldAI/
│
├── backend/
│   │
│   ├── ingestion-service/               ── IMAGE: kubeshieldai/ingestion-service:v1
│   │   ├── Dockerfile
│   │   ├── requirements.txt
│   │   └── app.py                       ← FastAPI: kubeconfig upload + live cluster connect + PyYAML fallback
│   │
│   ├── security-service/               ── IMAGE: kubeshieldai/security-service:v1
│   │   ├── Dockerfile
│   │   ├── requirements.txt
│   │   ├── app.py
│   │   ├── models/
│   │   │   └── finding.py
│   │   └── analyzers/
│   │       ├── rbac/
│   │       │   ├── analyzer.py
│   │       │   └── rules/
│   │       │       ├── wildcard_check.py
│   │       │       ├── cluster_admin.py
│   │       │       ├── privilege_esc.py
│   │       │       └── default_sa.py
│   │       ├── pod/
│   │       │   ├── analyzer.py
│   │       │   └── rules/
│   │       │       ├── privileged.py
│   │       │       ├── root_user.py
│   │       │       ├── capabilities.py
│   │       │       ├── host_access.py
│   │       │       └── resource_limits.py
│   │       ├── secret/
│   │       │   ├── analyzer.py
│   │       │   └── rules/
│   │       │       ├── hardcoded.py
│   │       │       ├── env_exposure.py
│   │       │       └── rbac_access.py
│   │       └── network/
│   │           ├── analyzer.py
│   │           └── rules/
│   │               ├── missing_netpol.py
│   │               └── exposed_services.py
│   │
│   ├── scoring-service/                ── IMAGE: kubeshieldai/scoring-service:v1
│   │   ├── Dockerfile
│   │   ├── requirements.txt
│   │   ├── app.py
│   │   └── scorer/
│   │       ├── base_score.py
│   │       ├── compound.py
│   │       └── exploit_path.py
│   │
│   └── ai-service/                     ── IMAGE: kubeshieldai/ai-service:v1
│       ├── Dockerfile
│       ├── requirements.txt
│       └── app.py
│
├── frontend/                           ── IMAGE: kubeshieldai/frontend:v1
│   ├── Dockerfile
│   ├── package.json
│   ├── vite.config.ts
│   ├── index.html
│   └── src/
│       ├── main.tsx
│       ├── App.tsx
│       └── pages/
│           ├── Connect.tsx
│           ├── Scan.tsx
│           ├── Findings.tsx
│           └── AIAdvice.tsx
│
├── monitoring/
│   ├── prometheus.yml
│   └── grafana-dashboard.json
│
├── k8s/
│   ├── namespace.yaml
│   ├── secret.yaml
│   ├── ingestion-service-deployment.yaml
│   ├── security-service-deployment.yaml
│   ├── scoring-service-deployment.yaml
│   ├── ai-service-deployment.yaml
│   ├── frontend-deployment.yaml
│   ├── prometheus-deployment.yaml
│   └── grafana-deployment.yaml
│
├── docker-compose.yml
├── .env
├── .gitignore
└── README.md
```