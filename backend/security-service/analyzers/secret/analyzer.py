"""
Secret Analyzer
Runs all Secret-related security checks.
"""

import logging

from kubernetes.client import CoreV1Api, RbacAuthorizationV1Api

from analyzers.secret.rules import (
    hardcoded,
    env_exposure,
    rbac_access,
)

from models.finding import Finding

logger = logging.getLogger(__name__)


def analyze_secret(
    v1: CoreV1Api,
    rbac_v1: RbacAuthorizationV1Api,
) -> list[Finding]:

    findings: list[Finding] = []

    logger.info("Running Secret Analyzer")

    #
    # Fetch Pods once
    #
    pods = v1.list_pod_for_all_namespaces().items

    #
    # Fetch RBAC objects once
    #
    roles = {
    (role.metadata.namespace, role.metadata.name): role
    for role in rbac_v1.list_role_for_all_namespaces().items
    }
    role_bindings = rbac_v1.list_role_binding_for_all_namespaces().items

    cluster_roles = {
    role.metadata.name: role
    for role in rbac_v1.list_cluster_role().items
    }
    cluster_role_bindings = rbac_v1.list_cluster_role_binding().items

    rbac_cache = {
        "roles": roles,
        "role_bindings": role_bindings,
        "cluster_roles": cluster_roles,
        "cluster_role_bindings": cluster_role_bindings,
    }

    logger.info(f"Scanning {len(pods)} pod(s)")

    for pod in pods:

        resource = pod.to_dict()

        findings.extend(
            hardcoded.check(resource)
        )

        findings.extend(
            env_exposure.check(resource)
        )

        findings.extend(
            rbac_access.check(
                resource,
                rbac_cache,
            )
        )

    logger.info(
        f"Secret Analyzer completed ({len(findings)} findings)"
    )

    return findings