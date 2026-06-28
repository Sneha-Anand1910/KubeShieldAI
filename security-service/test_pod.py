import yaml
from analyzers.pod.analyzer import analyze_pod

with open("/mnt/c/Users/SNEHA ANAND/Downloads/bad-pod.yaml", "r") as f:
    pod = yaml.safe_load(f)

findings = analyze_pod(pod)

for finding in findings:
    print(finding)