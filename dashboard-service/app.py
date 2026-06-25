"""
dashboard-service — KubeShield AI
Streamlit + Plotly dashboard.
Orchestrates: ingestion-service → security-service → scoring-service → ai-service
"""

import os
import io
import json
import time
import requests
import pandas as pd
import plotly.graph_objects as go
import plotly.express as px
import streamlit as st
from datetime import datetime
import yaml

# ── Service URLs (k8s ClusterIP DNS) ──────────────────────────────────────
SECURITY_SERVICE = os.getenv("SECURITY_SERVICE_URL", "http://security-service:8000")
SCORING_SERVICE  = os.getenv("SCORING_SERVICE_URL",  "http://scoring-service:8000")
AI_SERVICE       = os.getenv("AI_SERVICE_URL",        "http://ai-service:8000")

# ── Page config ────────────────────────────────────────────────────────────
st.set_page_config(
    page_title="KubeShield AI",
    page_icon="🛡️",
    layout="wide",
    initial_sidebar_state="collapsed",
)

# ── Custom CSS ─────────────────────────────────────────────────────────────
st.markdown("""
<style>
@import url('https://fonts.googleapis.com/css2?family=JetBrains+Mono:wght@400;600&family=Inter:wght@300;400;500;600&display=swap');

/* Global */
html, body, [class*="css"] {
    font-family: 'Inter', sans-serif;
    background-color: #0d1117;
    color: #e6edf3;
}

/* Header */
.ks-header {
    display: flex;
    align-items: center;
    gap: 14px;
    padding: 1.5rem 0 0.5rem;
    border-bottom: 1px solid #21262d;
    margin-bottom: 1.5rem;
}
.ks-logo {
    font-size: 2rem;
    line-height: 1;
}
.ks-title {
    font-size: 1.5rem;
    font-weight: 600;
    color: #58a6ff;
    font-family: 'JetBrains Mono', monospace;
    letter-spacing: -0.02em;
}
.ks-subtitle {
    font-size: 0.8rem;
    color: #7d8590;
    margin-top: 2px;
}

/* Metric cards */
.metric-card {
    background: #161b22;
    border: 1px solid #21262d;
    border-radius: 10px;
    padding: 1rem 1.2rem;
    text-align: center;
}
.metric-val {
    font-size: 2rem;
    font-weight: 600;
    font-family: 'JetBrains Mono', monospace;
    line-height: 1.2;
}
.metric-lbl {
    font-size: 0.72rem;
    color: #7d8590;
    text-transform: uppercase;
    letter-spacing: .06em;
    margin-top: 4px;
}

/* Severity badges */
.sev-critical { color: #ff7b72; font-weight: 600; }
.sev-high     { color: #f0883e; font-weight: 600; }
.sev-medium   { color: #e3b341; font-weight: 600; }
.sev-low      { color: #3fb950; font-weight: 600; }

/* Finding row */
.finding-row {
    background: #161b22;
    border: 1px solid #21262d;
    border-left: 4px solid #30363d;
    border-radius: 8px;
    padding: .75rem 1rem;
    margin-bottom: .5rem;
    font-size: .85rem;
}
.finding-row.critical { border-left-color: #ff7b72; }
.finding-row.high     { border-left-color: #f0883e; }
.finding-row.medium   { border-left-color: #e3b341; }
.finding-row.low      { border-left-color: #3fb950; }
.finding-title { font-weight: 500; color: #e6edf3; margin-bottom: 4px; }
.finding-meta  { color: #7d8590; font-size: .78rem; font-family: 'JetBrains Mono', monospace; }

/* AI panel */
.ai-panel {
    background: #0d1f2d;
    border: 1px solid #1f6feb;
    border-radius: 10px;
    padding: 1.2rem;
    margin-top: 1rem;
}
.ai-panel h4 { color: #58a6ff; margin: 0 0 .75rem; font-size: .95rem; }
.ai-step {
    display: flex;
    gap: 10px;
    margin-bottom: .5rem;
    font-size: .85rem;
}
.ai-step-num {
    background: #1f6feb;
    color: #fff;
    border-radius: 50%;
    width: 20px;
    height: 20px;
    display: inline-flex;
    align-items: center;
    justify-content: center;
    font-size: .7rem;
    font-weight: 600;
    flex-shrink: 0;
    margin-top: 1px;
}

/* Upload zone */
.upload-hint {
    text-align: center;
    color: #7d8590;
    font-size: .85rem;
    padding: 2rem;
    border: 2px dashed #21262d;
    border-radius: 10px;
}

/* Code block */
code {
    font-family: 'JetBrains Mono', monospace !important;
    font-size: .82rem !important;
    background: #161b22 !important;
    color: #79c0ff !important;
    padding: 2px 6px !important;
    border-radius: 4px !important;
}

/* Streamlit overrides */
.stButton > button {
    background: #21262d;
    color: #e6edf3;
    border: 1px solid #30363d;
    border-radius: 8px;
    font-family: 'Inter', sans-serif;
    font-size: .85rem;
    transition: all .15s;
}
.stButton > button:hover {
    background: #1f6feb;
    border-color: #1f6feb;
    color: #fff;
}
div[data-testid="stFileUploader"] {
    background: #161b22;
    border: 1px dashed #30363d;
    border-radius: 10px;
    padding: .5rem;
}
.stSpinner > div { border-top-color: #58a6ff !important; }
</style>
""", unsafe_allow_html=True)


# ── Helpers ────────────────────────────────────────────────────────────────

SEV_ORDER = {"CRITICAL": 0, "HIGH": 1, "MEDIUM": 2, "LOW": 3}
SEV_COLORS = {
    "CRITICAL": "#ff7b72",
    "HIGH":     "#f0883e",
    "MEDIUM":   "#e3b341",
    "LOW":      "#3fb950",
}

def sev_badge(s: str) -> str:
    cls = s.lower()
    return f'<span class="sev-{cls}">{s}</span>'


def call_security(yaml_text: str) -> dict:
    parsed = yaml.safe_load(yaml_text)  # convert string -> dict
    r = requests.post(
        f"{SECURITY_SERVICE}/analyze",
        json={"yaml_content": parsed},   # send dict, not string
        timeout=30,
    )
    r.raise_for_status()
    return r.json()


def call_scoring(findings: list) -> dict:
    r = requests.post(
        f"{SCORING_SERVICE}/score",
        json={"findings": findings},
        timeout=30,
    )
    r.raise_for_status()
    return r.json()


def call_ai(findings: list) -> dict:
    r = requests.post(
        f"{AI_SERVICE}/explain",
        json={"findings": findings, "cluster_context": "Kubernetes cluster"},
        timeout=60,
    )
    r.raise_for_status()
    return r.json()


def mock_scan_results(yaml_text: str) -> tuple[dict, dict]:
    """Returns mock security + scoring results for local dev / demo mode."""
    findings = [
        {"id": "F001", "title": "Wildcard permissions on ClusterRole",
         "severity": "CRITICAL", "module": "rbac",
         "resource_name": "admin-role", "namespace": "default",
         "evidence": "verbs: ['*'], resources: ['*']", "score": 9.5},
        {"id": "F002", "title": "Container running as root",
         "severity": "HIGH", "module": "pod",
         "resource_name": "api-pod", "namespace": "production",
         "evidence": "runAsUser: 0, runAsNonRoot: false", "score": 8.2},
        {"id": "F003", "title": "Secret exposed as environment variable",
         "severity": "HIGH", "module": "secret",
         "resource_name": "db-secret", "namespace": "default",
         "evidence": "env var DB_PASSWORD set to plain base64 string", "score": 7.8},
        {"id": "F004", "title": "NodePort service without NetworkPolicy",
         "severity": "MEDIUM", "module": "service",
         "resource_name": "frontend-svc", "namespace": "default",
         "evidence": "type: NodePort, no matching NetworkPolicy found", "score": 5.4},
        {"id": "F005", "title": "Privilege escalation allowed",
         "severity": "MEDIUM", "module": "pod",
         "resource_name": "worker-pod", "namespace": "default",
         "evidence": "allowPrivilegeEscalation: true", "score": 5.0},
        {"id": "F006", "title": "hostPath volume mount detected",
         "severity": "LOW", "module": "pod",
         "resource_name": "logger-pod", "namespace": "monitoring",
         "evidence": "hostPath: /var/log", "score": 3.2},
    ]
    sec = {"findings": findings, "total_issues": len(findings)}
    score = {"score": 87, "severity": "Critical",
             "breakdown": {"CRITICAL": 1, "HIGH": 2, "MEDIUM": 2, "LOW": 1}}
    return sec, score


def load_scan_history() -> pd.DataFrame:
    """Simulate scan history. In production, pull from PostgreSQL via scoring-service."""
    import numpy as np
    np.random.seed(42)
    dates = pd.date_range(end=datetime.now(), periods=14, freq="D")
    scores = np.clip(np.cumsum(np.random.randint(-8, 5, 14)) + 75, 30, 100)
    return pd.DataFrame({"date": dates, "score": scores.tolist()})


def make_gauge(score: int, severity: str) -> go.Figure:
    color = SEV_COLORS.get(severity.upper(), "#7d8590")
    fig = go.Figure(go.Indicator(
        mode="gauge+number",
        value=score,
        domain={"x": [0, 1], "y": [0, 1]},
        number={"font": {"color": color, "size": 48, "family": "JetBrains Mono"}},
        gauge={
            "axis": {"range": [0, 100], "tickcolor": "#7d8590",
                     "tickfont": {"color": "#7d8590", "size": 11}},
            "bar": {"color": color},
            "bgcolor": "#161b22",
            "bordercolor": "#21262d",
            "steps": [
                {"range": [0, 40],  "color": "#0d1117"},
                {"range": [40, 70], "color": "#0d1117"},
                {"range": [70, 100],"color": "#0d1117"},
            ],
            "threshold": {
                "line": {"color": color, "width": 3},
                "thickness": 0.8,
                "value": score,
            },
        },
    ))
    fig.update_layout(
        paper_bgcolor="#0d1117",
        plot_bgcolor="#0d1117",
        font_color="#e6edf3",
        margin=dict(t=20, b=10, l=30, r=30),
        height=220,
    )
    return fig


def make_severity_donut(breakdown: dict) -> go.Figure:
    labels = [k for k in breakdown if breakdown[k] > 0]
    values = [breakdown[k] for k in labels]
    colors = [SEV_COLORS.get(k, "#7d8590") for k in labels]

    fig = go.Figure(go.Pie(
        labels=labels, values=values,
        hole=0.62,
        marker=dict(colors=colors, line=dict(color="#0d1117", width=2)),
        textfont=dict(color="#e6edf3", size=12, family="Inter"),
        hovertemplate="%{label}: %{value} finding(s)<extra></extra>",
    ))
    fig.update_layout(
        paper_bgcolor="#0d1117",
        plot_bgcolor="#0d1117",
        showlegend=True,
        legend=dict(font=dict(color="#7d8590", size=11), orientation="h",
                    x=0.5, xanchor="center", y=-0.1),
        margin=dict(t=10, b=20, l=10, r=10),
        height=220,
    )
    return fig


def make_trend(df: pd.DataFrame) -> go.Figure:
    fig = go.Figure()
    fig.add_trace(go.Scatter(
        x=df["date"], y=df["score"],
        mode="lines+markers",
        line=dict(color="#1f6feb", width=2),
        marker=dict(color="#58a6ff", size=6),
        fill="tozeroy",
        fillcolor="rgba(31,111,235,0.08)",
        hovertemplate="%{x|%b %d}: score %{y}<extra></extra>",
    ))
    fig.add_hline(y=70, line_dash="dot", line_color="#f0883e",
                  annotation_text="High threshold",
                  annotation_font_color="#f0883e")
    fig.update_layout(
        paper_bgcolor="#0d1117",
        plot_bgcolor="#0d1117",
        font_color="#7d8590",
        xaxis=dict(showgrid=False, color="#7d8590"),
        yaxis=dict(showgrid=True, gridcolor="#21262d", range=[0, 105], color="#7d8590"),
        margin=dict(t=10, b=10, l=10, r=10),
        height=200,
    )
    return fig


def make_module_bar(findings: list) -> go.Figure:
    modules = {}
    for f in findings:
        m = f.get("module", "unknown")
        s = f.get("severity", "LOW")
        if m not in modules:
            modules[m] = {"CRITICAL": 0, "HIGH": 0, "MEDIUM": 0, "LOW": 0}
        modules[m][s] = modules[m].get(s, 0) + 1

    fig = go.Figure()
    for sev in ["CRITICAL", "HIGH", "MEDIUM", "LOW"]:
        fig.add_trace(go.Bar(
            name=sev,
            x=list(modules.keys()),
            y=[modules[m].get(sev, 0) for m in modules],
            marker_color=SEV_COLORS[sev],
        ))
    fig.update_layout(
        barmode="stack",
        paper_bgcolor="#0d1117",
        plot_bgcolor="#0d1117",
        font_color="#7d8590",
        xaxis=dict(showgrid=False, color="#7d8590"),
        yaxis=dict(showgrid=True, gridcolor="#21262d", color="#7d8590"),
        legend=dict(font=dict(color="#7d8590", size=11), orientation="h",
                    x=0.5, xanchor="center", y=1.1),
        margin=dict(t=30, b=10, l=10, r=10),
        height=200,
    )
    return fig


def export_pdf(findings: list, score_data: dict) -> bytes:
    """Simple text-based PDF export using reportlab if available, else plain text."""
    try:
        from reportlab.lib.pagesizes import A4
        from reportlab.platypus import SimpleDocTemplate, Paragraph, Spacer, Table, TableStyle
        from reportlab.lib.styles import getSampleStyleSheet, ParagraphStyle
        from reportlab.lib import colors
        from reportlab.lib.units import mm

        buf = io.BytesIO()
        doc = SimpleDocTemplate(buf, pagesize=A4,
                                leftMargin=20*mm, rightMargin=20*mm,
                                topMargin=20*mm, bottomMargin=20*mm)
        styles = getSampleStyleSheet()
        story = []

        # Title
        title_style = ParagraphStyle("title", fontSize=18, fontName="Helvetica-Bold",
                                     spaceAfter=6, textColor=colors.HexColor("#1f6feb"))
        story.append(Paragraph("KubeShield AI — Security Report", title_style))
        story.append(Paragraph(f"Generated: {datetime.now().strftime('%Y-%m-%d %H:%M')}",
                                styles["Normal"]))
        story.append(Spacer(1, 10*mm))

        # Score summary
        story.append(Paragraph(
            f"Risk Score: {score_data.get('score', 'N/A')} — {score_data.get('severity', 'N/A')}",
            ParagraphStyle("score", fontSize=14, fontName="Helvetica-Bold",
                           textColor=colors.HexColor("#ff7b72"))))
        story.append(Spacer(1, 6*mm))

        # Findings table
        story.append(Paragraph("Findings", styles["Heading2"]))
        table_data = [["#", "Title", "Severity", "Module", "Resource"]]
        for i, f in enumerate(findings, 1):
            table_data.append([
                str(i), f.get("title",""), f.get("severity",""),
                f.get("module",""), f.get("resource_name","")
            ])

        tbl = Table(table_data, colWidths=[10*mm, 70*mm, 22*mm, 22*mm, 40*mm])
        tbl.setStyle(TableStyle([
            ("BACKGROUND", (0,0), (-1,0), colors.HexColor("#1f6feb")),
            ("TEXTCOLOR", (0,0), (-1,0), colors.white),
            ("FONTNAME", (0,0), (-1,0), "Helvetica-Bold"),
            ("FONTSIZE", (0,0), (-1,-1), 8),
            ("ROWBACKGROUNDS", (0,1), (-1,-1), [colors.white, colors.HexColor("#f6f8fa")]),
            ("GRID", (0,0), (-1,-1), 0.5, colors.HexColor("#d0d7de")),
            ("VALIGN", (0,0), (-1,-1), "TOP"),
        ]))
        story.append(tbl)
        doc.build(story)
        return buf.getvalue()
    except ImportError:
        # Fallback: plain text report
        lines = [
            "KubeShield AI — Security Report",
            f"Generated: {datetime.now().strftime('%Y-%m-%d %H:%M')}",
            f"Risk Score: {score_data.get('score', 'N/A')} ({score_data.get('severity','N/A')})",
            "",
            "FINDINGS:",
        ]
        for i, f in enumerate(findings, 1):
            lines.append(f"{i}. [{f.get('severity','')}] {f.get('title','')} — {f.get('resource_name','')} ({f.get('module','')})")
        return "\n".join(lines).encode()


# ── Session state init ─────────────────────────────────────────────────────
for key in ["sec_result", "score_result", "ai_result", "findings", "yaml_text", "demo_mode"]:
    if key not in st.session_state:
        st.session_state[key] = None

if "demo_mode" not in st.session_state:
    st.session_state.demo_mode = False


# ── Header ─────────────────────────────────────────────────────────────────
st.markdown("""
<div class="ks-header">
  <span class="ks-logo">🛡️</span>
  <div>
    <div class="ks-title">KubeShield AI</div>
    <div class="ks-subtitle">Kubernetes Security Assessment &amp; Remediation</div>
  </div>
</div>
""", unsafe_allow_html=True)


# ── Tabs ───────────────────────────────────────────────────────────────────
tab_scan, tab_findings, tab_ai, tab_history = st.tabs([
    "🔍  Scan", "📋  Findings", "🤖  AI Advice", "📈  History"
])


# ══════════════════════════════════════════════════════════════════════════
# TAB 1 — SCAN
# ══════════════════════════════════════════════════════════════════════════
with tab_scan:
    col_upload, col_metrics = st.columns([1.2, 1], gap="large")

    with col_upload:
        st.markdown("#### Upload YAML configuration")
        uploaded = st.file_uploader(
            "Drop your Kubernetes YAML file here",
            type=["yaml", "yml"],
            label_visibility="collapsed",
        )

        demo_col, scan_col = st.columns(2)
        with demo_col:
            if st.button("▶  Run Demo", use_container_width=True):
                st.session_state.demo_mode = True
                st.session_state.yaml_text = "# demo mode — using mock misconfigured cluster YAML"
                with st.spinner("Running demo scan..."):
                    time.sleep(1.2)
                    sec, score = mock_scan_results(st.session_state.yaml_text)
                    st.session_state.sec_result = sec
                    st.session_state.score_result = score
                    st.session_state.findings = sec.get("findings", [])
                    st.session_state.ai_result = None
                st.success(f"Demo scan complete — {len(st.session_state.findings)} findings detected")

        with scan_col:
            scan_disabled = uploaded is None
            if st.button("🔎  Scan YAML", disabled=scan_disabled, use_container_width=True):
                yaml_text = uploaded.read().decode("utf-8")
                st.session_state.yaml_text = yaml_text
                st.session_state.demo_mode = False
                st.session_state.ai_result = None
                with st.spinner("Analyzing security configuration..."):
                    try:
                        sec = call_security(yaml_text)
                        st.session_state.sec_result = sec
                        findings = sec.get("findings", [])
                        score = call_scoring(findings)
                        st.session_state.score_result = score
                        st.session_state.findings = findings
                        st.success(f"Scan complete — {len(findings)} findings detected")
                    except requests.exceptions.ConnectionError:
                        st.warning("Security service unavailable — showing demo data")
                        sec, score = mock_scan_results(yaml_text)
                        st.session_state.sec_result = sec
                        st.session_state.score_result = score
                        st.session_state.findings = sec.get("findings", [])
                    except Exception as e:
                        st.error(f"Scan failed: {e}")

    with col_metrics:
        if st.session_state.score_result:
            score_data = st.session_state.score_result
            score_val = score_data.get("score", 0)
            severity  = score_data.get("severity", "Unknown")
            breakdown = score_data.get("breakdown", {})
            findings  = st.session_state.findings or []

            # Gauge
            st.plotly_chart(make_gauge(score_val, severity), use_container_width=True,
                            config={"displayModeBar": False})

            # Mini stat row
            c1, c2, c3, c4 = st.columns(4)
            sev_counts = breakdown if breakdown else {
                s: sum(1 for f in findings if f.get("severity") == s)
                for s in ["CRITICAL", "HIGH", "MEDIUM", "LOW"]
            }
            for col, (label, color) in zip(
                [c1, c2, c3, c4],
                [("CRITICAL","#ff7b72"),("HIGH","#f0883e"),("MEDIUM","#e3b341"),("LOW","#3fb950")]
            ):
                with col:
                    st.markdown(
                        f'<div class="metric-card">'
                        f'<div class="metric-val" style="color:{color}">{sev_counts.get(label,0)}</div>'
                        f'<div class="metric-lbl">{label}</div>'
                        f'</div>',
                        unsafe_allow_html=True,
                    )
        else:
            st.markdown(
                '<div class="upload-hint">Upload a YAML file and click <b>Scan</b><br>'
                'or run the built-in demo to see results</div>',
                unsafe_allow_html=True,
            )

    # Charts row
    if st.session_state.findings:
        findings = st.session_state.findings
        breakdown = st.session_state.score_result.get("breakdown", {}) if st.session_state.score_result else {}

        st.markdown("---")
        ch1, ch2 = st.columns(2, gap="large")
        with ch1:
            st.markdown("**Findings by severity**")
            st.plotly_chart(make_severity_donut(breakdown or {
                s: sum(1 for f in findings if f.get("severity") == s)
                for s in ["CRITICAL","HIGH","MEDIUM","LOW"]
            }), use_container_width=True, config={"displayModeBar": False})
        with ch2:
            st.markdown("**Findings by module**")
            st.plotly_chart(make_module_bar(findings), use_container_width=True,
                            config={"displayModeBar": False})


# ══════════════════════════════════════════════════════════════════════════
# TAB 2 — FINDINGS
# ══════════════════════════════════════════════════════════════════════════
with tab_findings:
    findings = st.session_state.findings
    if not findings:
        st.info("Run a scan first to see findings here.")
    else:
        # Filter controls
        fc1, fc2, fc3 = st.columns([1, 1, 2])
        with fc1:
            sev_filter = st.multiselect(
                "Severity", ["CRITICAL", "HIGH", "MEDIUM", "LOW"],
                default=["CRITICAL", "HIGH", "MEDIUM", "LOW"],
            )
        with fc2:
            modules = list(set(f.get("module","") for f in findings))
            mod_filter = st.multiselect("Module", modules, default=modules)
        with fc3:
            search = st.text_input("Search findings", placeholder="resource name, title...")

        # Apply filters
        filtered = [
            f for f in findings
            if f.get("severity") in sev_filter
            and f.get("module") in mod_filter
            and (not search or search.lower() in json.dumps(f).lower())
        ]

        # Sort by score desc
        filtered.sort(key=lambda f: -f.get("score", 0))

        st.markdown(f"**{len(filtered)} of {len(findings)} findings shown**")

        for f in filtered:
            sev = f.get("severity","").lower()
            st.markdown(f"""
<div class="finding-row {sev}">
  <div class="finding-title">{f.get('title','')}</div>
  <div class="finding-meta">
    [{f.get('severity','')}] &nbsp;·&nbsp;
    {f.get('module','').upper()} module &nbsp;·&nbsp;
    {f.get('resource_name','')} &nbsp;·&nbsp;
    ns: {f.get('namespace','default')} &nbsp;·&nbsp;
    score: {f.get('score', 0):.1f}
  </div>
  <div style="color:#7d8590;font-size:.78rem;margin-top:5px">{f.get('evidence','')}</div>
</div>
""", unsafe_allow_html=True)

        # Export buttons
        st.markdown("---")
        exp_col1, exp_col2 = st.columns(2)
        with exp_col1:
            # CSV export
            df_exp = pd.DataFrame(findings)
            csv_data = df_exp.to_csv(index=False).encode()
            st.download_button(
                "⬇  Export CSV",
                data=csv_data,
                file_name=f"kubeshield_findings_{datetime.now().strftime('%Y%m%d_%H%M')}.csv",
                mime="text/csv",
                use_container_width=True,
            )
        with exp_col2:
            # PDF export
            pdf_data = export_pdf(findings, st.session_state.score_result or {})
            mime = "application/pdf" if pdf_data[:4] == b"%PDF" else "text/plain"
            ext  = "pdf" if mime == "application/pdf" else "txt"
            st.download_button(
                "⬇  Export PDF Report",
                data=pdf_data,
                file_name=f"kubeshield_report_{datetime.now().strftime('%Y%m%d_%H%M')}.{ext}",
                mime=mime,
                use_container_width=True,
            )


# ══════════════════════════════════════════════════════════════════════════
# TAB 3 — AI ADVICE
# ══════════════════════════════════════════════════════════════════════════
with tab_ai:
    findings = st.session_state.findings
    if not findings:
        st.info("Run a scan first to get AI remediation advice.")
    else:
        if st.button("🤖  Get AI Remediation Advice", use_container_width=False):
            with st.spinner("Calling Gemini AI — building remediation plan..."):
                try:
                    result = call_ai(findings)
                    st.session_state.ai_result = result
                except requests.exceptions.ConnectionError:
                    # ai-service is down — call mock directly
                    from app import mock_response
                    class _F:
                        pass
                    # simple mock
                    st.session_state.ai_result = {
                        "explanation": "Mock AI response — ai-service not reachable.",
                        "remediation": ["Fix RBAC wildcards", "Set runAsNonRoot: true", "Use secretKeyRef"],
                        "examples": ["# example\napiVersion: v1\nkind: Pod"],
                        "severity_summary": "Critical issues require immediate attention.",
                        "findings_count": len(findings),
                    }
                except Exception as e:
                    st.error(f"AI service error: {e}")

        ai = st.session_state.ai_result
        if ai:
            # Summary box
            st.markdown(f"""
<div class="ai-panel">
  <h4>🛡️ Security Assessment</h4>
  <p style="color:#e6edf3;font-size:.9rem;line-height:1.6">{ai.get('explanation','')}</p>
  <div style="color:#7d8590;font-size:.8rem;margin-top:.75rem;border-top:1px solid #1f6feb;padding-top:.75rem">
    {ai.get('severity_summary','')}
  </div>
</div>
""", unsafe_allow_html=True)

            # Remediation steps
            st.markdown("#### 🔧 Remediation Steps")
            remediation = ai.get("remediation", [])
            for i, step in enumerate(remediation, 1):
                st.markdown(f"""
<div class="ai-step">
  <span class="ai-step-num">{i}</span>
  <span style="color:#e6edf3;font-size:.88rem;line-height:1.5">{step}</span>
</div>
""", unsafe_allow_html=True)

            # YAML examples
            examples = ai.get("examples", [])
            if examples:
                st.markdown("#### 📄 Secure Configuration Examples")
                for i, ex in enumerate(examples, 1):
                    st.markdown(f"**Example {i}**")
                    st.code(ex, language="yaml")


# ══════════════════════════════════════════════════════════════════════════
# TAB 4 — HISTORY
# ══════════════════════════════════════════════════════════════════════════
with tab_history:
    st.markdown("#### Risk Score Trend (last 14 days)")
    df_hist = load_scan_history()
    st.plotly_chart(make_trend(df_hist), use_container_width=True,
                    config={"displayModeBar": False})

    st.markdown("#### Recent Scans")
    history_rows = []
    for i in range(len(df_hist) - 1, max(len(df_hist)-8, -1), -1):
        row = df_hist.iloc[i]
        score = int(row["score"])
        sev = "CRITICAL" if score >= 80 else "HIGH" if score >= 60 else "MEDIUM" if score >= 40 else "LOW"
        history_rows.append({
            "Date": row["date"].strftime("%Y-%m-%d"),
            "Score": score,
            "Severity": sev,
            "Findings": abs(score - 40) // 3 + 2,
        })

    df_display = pd.DataFrame(history_rows)
    st.dataframe(df_display, use_container_width=True, hide_index=True)