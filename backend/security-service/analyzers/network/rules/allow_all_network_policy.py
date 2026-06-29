from models.findings import make_finding


SYSTEM_NAMESPACES = {
    "kube-system",
    "kube-public",
    "kube-node-lease",
    "kube-flannel",
}


def check_allow_all_network_policy(network_policies):
    """
    Detect NetworkPolicies that allow traffic from anywhere
    using ipBlock: 0.0.0.0/0.
    """

    findings = []

    for policy in network_policies:

        namespace = policy.metadata.namespace

        if namespace in SYSTEM_NAMESPACES:
            continue

        policy_name = policy.metadata.name

        # Check ingress rules
        ingress_rules = policy.spec.ingress or []

        for rule in ingress_rules:

            if not rule._from:
                continue

            for source in rule._from:

                if source.ip_block and source.ip_block.cidr == "0.0.0.0/0":

                    findings.append(
                        make_finding(
                            id="NET-003",
                            title="NetworkPolicy allows unrestricted ingress",
                            severity="High",
                            module="Network",
                            resource_name=policy_name,
                            namespace=namespace,
                            evidence="Ingress rule allows traffic from 0.0.0.0/0.",
                            remediation_hint=(
                                "Restrict the allowed CIDR range or use "
                                "podSelector/namespaceSelector instead."
                            ),
                        )
                    )

                    break

        # Check egress rules
        egress_rules = policy.spec.egress or []

        for rule in egress_rules:

            if not rule.to:
                continue

            for destination in rule.to:

                if (
                    destination.ip_block
                    and destination.ip_block.cidr == "0.0.0.0/0"
                ):

                    findings.append(
                        make_finding(
                            id="NET-003",
                            title="NetworkPolicy allows unrestricted egress",
                            severity="High",
                            module="Network",
                            resource_name=policy_name,
                            namespace=namespace,
                            evidence="Egress rule allows traffic to 0.0.0.0/0.",
                            remediation_hint=(
                                "Restrict outbound CIDR ranges to only "
                                "required destinations."
                            ),
                        )
                    )

                    break

    return findings