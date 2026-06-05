import yaml
from analyzers.pod_analyzer import analyze_pod

filename = input("Enter YAML file name: ")

with open(f"yamls/{filename}", "r") as file:
    data = yaml.safe_load(file)

container = data["spec"]["containers"][0]

findings = analyze_pod(container)

if not findings:
    print("No security issues found.")

for finding in findings:
    print("\n-------------------")
    print("Issue:", finding["Issue"])
    print("Severity:", finding["Severity"])
    print("Recommendation:", finding["Recommendation"])