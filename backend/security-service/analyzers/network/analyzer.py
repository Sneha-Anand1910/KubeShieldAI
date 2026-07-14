from kubernetes.client import CoreV1Api, NetworkingV1Api

from analyzers.network.rules.missing_network_policy import (
    check_missing_network_policy,
)
from analyzers.network.rules.default_deny_missing import (
    check_default_deny_missing,
)
from analyzers.network.rules.allow_all_network_policy import (
    check_allow_all_network_policy,
)


def analyze_network(v1: CoreV1Api, net_v1: NetworkingV1Api):
    """
    Analyze NetworkPolicy-related misconfigurations in the cluster.

    Matches the same contract as analyze_rbac / analyze_pod / analyze_secret:
    accepts live Kubernetes API clients built once in app.py's load_clients(),
    rather than reloading a kubeconfig itself.
    """

    pods = v1.list_pod_for_all_namespaces().items
    namespaces = v1.list_namespace().items
    network_policies = net_v1.list_network_policy_for_all_namespaces().items

    findings = []

    # Rule 1
    findings.extend(
        check_missing_network_policy(
            pods,
            network_policies,
        )
    )

    # Rule 2
    findings.extend(
        check_default_deny_missing(
            namespaces,
            network_policies,
        )
    )

    # Rule 3
    findings.extend(
        check_allow_all_network_policy(
            network_policies,
        )
    )

    return findings


if __name__ == "__main__":
    # Local CLI testing — builds clients from your default kubeconfig,
    # same as `kubectl` would use.
    from kubernetes import config as kube_config

    kube_config.load_kube_config()
    v1 = CoreV1Api()
    net_v1 = NetworkingV1Api()

    findings = analyze_network(v1, net_v1)

    if not findings:
        print("✅ No network misconfigurations found.")
    else:
        print(f"\nFound {len(findings)} Network findings:\n")
        for finding in findings:
            print(finding.model_dump())