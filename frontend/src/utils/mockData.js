export const mockFindings = [
  { id: 'RBAC-001', title: 'Wildcard permissions on ClusterRole', severity: 'critical', module: 'RBAC', resource: 'cluster-admin-binding', score: 9.8, evidence: 'verbs: ["*"], resources: ["*"]', namespace: 'dev-sim' },
  { id: 'POD-002',  title: 'Container running as root',           severity: 'critical', module: 'Pod',  resource: 'privileged-nginx-7d4b9', score: 9.2, evidence: 'runAsUser: 0, privileged: true', namespace: 'dev-sim' },
  { id: 'SEC-003',  title: 'Secret exposed in environment variable', severity: 'high', module: 'Secrets', resource: 'secret-exposed-5c8f2', score: 8.1, evidence: 'env.value: "cGFzc3dvcmQxMjM="', namespace: 'dev-sim' },
  { id: 'POD-004',  title: 'hostPath mount on sensitive directory', severity: 'high', module: 'Pod', resource: 'hostpath-alpine-2b3c1', score: 7.9, evidence: 'hostPath.path: /etc', namespace: 'dev-sim' },
  { id: 'NET-005',  title: 'NodePort service with no NetworkPolicy', severity: 'high', module: 'Network', resource: 'nodeport-svc', score: 7.4, evidence: 'type: NodePort, no NetworkPolicy found', namespace: 'dev-sim' },
  { id: 'POD-006',  title: 'No resource limits defined',           severity: 'medium', module: 'Pod', resource: 'no-limits-pod-9a1d3', score: 5.5, evidence: 'resources: {}', namespace: 'dev-sim' },
  { id: 'POD-007',  title: 'Image using latest tag',              severity: 'medium', module: 'Pod', resource: 'latest-tag-pod-3f8c7', score: 5.1, evidence: 'image: nginx:latest', namespace: 'dev-sim' },
  { id: 'RBAC-008', title: 'ServiceAccount can list secrets cluster-wide', severity: 'medium', module: 'RBAC', resource: 'dev-sa-binding', score: 6.2, evidence: 'get/list secrets, clusterWide: true', namespace: 'dev-sim' },
  { id: 'POD-009',  title: 'allowPrivilegeEscalation not set to false', severity: 'low', module: 'Pod', resource: 'escalation-pod-1k2m9', score: 3.8, evidence: 'allowPrivilegeEscalation: true', namespace: 'dev-sim' },
  { id: 'NET-010',  title: 'Ingress has no TLS configured',       severity: 'low', module: 'Network', resource: 'app-ingress', score: 3.2, evidence: 'tls: null', namespace: 'dev-sim' },
]

export const mockScanHistory = [
  { id: 's001', timestamp: '2026-06-16T09:12:00Z', resources: 48, findings: 10, score: 74, status: 'complete' },
  { id: 's002', timestamp: '2026-06-15T14:30:00Z', resources: 32, findings: 7,  score: 61, status: 'complete' },
  { id: 's003', timestamp: '2026-06-14T11:05:00Z', resources: 55, findings: 13, score: 81, status: 'complete' },
  { id: 's004', timestamp: '2026-06-13T16:48:00Z', resources: 28, findings: 5,  score: 52, status: 'complete' },
  { id: 's005', timestamp: '2026-06-12T08:22:00Z', resources: 41, findings: 9,  score: 68, status: 'complete' },
]

export const mockParsedResources = {
  pods: 12, deployments: 5, services: 8, secrets: 6, rbacRoles: 4, networkPolicies: 2
}

export const mockAIAdvice = {
  'RBAC-001': {
    explanation: 'This ClusterRole grants wildcard permissions across all resources and verbs, effectively giving any bound subject full cluster administrator access. An attacker who compromises a pod bound to this role can read secrets, escalate privileges, delete workloads, or exfiltrate data from any namespace.',
    steps: [
      'Identify all ServiceAccounts and Users bound to this ClusterRole via kubectl get clusterrolebindings',
      'Replace the wildcard ClusterRole with a minimal role listing only the specific verbs and resources required',
      'Apply principle of least privilege — if a service only needs to read pods, grant only get and list on pods',
      'Audit bindings every sprint and remove unused ones',
    ],
    patch: `apiVersion: rbac.authorization.k8s.io/v1
kind: ClusterRole
metadata:
  name: kubeshield-reader
rules:
- apiGroups: [""]
  resources: ["pods", "services"]
  verbs: ["get", "list", "watch"]`,
  }
}

export const severityColors = {
  critical: '#FF4D6D',
  high:     '#F59E0B',
  medium:   '#A78BFA',
  low:      '#10B981',
}

export const moduleColors = {
  RBAC:    '#A78BFA',
  Pod:     '#00D4FF',
  Secrets: '#F59E0B',
  Network: '#10B981',
}
