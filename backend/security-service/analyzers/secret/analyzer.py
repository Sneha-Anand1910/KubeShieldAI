from analyzers.secret.rules import hardcoded
from analyzers.secret.rules import env_exposure
from analyzers.secret.rules import rbac_access


def analyze(resource):

    findings = []

    findings.extend(
        hardcoded.check(resource)
    )

    findings.extend(
        env_exposure.check(resource)
    )

    findings.extend(
        rbac_access.check(resource)
    )

    return findings