from kubernetes import client, config

from analyzers.network.rules.missing_network_policy import (
    check_missing_network_policy,
)
from analyzers.network.rules.default_deny_missing import (
    check_default_deny_missing,
)
from analyzers.network.rules.allow_all_network_policy import (
    check_allow_all_network_policy,
)


def analyze_network():
    """
    Analyze NetworkPolicy-related misconfigurations
    in the Kubernetes cluster.
    """

    # Load kubeconfig
    config.load_kube_config()

    core = client.CoreV1Api()
    networking = client.NetworkingV1Api()

    # Fetch live resources
    pods = core.list_pod_for_all_namespaces().items
    namespaces = core.list_namespace().items
    network_policies = (
        networking.list_network_policy_for_all_namespaces().items
    )

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

    findings = analyze_network()

    if not findings:
        print("✅ No network misconfigurations found.")

    else:
        print(f"\nFound {len(findings)} Network findings:\n")

        for finding in findings:
            print(finding.model_dump())