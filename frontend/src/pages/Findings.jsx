import React, { useState } from 'react'
import { Shield, Filter, ChevronDown, ChevronRight, AlertTriangle } from 'lucide-react'
import { mockFindings, severityColors } from '../utils/mockData'

const SEV_ORDER = { critical: 0, high: 1, medium: 2, low: 3 }

const Badge = ({ severity }) => (
  <span style={{
    padding: '2px 8px',
    borderRadius: 4,
    fontSize: 10,
    fontWeight: 600,
    fontFamily: 'var(--font-mono)',
    letterSpacing: '0.08em',
    textTransform: 'uppercase',
    color: severityColors[severity],
    background: `${severityColors[severity]}20`,
    border: `1px solid ${severityColors[severity]}40`,
  }}>
    {severity}
  </span>
)

const ModulePill = ({ module }) => {
  const colors = { RBAC: 'var(--purple)', Pod: 'var(--cyan)', Secrets: 'var(--amber)', Network: 'var(--green)' }
  const c = colors[module] || 'var(--text-muted)'
  return (
    <span style={{ padding: '2px 8px', borderRadius: 4, fontSize: 10, fontFamily: 'var(--font-mono)', color: c, background: `${c}18`, border: `1px solid ${c}30` }}>
      {module}
    </span>
  )
}

const FindingRow = ({ f, onSelect, selected }) => (
  <div
    onClick={() => onSelect(f)}
    style={{
      padding: '14px 20px',
      borderBottom: '1px solid var(--border)',
      display: 'grid',
      gridTemplateColumns: '90px 1fr 80px 100px 60px',
      alignItems: 'center',
      gap: 12,
      cursor: 'pointer',
      background: selected ? 'var(--cyan-glow)' : 'transparent',
      borderLeft: selected ? '2px solid var(--cyan)' : '2px solid transparent',
      transition: 'background 0.15s',
    }}
    onMouseEnter={e => { if (!selected) e.currentTarget.style.background = 'var(--bg-hover)' }}
    onMouseLeave={e => { if (!selected) e.currentTarget.style.background = 'transparent' }}
  >
    <Badge severity={f.severity} />
    <div>
      <div style={{ fontSize: 13, fontWeight: 500, color: 'var(--text-primary)', marginBottom: 2 }}>{f.title}</div>
      <div style={{ fontFamily: 'var(--font-mono)', fontSize: 10, color: 'var(--text-muted)' }}>{f.resource}</div>
    </div>
    <ModulePill module={f.module} />
    <div style={{ fontFamily: 'var(--font-mono)', fontSize: 11, color: 'var(--text-muted)' }}>{f.namespace}</div>
    <div style={{ fontFamily: 'var(--font-mono)', fontSize: 13, fontWeight: 600, color: severityColors[f.severity], textAlign: 'right' }}>
      {f.score.toFixed(1)}
    </div>
  </div>
)

const DetailPanel = ({ f, onClose }) => (
  <div style={{
    width: 360,
    background: 'var(--bg-surface)',
    borderLeft: '1px solid var(--border)',
    display: 'flex',
    flexDirection: 'column',
    animation: 'fade-up 0.2s ease',
    overflow: 'auto',
  }}>
    <div style={{ padding: '20px', borderBottom: '1px solid var(--border)', display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start' }}>
      <div>
        <Badge severity={f.severity} />
        <div style={{ fontSize: 14, fontWeight: 600, color: 'var(--text-primary)', marginTop: 8, lineHeight: 1.4 }}>{f.title}</div>
      </div>
      <button onClick={onClose} style={{ background: 'none', border: 'none', color: 'var(--text-muted)', cursor: 'pointer', fontSize: 18, lineHeight: 1 }}>×</button>
    </div>
    <div style={{ padding: '20px', display: 'flex', flexDirection: 'column', gap: 20 }}>
      <div>
        <div style={{ fontSize: 10, color: 'var(--text-muted)', letterSpacing: '0.12em', textTransform: 'uppercase', marginBottom: 8 }}>Finding ID</div>
        <div style={{ fontFamily: 'var(--font-mono)', fontSize: 12, color: 'var(--cyan)' }}>{f.id}</div>
      </div>
      <div>
        <div style={{ fontSize: 10, color: 'var(--text-muted)', letterSpacing: '0.12em', textTransform: 'uppercase', marginBottom: 8 }}>Resource</div>
        <div style={{ fontFamily: 'var(--font-mono)', fontSize: 12, color: 'var(--text-secondary)' }}>{f.resource}</div>
        <div style={{ fontFamily: 'var(--font-mono)', fontSize: 11, color: 'var(--text-muted)', marginTop: 2 }}>ns: {f.namespace}</div>
      </div>
      <div>
        <div style={{ fontSize: 10, color: 'var(--text-muted)', letterSpacing: '0.12em', textTransform: 'uppercase', marginBottom: 8 }}>Evidence</div>
        <div style={{
          fontFamily: 'var(--font-mono)',
          fontSize: 11,
          color: 'var(--amber)',
          background: 'var(--amber-dim)',
          border: '1px solid rgba(245,158,11,0.2)',
          borderRadius: 6,
          padding: '10px 12px',
          lineHeight: 1.6,
        }}>{f.evidence}</div>
      </div>
      <div>
        <div style={{ fontSize: 10, color: 'var(--text-muted)', letterSpacing: '0.12em', textTransform: 'uppercase', marginBottom: 8 }}>Risk score</div>
        <div style={{ fontSize: 28, fontFamily: 'var(--font-mono)', fontWeight: 600, color: severityColors[f.severity] }}>
          {f.score.toFixed(1)} <span style={{ fontSize: 13, color: 'var(--text-muted)', fontWeight: 400 }}>/ 10</span>
        </div>
      </div>
      <div style={{ display: 'flex', gap: 8, marginTop: 8 }}>
        <ModulePill module={f.module} />
      </div>
    </div>
  </div>
)

export default function Findings() {
  const [filter, setFilter] = useState('all')
  const [selected, setSelected] = useState(null)

  const filters = ['all', 'critical', 'high', 'medium', 'low']
  const filtered = [...mockFindings]
    .filter(f => filter === 'all' || f.severity === filter)
    .sort((a, b) => SEV_ORDER[a.severity] - SEV_ORDER[b.severity])

  const counts = { critical: 0, high: 0, medium: 0, low: 0 }
  mockFindings.forEach(f => counts[f.severity]++)

  return (
    <div style={{ display: 'flex', height: '100%', animation: 'fade-up 0.3s ease' }}>
      <div style={{ flex: 1, overflow: 'auto' }}>
        {/* Header */}
        <div style={{ padding: '32px 40px 0' }}>
          <div style={{ fontFamily: 'var(--font-mono)', fontSize: 11, color: 'var(--cyan)', letterSpacing: '0.15em', textTransform: 'uppercase', marginBottom: 8 }}>
            02 · Security analysis
          </div>
          <h1 style={{ fontSize: 28, fontWeight: 600, color: 'var(--text-primary)', marginBottom: 8 }}>Findings</h1>

          {/* Summary chips */}
          <div style={{ display: 'flex', gap: 10, marginTop: 16, marginBottom: 24 }}>
            {Object.entries(counts).map(([sev, n]) => (
              <div key={sev} style={{
                padding: '6px 14px',
                borderRadius: 'var(--radius-md)',
                background: `${severityColors[sev]}18`,
                border: `1px solid ${severityColors[sev]}40`,
                display: 'flex', alignItems: 'center', gap: 6,
              }}>
                <span style={{ fontFamily: 'var(--font-mono)', fontWeight: 600, fontSize: 16, color: severityColors[sev] }}>{n}</span>
                <span style={{ fontSize: 11, color: 'var(--text-secondary)', textTransform: 'capitalize' }}>{sev}</span>
              </div>
            ))}
          </div>

          {/* Filter tabs */}
          <div style={{ display: 'flex', gap: 4, borderBottom: '1px solid var(--border)', paddingBottom: 0 }}>
            {filters.map(f => (
              <button key={f} onClick={() => setFilter(f)} style={{
                padding: '8px 14px',
                background: 'none',
                border: 'none',
                borderBottom: filter === f ? '2px solid var(--cyan)' : '2px solid transparent',
                color: filter === f ? 'var(--cyan)' : 'var(--text-muted)',
                cursor: 'pointer',
                fontSize: 12,
                fontWeight: filter === f ? 600 : 400,
                textTransform: 'capitalize',
                fontFamily: 'var(--font-ui)',
                transition: 'color 0.15s',
                marginBottom: -1,
              }}>
                {f}
              </button>
            ))}
          </div>
        </div>

        {/* Table header */}
        <div style={{ padding: '0 40px' }}>
          <div style={{ display: 'grid', gridTemplateColumns: '90px 1fr 80px 100px 60px', gap: 12, padding: '10px 20px', borderBottom: '1px solid var(--border)' }}>
            {['Severity', 'Finding', 'Module', 'Namespace', 'Score'].map(h => (
              <div key={h} style={{ fontSize: 10, color: 'var(--text-muted)', letterSpacing: '0.1em', textTransform: 'uppercase', fontWeight: 500 }}>{h}</div>
            ))}
          </div>

          {/* Rows */}
          <div>
            {filtered.map(f => (
              <FindingRow key={f.id} f={f} onSelect={setSelected} selected={selected?.id === f.id} />
            ))}
          </div>

          {filtered.length === 0 && (
            <div style={{ padding: '48px', textAlign: 'center', color: 'var(--text-muted)' }}>
              No findings for this filter.
            </div>
          )}
        </div>
      </div>

      {/* Detail panel */}
      {selected && <DetailPanel f={selected} onClose={() => setSelected(null)} />}
    </div>
  )
}
