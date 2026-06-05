import streamlit as st
import yaml
import requests
import json
import sys
import os

sys.path.append(os.path.join(os.path.dirname(__file__), '..', 'analyzers'))
from pod_analyzer import analyze_pod

st.set_page_config(page_title="KubeShield AI", page_icon="🛡️", layout="wide")
st.title("KubeShield AI")
st.subheader("Kubernetes Security Scanner")

uploaded_file = st.file_uploader("Upload your Kubernetes YAML file", type=["yaml","yml"])

if uploaded_file:
    raw = uploaded_file.read().decode("utf-8")
    try:
        parsed = yaml.safe_load(raw)
        st.success("✓ YAML parsed successfully")

        with st.expander("View parsed YAML"):
            st.json(parsed)

        if st.button("🔍 Analyze Security"):
            with st.spinner("Running security analysis..."):
                try:
                    resp = requests.post(
                        "http://security-service:8000/analyze",
                        json={"yaml_content": parsed},
                        timeout=30
                    )
                    findings = resp.json()
                except:
                    st.warning("Security service not connected yet — showing local analysis")
                    containers = parsed.get("spec", {}).get("containers", [])
                    findings = {"findings": []}
                    for c in containers:
                        findings["findings"].extend(analyze_pod(c))

            st.subheader("📋 Findings")
            if findings["findings"]:
                for f in findings["findings"]:
                    if f["Severity"] == "Critical":
                        st.error(f"🔴 {f['Issue']} — {f['Recommendation']}")
                    elif f["Severity"] == "High":
                        st.warning(f"🟠 {f['Issue']} — {f['Recommendation']}")
                    else:
                        st.info(f"🟡 {f['Issue']} — {f['Recommendation']}")
            else:
                st.success("No issues found!")

    except yaml.YAMLError as e:
        st.error(f"Invalid YAML: {e}")