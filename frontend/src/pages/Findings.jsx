import React, { useState } from 'react'
import { Shield } from 'lucide-react'

const SEV_ORDER = { Critical: 0, High: 1, Medium: 2, Low: 3, Normal: 4 }
const SEV_COLORS = { Critical: '#FF4D6D', High: '#F59E0B', Medium: '#A78BFA', Low: '#10B981', Normal: 'var(--green)' }

const Badge = ({ severity }) => (
  <span style={{ padding: '2px 8px', borderRadius: 4, fontSize: 10, fontWeight: 600, fontFamily: 'var(--font-mono)', letterSpacing: '0.08em', textTransform: 'uppercase', color: SEV_COLORS[severity] || 'var(--text-muted)', background: `${SEV_COLORS[severity] || '#6B7280'}20`, border: `1px solid ${SEV_COLORS[severity] || '#6B7280'}40` }}>
    {severity}
  </span>
)

const DetailPanel = ({ f, onClose }) => (
  <div style={{ width: 360, background: 'var(--bg-surface)', borderLeft: '1px solid var(--border)', display: 'flex', flexDirection: 'column', animation: 'fade-up 0.2s ease', overflow: 'auto' }}>
    <div style={{ padding: '20px', borderBottom: '1px solid var(--border)', display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start' }}>
      <div>
        <Badge severity={f.severity} />
        <div style={{ fontSize: 14, fontWeight: 600, color: 'var(--text-primary)', marginTop: 8, lineHeight: 1.4 }}>{f.title}</div>
      </div>
      <button onClick={onClose} style={{ background: 'none', border: 'none', color: 'var(--text-muted)', cursor: 'pointer', fontSize: 18 }}>×</button>
    </div>
    <div style={{ padding: '20px', display: 'flex', flexDirection: 'column', gap: 20 }}>
      <div>
        <div style={{ fontSize: 10, color: 'var(--text-muted)', letterSpacing: '0.12em', textTransform: 'uppercase', marginBottom: 8 }}>Namespace</div>
        <div style={{ fontFamily: 'var(--font-mono)', fontSize: 12, color: 'var(--cyan)' }}>{f.namespace}</div>
      </div>
      <div>
        <div style={{ fontSize: 10, color: 'var(--text-muted)', letterSpacing: '0.12em', textTransform: 'uppercase', marginBottom: 8 }}>Resource</div>
        <div style={{ fontFamily: 'var(--font-mono)', fontSize: 12, color: 'var(--cyan)' }}>{f.resource_name}</div>
      </div>
      <div>
        <div style={{ fontSize: 10, color: 'var(--text-muted)', letterSpacing: '0.12em', textTransform: 'uppercase', marginBottom: 8 }}>Evidence</div>
        <div style={{ fontSize: 13, color: 'var(--text-secondary)', lineHeight: 1.6 }}>{f.evidence || '—'}</div>
      </div>
      <div>
        <div style={{ fontSize: 10, color: 'var(--text-muted)', letterSpacing: '0.12em', textTransform: 'uppercase', marginBottom: 8 }}>Remediation</div>
        <div style={{ fontFamily: 'var(--font-mono)', fontSize: 11, color: 'var(--amber)', background: 'var(--amber-dim)', border: '1px solid rgba(245,158,11,0.2)', borderRadius: 6, padding: '10px 12px', lineHeight: 1.6 }}>
          {f.remediation_hint || 'No remediation hint provided.'}
        </div>
      </div>
      <div>
        <div style={{ fontSize: 10, color: 'var(--text-muted)', letterSpacing: '0.12em', textTransform: 'uppercase', marginBottom: 8 }}>Module</div>
        <span style={{ padding: '3px 10px', borderRadius: 4, fontSize: 11, fontFamily: 'var(--font-mono)', color: 'var(--cyan)', background: 'var(--cyan-dim)', border: '1px solid var(--border)' }}>{f.module}</span>
      </div>
      <div>
        <div style={{ fontSize: 10, color: 'var(--text-muted)', letterSpacing: '0.12em', textTransform: 'uppercase', marginBottom: 8 }}>Risk score</div>
        <div style={{ fontFamily: 'var(--font-mono)', fontSize: 20, fontWeight: 600, color: SEV_COLORS[f.severity] || 'var(--text-primary)' }}>{f.score?.toFixed(1) ?? '—'}</div>
      </div>
    </div>
  </div>
)

export default function Findings({ scanResult, onNav }) {
  const [filter, setFilter] = useState('all')
  const [selected, setSelected] = useState(null)

  if (!scanResult) {
    return (
      <div style={{ padding: '32px 40px', animation: 'fade-up 0.3s ease' }}>
        <div style={{ fontFamily: 'var(--font-mono)', fontSize: 11, color: 'var(--cyan)', letterSpacing: '0.15em', textTransform: 'uppercase', marginBottom: 8 }}>02 · Security analysis</div>
        <h1 style={{ fontFamily: 'var(--font-display)', fontSize: 28, color: 'var(--text-primary)', marginBottom: 24, textTransform: 'uppercase' }}>Findings</h1>
        <div style={{ padding: '48px', textAlign: 'center', background: 'var(--bg-card)', border: '1px solid var(--border)', borderRadius: 'var(--radius-xl)' }}>
          <Shield size={40} color="var(--text-muted)" style={{ marginBottom: 16 }} />
          <div style={{ fontSize: 15, color: 'var(--text-secondary)', marginBottom: 16 }}>No scan run yet</div>
          <button onClick={() => onNav('ingest')} style={{ padding: '10px 24px', background: 'var(--cyan)', color: 'var(--bg-base)', border: 'none', borderRadius: 8, fontWeight: 600, fontSize: 13, cursor: 'pointer', fontFamily: 'var(--font-ui)' }}>Go to Ingest →</button>
        </div>
      </div>
    )
  }

  const findings = scanResult.findings || []
  const filters = ['all', 'Critical', 'High', 'Medium', 'Low']
  const filtered = [...findings]
    .filter(f => filter === 'all' || f.severity === filter)
    .sort((a, b) => (SEV_ORDER[a.severity] ?? 99) - (SEV_ORDER[b.severity] ?? 99))

  const counts = { Critical: 0, High: 0, Medium: 0, Low: 0 }
  findings.forEach(f => { if (counts[f.severity] !== undefined) counts[f.severity]++ })

  // "Extracted from cluster" context strip — only renders if the ingestion
  // summary was actually passed through in scanResult. See note below the
  // component about wiring this up if it's not showing yet.
  const summary = scanResult.summary

  return (
    <div style={{ display: 'flex', height: '100%', animation: 'fade-up 0.3s ease' }}>
      <div style={{ flex: 1, overflow: 'auto' }}>
        <div style={{ padding: '32px 40px 0' }}>
          <div style={{ fontFamily: 'var(--font-mono)', fontSize: 11, color: 'var(--cyan)', letterSpacing: '0.15em', textTransform: 'uppercase', marginBottom: 8 }}>02 · Security analysis</div>
          <h1 style={{ fontFamily: 'var(--font-display)', fontSize: 28, color: 'var(--text-primary)', marginBottom: 8, textTransform: 'uppercase' }}>Findings</h1>

          {summary && (
            <div style={{ fontFamily: 'var(--font-mono)', fontSize: 11, color: 'var(--text-muted)', marginBottom: 16 }}>
              Scanned: {summary.pods ?? 0} pods · {summary.deployments ?? 0} deployments · {summary.services ?? 0} services · {summary.secrets ?? 0} secrets · {summary.rbac_roles ?? 0} RBAC roles · {summary.network_policies ?? 0} network policies — {findings.length} findings across {new Set(findings.map(f => f.module)).size} modules
            </div>
          )}

          <div style={{ display: 'flex', gap: 10, marginTop: 16, marginBottom: 24 }}>
            {Object.entries(counts).map(([sev, n]) => (
              <div key={sev} style={{ padding: '6px 14px', borderRadius: 'var(--radius-md)', background: `${SEV_COLORS[sev]}18`, border: `1px solid ${SEV_COLORS[sev]}40`, display: 'flex', alignItems: 'center', gap: 6 }}>
                <span style={{ fontFamily: 'var(--font-mono)', fontWeight: 600, fontSize: 16, color: SEV_COLORS[sev] }}>{n}</span>
                <span style={{ fontSize: 11, color: 'var(--text-secondary)' }}>{sev}</span>
              </div>
            ))}
          </div>

          <div style={{ display: 'flex', gap: 4, borderBottom: '1px solid var(--border)', paddingBottom: 0 }}>
            {filters.map(f => (
              <button key={f} onClick={() => setFilter(f)} style={{ padding: '8px 14px', background: 'none', border: 'none', borderBottom: filter === f ? '2px solid var(--cyan)' : '2px solid transparent', color: filter === f ? 'var(--cyan)' : 'var(--text-muted)', cursor: 'pointer', fontSize: 12, fontWeight: filter === f ? 600 : 400, fontFamily: 'var(--font-ui)', transition: 'color 0.15s', marginBottom: -1 }}>
                {f}
              </button>
            ))}
          </div>
        </div>

        <div style={{ padding: '0 40px' }}>
          <div style={{ display: 'grid', gridTemplateColumns: '90px 1fr 100px 120px 100px', gap: 12, padding: '10px 20px', borderBottom: '1px solid var(--border)' }}>
            {['Severity', 'Finding', 'Module', 'Namespace', 'Resource'].map(h => (
              <div key={h} style={{ fontSize: 10, color: 'var(--text-muted)', letterSpacing: '0.1em', textTransform: 'uppercase', fontWeight: 500 }}>{h}</div>
            ))}
          </div>
          {filtered.map((f, i) => (
            <div key={f.id || i} onClick={() => setSelected(selected === f ? null : f)} style={{ display: 'grid', gridTemplateColumns: '90px 1fr 100px 120px 100px', padding: '14px 20px', borderBottom: '1px solid var(--border)', alignItems: 'center', gap: 12, cursor: 'pointer', background: selected === f ? 'var(--cyan-glow)' : 'transparent', borderLeft: selected === f ? '2px solid var(--cyan)' : '2px solid transparent', transition: 'background 0.15s' }}
              onMouseEnter={e => { if (selected !== f) e.currentTarget.style.background = 'var(--bg-hover)' }}
              onMouseLeave={e => { if (selected !== f) e.currentTarget.style.background = 'transparent' }}
            >
              <Badge severity={f.severity} />
              <div style={{ fontSize: 13, fontWeight: 500, color: 'var(--text-primary)' }}>{f.title}</div>
              <span style={{ padding: '2px 8px', borderRadius: 4, fontSize: 10, fontFamily: 'var(--font-mono)', color: 'var(--cyan)', background: 'var(--cyan-dim)', border: '1px solid var(--border)' }}>{f.module}</span>
              <div style={{ fontFamily: 'var(--font-mono)', fontSize: 10, color: 'var(--text-secondary)', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{f.namespace}</div>
              <div style={{ fontFamily: 'var(--font-mono)', fontSize: 10, color: 'var(--text-muted)', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{f.resource_name}</div>
            </div>
          ))}
          {filtered.length === 0 && <div style={{ padding: '48px', textAlign: 'center', color: 'var(--text-muted)' }}>No findings for this filter.</div>}
        </div>
      </div>
      {selected && <DetailPanel f={selected} onClose={() => setSelected(null)} />}
    </div>
  )
}