```text 
security-service/
├── app.py                          ← FastAPI entry point (just routes, no logic)
├── requirements.txt
├── Dockerfile
│
├── analyzers/                      ← one folder per domain
│   ├── __init__.py
│   │
│   ├── rbac/
│   │   ├── __init__.py
│   │   ├── analyzer.py             ← orchestrates all RBAC rules
│   │   └── rules/
│   │       ├── __init__.py
│   │       ├── wildcard_check.py   ← checks * permissions
│   │       ├── cluster_admin.py    ← checks cluster-admin misuse
│   │       ├── privilege_esc.py    ← checks escalation chains
│   │       └── default_sa.py      ← checks default SA token automount
│   │
│   ├── pod/
│   │   ├── __init__.py
│   │   ├── analyzer.py             ← orchestrates all pod rules
│   │   └── rules/
│   │       ├── __init__.py
│   │       ├── privileged.py       ← checks privileged: true
│   │       ├── root_user.py        ← checks runAsUser: 0
│   │       ├── capabilities.py     ← checks NET_ADMIN, SYS_ADMIN etc
│   │       ├── host_access.py      ← checks hostNetwork, hostPID, hostPath
│   │       └── resource_limits.py  ← checks missing CPU/memory limits
│   │
│   ├── secret/
│   │   ├── __init__.py
│   │   ├── analyzer.py             ← orchestrates all secret rules
│   │   └── rules/
│   │       ├── __init__.py
│   │       ├── hardcoded.py        ← checks plaintext credentials in env vars
│   │       ├── env_exposure.py     ← checks secretKeyRef vs volume mount
│   │       └── rbac_access.py      ← checks who can read secrets via RBAC
│   │
│   └── network/
│       ├── __init__.py
│       ├── analyzer.py             ← orchestrates all network rules
│       └── rules/
│           ├── __init__.py
│           ├── missing_netpol.py   ← checks namespaces with no NetworkPolicy
│           └── exposed_services.py ← checks NodePort/LoadBalancer exposure
│
└── models/
    ├── __init__.py
    └── finding.py                  ← shared Finding schema used by all modules

    ```