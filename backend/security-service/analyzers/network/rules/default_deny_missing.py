from models.finding import make_finding


SYSTEM_NAMESPACES = {
    "kube-system",
    "kube-public",
    "kube-node-lease",
    "kube-flannel",
}


def check_default_deny_missing(namespaces, network_policies):
    """
    Detect namespaces that do not have a default deny NetworkPolicy.
    """

    findings = []

    for ns in namespaces:

        namespace = ns.metadata.name

        # Skip Kubernetes system namespaces
        if namespace in SYSTEM_NAMESPACES:
            continue

        default_deny_found = False

        # Check every NetworkPolicy in this namespace
        for policy in network_policies:

            if policy.metadata.namespace != namespace:
                continue

            selector = policy.spec.pod_selector
            policy_types = policy.spec.policy_types or []

            # Empty podSelector ({}) selects ALL pods
            selector_empty = (
                selector is None or
                (
                    not selector.match_labels and
                    not selector.match_expressions
                )
            )

            if selector_empty and (
                "Ingress" in policy_types or
                "Egress" in policy_types
            ):
                default_deny_found = True
                break

        if not default_deny_found:

            findings.append(
                make_finding(
                    id="NET-002",
                    title="Namespace missing default deny NetworkPolicy",
                    severity="High",
                    module="Network",
                    resource_name=namespace,
                    namespace=namespace,
                    evidence="No default deny NetworkPolicy found.",
                    remediation_hint=(
                        "Create a default deny NetworkPolicy with "
                        "podSelector: {} and appropriate policyTypes "
                        "(Ingress and/or Egress)."
                    ),
                )
            )

    return findings