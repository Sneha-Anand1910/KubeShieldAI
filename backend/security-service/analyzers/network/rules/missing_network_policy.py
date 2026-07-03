from models.finding import make_finding

SYSTEM_NAMESPACES = {
    "kube-system",
    "kube-public",
    "kube-node-lease",
    "kube-flannel",
}

def _matches_selector(pod_labels: dict, selector_labels: dict) -> bool:
    """
    Returns True if all selector labels exist on the pod.
    """

    if not selector_labels:
        # Empty selector selects all pods in the namespace
        return True

    if not pod_labels:
        return False

    for key, value in selector_labels.items():
        if pod_labels.get(key) != value:
            return False

    return True


def check_missing_network_policy(pods, network_policies):
    """
    Detect pods that are not selected by ANY NetworkPolicy.

    Args:
        pods: list of V1Pod objects
        network_policies: list of V1NetworkPolicy objects

    Returns:
        List[Finding]
    """

    findings = []

    for pod in pods:

        namespace = pod.metadata.namespace

        # Skip Kubernetes system namespaces
        if namespace in SYSTEM_NAMESPACES:
            continue

        pod_name = pod.metadata.name
        pod_labels = pod.metadata.labels or {}

        protected = False

        # Check every policy in the same namespace
        for policy in network_policies:

            if policy.metadata.namespace != namespace:
                continue

            selector = policy.spec.pod_selector

            selector_labels = {}

            if selector and selector.match_labels:
                selector_labels = selector.match_labels

            if _matches_selector(pod_labels, selector_labels):
                protected = True
                break

        if not protected:

            findings.append(
                make_finding(
                    id="NET-001",
                    title="Pod is not protected by any NetworkPolicy",
                    severity="High",
                    module="Network",
                    resource_name=pod_name,
                    namespace=namespace,
                    evidence="No NetworkPolicy selects this pod.",
                    remediation_hint=(
                        "Create a NetworkPolicy to restrict ingress and/or egress "
                        "traffic for this pod."
                    ),
                )
            )

    return findings