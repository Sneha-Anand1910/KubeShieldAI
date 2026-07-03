from models.finding import Finding


def grants_secret_access(rules):
    """
    Returns True if any RBAC rule grants read access to Secrets.
    """

    for rule in rules or []:

        resources = rule.resources or []
        verbs = rule.verbs or []

        if "secrets" in resources or "*" in resources:

            if (
                "*" in verbs
                or "get" in verbs
                or "list" in verbs
                or "watch" in verbs
            ):
                return True

    return False


def check(resource, rbac_cache):

    findings = []

    metadata = resource.get("metadata", {})
    spec = resource.get("spec", {})

    pod_name = metadata.get("name", "unknown")
    namespace = metadata.get("namespace", "default")

    service_account = spec.get(
        "serviceAccountName",
        "default"
    )

    role_bindings = rbac_cache["role_bindings"]
    cluster_role_bindings = rbac_cache["cluster_role_bindings"]
    roles = rbac_cache["roles"]
    cluster_roles = rbac_cache["cluster_roles"]

    #
    # Check RoleBindings
    #
    for rb in role_bindings:

        if rb.metadata.namespace != namespace:
            continue

        matched = False

        for subject in rb.subjects or []:

            if (
                subject.kind == "ServiceAccount"
                and subject.name == service_account
                and (subject.namespace or namespace) == namespace
            ):
                matched = True
                break

        if not matched:
            continue

        role_ref = rb.role_ref

        if role_ref.kind == "Role":

            role = roles.get(
                (namespace, role_ref.name)
            )

        elif role_ref.kind == "ClusterRole":

            role = cluster_roles.get(
                role_ref.name
            )

        else:
            role = None

        if role and grants_secret_access(role.rules):

            findings.append(
                Finding(
                    id="SEC-003",
                    title="ServiceAccount Can Read Secrets",
                    severity="High",
                    module="Secrets",
                    resource_name=pod_name,
                    namespace=namespace,
                    evidence=f"ServiceAccount '{service_account}' is bound to '{role_ref.kind}/{role_ref.name}' which grants Secret read permissions.",
                    score=8.0,
                    remediation_hint="Grant Secret permissions only to workloads that require them."
                )
            )

    #
    # Check ClusterRoleBindings
    #
    for crb in cluster_role_bindings:

        matched = False

        for subject in crb.subjects or []:

            if (
                subject.kind == "ServiceAccount"
                and subject.name == service_account
                and (subject.namespace or namespace) == namespace
            ):
                matched = True
                break

        if not matched:
            continue

        role = cluster_roles.get(
            crb.role_ref.name
        )

        if role and grants_secret_access(role.rules):

            findings.append(
                Finding(
                    id="SEC-003",
                    title="Cluster-wide Secret Access",
                    severity="High",
                    module="Secrets",
                    resource_name=pod_name,
                    namespace=namespace,
                    evidence=f"ServiceAccount '{service_account}' is bound to ClusterRole '{crb.role_ref.name}' which grants Secret read permissions.",
                    score=9.0,
                    remediation_hint="Avoid granting cluster-wide Secret access unless absolutely necessary."
                )
            )

    return findings