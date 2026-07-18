import React, { useState } from 'react'
import { Shield } from 'lucide-react'

const SEV_ORDER = { Critical: 0, High: 1, Medium: 2, Low: 3, Normal: 4 }
const SEV_COLORS = { Critical: '#FF4D6D', High: '#F59E0B', Medium: '#A78BFA', Low: '#10B981', Normal: 'var(--green)' }

const Badge = ({ severity }) => (
  <span style={{ padding: '2px 8px', borderRadius: 4, fontSize: 10, fontWeight: 600, fontFamily: 'var(--font-mono)', letterSpacing: '0.08em', textTransform: 'uppercase', color: SEV_COLORS[severity] || 'var(--text-muted)', background: `${SEV_COLORS[severity] || '#6B7280'}20`, border: `1px solid ${SEV_COLORS[severity] || '#6B7280'}40` }}>
    {severity}
  </span>
)

const STATUS_LABELS = {
  open: 'Open',
  acknowledged: 'Acknowledged',
  wont_fix: "Won't fix",
  false_positive: 'False positive',
}

const STATUS_FILTERS = [
  { value: 'all',            label: 'All' },
  { value: 'open',           label: 'Open' },
  { value: 'acknowledged',   label: 'Acknowledged' },
  { value: 'wont_fix',       label: "Won't fix" },
  { value: 'false_positive', label: 'False positive' },
]

const DetailPanel = ({ f, onClose, onUpdateStatus }) => {
  const [remediation, setRemediation] = useState(null)
  const [loadingFix, setLoadingFix] = useState(false)
  const [chatMessages, setChatMessages] = useState([])
  const [chatInput, setChatInput] = useState('')
  const [chatLoading, setChatLoading] = useState(false)

  async function generateRemediation() {
    setLoadingFix(true)
    try {
      const res = await fetch('/api/remediate', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ finding: f }),
      })
      const data = await res.json()
      setRemediation(data)
    } catch (e) {
      console.error('Failed to generate remediation', e)
    } finally {
      setLoadingFix(false)
    }
  }

  async function sendChatMessage() {
    if (!chatInput.trim()) return
    const message = chatInput
    setChatInput('')
    setChatMessages(prev => [...prev, { role: 'user', content: message }])
    setChatLoading(true)
    try {
      const res = await fetch('/api/chat/finding', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ finding: f, message }),
      })
      const data = await res.json()
      setChatMessages(prev => [...prev, { role: 'assistant', content: data.reply }])
    } catch (e) {
      setChatMessages(prev => [...prev, { role: 'assistant', content: 'Failed to get a response — is ai-service running?' }])
    } finally {
      setChatLoading(false)
    }
  }

  return (
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
        <div style={{ fontSize: 10, color: 'var(--text-muted)', letterSpacing: '0.12em', textTransform: 'uppercase', marginBottom: 8 }}>Status</div>
        <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap' }}>
          {Object.entries(STATUS_LABELS).map(([value, label]) => (
            <button
              key={value}
              onClick={() => onUpdateStatus(f.finding_id, value)}
              style={{
                padding: '5px 10px',
                borderRadius: 6,
                fontSize: 11,
                fontFamily: 'var(--font-ui)',
                cursor: 'pointer',
                border: f.status === value ? '1px solid var(--cyan)' : '1px solid var(--border)',
                background: f.status === value ? 'var(--cyan-glow)' : 'transparent',
                color: f.status === value ? 'var(--cyan)' : 'var(--text-muted)',
              }}
            >
              {label}
            </button>
          ))}
        </div>
      </div>
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

      {/* ── AI remediation ─────────────────────────────────────────── */}
      <div>
        <div style={{ fontSize: 10, color: 'var(--text-muted)', letterSpacing: '0.12em', textTransform: 'uppercase', marginBottom: 8 }}>AI remediation</div>
        {!remediation && (
          <button onClick={generateRemediation} disabled={loadingFix} style={{ padding: '8px 14px', background: 'var(--cyan)', color: 'var(--bg-base)', border: 'none', borderRadius: 6, fontWeight: 600, fontSize: 12, cursor: loadingFix ? 'default' : 'pointer', opacity: loadingFix ? 0.6 : 1, fontFamily: 'var(--font-ui)' }}>
            {loadingFix ? 'Generating…' : 'Generate fix'}
          </button>
        )}
        {remediation && (
          <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
            <div style={{ fontSize: 12, color: 'var(--text-secondary)', lineHeight: 1.6 }}>{remediation.explanation}</div>

            {remediation.mode === 'explain' && remediation.yaml_snippet && (
              <pre style={{ fontFamily: 'var(--font-mono)', fontSize: 11, color: 'var(--text-primary)', background: 'var(--bg-card)', border: '1px solid var(--border)', borderRadius: 6, padding: 12, overflow: 'auto', whiteSpace: 'pre-wrap' }}>
                {remediation.yaml_snippet}
              </pre>
            )}

            {remediation.mode === 'fix' && (
              <>
                <div style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
                  <span style={{
                    padding: '3px 8px', borderRadius: 4, fontSize: 10, fontFamily: 'var(--font-mono)',
                    color: remediation.validated ? 'var(--green)' : 'var(--amber)',
                    background: remediation.validated ? 'var(--green-dim)' : 'var(--amber-dim)',
                    border: `1px solid ${remediation.validated ? 'rgba(16,185,129,0.3)' : 'rgba(245,158,11,0.3)'}`,
                  }}>
                    {remediation.validated ? '✓ Verified' : '⚠ Review before applying'}
                  </span>
                </div>
                {remediation.validation_notes && (
                  <div style={{ fontSize: 11, color: 'var(--text-muted)', lineHeight: 1.5 }}>{remediation.validation_notes}</div>
                )}
                <pre style={{ fontFamily: 'var(--font-mono)', fontSize: 11, color: 'var(--text-primary)', background: 'var(--bg-card)', border: '1px solid var(--border)', borderRadius: 6, padding: 12, overflow: 'auto', maxHeight: 240, whiteSpace: 'pre-wrap' }}>
                  {remediation.yaml_fix}
                </pre>
                <a
                  href={`/api/remediate/${f.finding_id}/download`}
                  download={`fix-${f.finding_id}.yaml`}
                  style={{ padding: '8px 14px', background: 'var(--bg-card)', color: 'var(--cyan)', border: '1px solid var(--cyan)', borderRadius: 6, fontWeight: 600, fontSize: 12, textAlign: 'center', textDecoration: 'none', fontFamily: 'var(--font-ui)' }}
                >
                  Download corrected YAML
                </a>
              </>
            )}
          </div>
        )}
      </div>

      {/* ── Chat about this finding ────────────────────────────────── */}
      <div>
        <div style={{ fontSize: 10, color: 'var(--text-muted)', letterSpacing: '0.12em', textTransform: 'uppercase', marginBottom: 8 }}>Ask a question</div>
        <div style={{ display: 'flex', flexDirection: 'column', gap: 8, maxHeight: 220, overflow: 'auto', marginBottom: 8 }}>
          {chatMessages.map((m, i) => (
            <div key={i} style={{
              alignSelf: m.role === 'user' ? 'flex-end' : 'flex-start',
              maxWidth: '85%',
              padding: '8px 10px',
              borderRadius: 8,
              fontSize: 12,
              lineHeight: 1.5,
              background: m.role === 'user' ? 'var(--cyan-glow)' : 'var(--bg-card)',
              color: m.role === 'user' ? 'var(--cyan)' : 'var(--text-secondary)',
              border: '1px solid var(--border)',
            }}>
              {m.content}
            </div>
          ))}
          {chatLoading && <div style={{ fontSize: 11, color: 'var(--text-muted)' }}>Thinking…</div>}
        </div>
        <div style={{ display: 'flex', gap: 6 }}>
          <input
            value={chatInput}
            onChange={e => setChatInput(e.target.value)}
            onKeyDown={e => { if (e.key === 'Enter') sendChatMessage() }}
            placeholder="e.g. why is this risky?"
            style={{ flex: 1, padding: '8px 10px', borderRadius: 6, border: '1px solid var(--border)', background: 'var(--bg-card)', color: 'var(--text-primary)', fontSize: 12, fontFamily: 'var(--font-ui)' }}
          />
          <button onClick={sendChatMessage} disabled={chatLoading} style={{ padding: '8px 12px', background: 'var(--cyan)', color: 'var(--bg-base)', border: 'none', borderRadius: 6, fontWeight: 600, fontSize: 12, cursor: 'pointer', fontFamily: 'var(--font-ui)' }}>
            Send
          </button>
        </div>
      </div>
    </div>
  </div>
  )
}

export default function Findings({ scanResult, onNav }) {
  const [filter, setFilter] = useState('all')
  const [selected, setSelected] = useState(null)
  const [statusOverrides, setStatusOverrides] = useState({})
  const [hideResolved, setHideResolved] = useState(false)
  const [statusFilter, setStatusFilter] = useState('all')

  async function updateStatus(findingId, status) {
    // Update immediately in the UI, then persist — don't block on the network
    setStatusOverrides(prev => ({ ...prev, [findingId]: status }))
    setSelected(prev => (prev ? { ...prev, status } : prev))
    try {
      await fetch(`/api/findings/${findingId}/status`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ status }),
      })
    } catch (e) {
      console.error('Failed to update finding status', e)
    }
  }

  if (!scanResult) {
    return (
      <div style={{ padding: '32px 40px', animation: 'fade-up 0.3s ease' }}>
        <div style={{ fontFamily: 'var(--font-mono)', fontSize: 11, color: 'var(--cyan)', letterSpacing: '0.15em', textTransform: 'uppercase', marginBottom: 8 }}>02 · Security analysis</div>
        <h1 style={{ fontFamily: 'var(--font-display)', fontSize: 28, color: 'var(--text-primary)', marginBottom: 10, textTransform: 'uppercase' }}>Findings</h1>
        <p style={{ color: 'var(--text-secondary)', fontSize: 13,  padding: 4, marginBottom: 28, width: 'fit-content', gap: 4 }}>
          Displays all security misconfigurations detected across your live cluster — RBAC, Pod, Secrets, and Network issues ranked by severity.
          </p>
        <div style={{ padding: '48px', textAlign: 'center', background: 'var(--bg-card)', border: '1px solid var(--border)', borderRadius: 'var(--radius-xl)' }}>
          <Shield size={40} color="var(--text-muted)" style={{ marginBottom: 16 }} />
          <div style={{ fontSize: 15, color: 'var(--text-secondary)', marginBottom: 16 }}>No scan run yet</div>
          <button onClick={() => onNav('ingest')} style={{ padding: '10px 24px', background: 'var(--cyan)', color: 'var(--bg-base)', border: 'none', borderRadius: 8, fontWeight: 600, fontSize: 13, cursor: 'pointer', fontFamily: 'var(--font-ui)' }}>Go to Ingest →</button>
        </div>
      </div>
    )
  }

  const findings = (scanResult.findings || []).map(f => ({
    ...f,
    status: statusOverrides[f.finding_id] ?? f.status ?? 'open',
  }))
  const filters = ['all', 'Critical', 'High', 'Medium', 'Low']
  const filtered = [...findings]
    .filter(f => filter === 'all' || f.severity === filter)
    .filter(f => statusFilter === 'all' || f.status === statusFilter)
    .filter(f => !hideResolved || f.status === 'open')
    .sort((a, b) => (SEV_ORDER[a.severity] ?? 99) - (SEV_ORDER[b.severity] ?? 99))

  const counts = { Critical: 0, High: 0, Medium: 0, Low: 0 }
  findings.forEach(f => { if (counts[f.severity] !== undefined) counts[f.severity]++ })

  const statusCounts = { all: findings.length, open: 0, acknowledged: 0, wont_fix: 0, false_positive: 0 }
  findings.forEach(f => { if (statusCounts[f.status] !== undefined) statusCounts[f.status]++ })

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
          <p style={{ color: 'var(--text-secondary)', fontSize: 13,  padding: 4, marginBottom: 28, width: 'fit-content', gap: 4 }}>
          Displays all security misconfigurations detected across your live cluster — RBAC, Pod, and Network issues Secrets issues ranked by severity.
          </p>

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

          <div style={{ display: 'flex', gap: 4, borderBottom: '1px solid var(--border)', paddingBottom: 0, alignItems: 'center', justifyContent: 'space-between' }}>
            <div style={{ display: 'flex', gap: 4 }}>
              {filters.map(f => (
                <button key={f} onClick={() => setFilter(f)} style={{ padding: '8px 14px', background: 'none', border: 'none', borderBottom: filter === f ? '2px solid var(--cyan)' : '2px solid transparent', color: filter === f ? 'var(--cyan)' : 'var(--text-muted)', cursor: 'pointer', fontSize: 12, fontWeight: filter === f ? 600 : 400, fontFamily: 'var(--font-ui)', transition: 'color 0.15s', marginBottom: -1 }}>
                  {f}
                </button>
              ))}
            </div>
            <label style={{ display: 'flex', alignItems: 'center', gap: 6, fontSize: 11, color: 'var(--text-muted)', cursor: 'pointer', paddingBottom: 8 }}>
              <input type="checkbox" checked={hideResolved} onChange={e => setHideResolved(e.target.checked)} />
              Hide acknowledged / won't-fix / false positive
            </label>
          </div>

          {/* Status filter — view findings by review status (e.g. jump to False positive to un-flag one) */}
          <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap', alignItems: 'center', marginTop: 12 }}>
            <span style={{ fontSize: 10, color: 'var(--text-muted)', letterSpacing: '0.1em', textTransform: 'uppercase', marginRight: 4 }}>Status</span>
            {STATUS_FILTERS.map(s => (
              <button key={s.value} onClick={() => setStatusFilter(s.value)} style={{
                padding: '4px 10px', borderRadius: 99, fontSize: 11, fontFamily: 'var(--font-ui)', cursor: 'pointer',
                border: statusFilter === s.value ? '1px solid var(--cyan)' : '1px solid var(--border)',
                background: statusFilter === s.value ? 'var(--cyan-glow)' : 'transparent',
                color: statusFilter === s.value ? 'var(--cyan)' : 'var(--text-muted)',
              }}>
                {s.label} ({statusCounts[s.value] ?? 0})
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
            <div key={`${f.id}-${f.namespace}-${f.resource_name}-${i}`} onClick={() => setSelected(selected === f ? null : f)} style={{ display: 'grid', gridTemplateColumns: '90px 1fr 100px 120px 100px', padding: '14px 20px', borderBottom: '1px solid var(--border)', alignItems: 'center', gap: 12, cursor: 'pointer', background: selected === f ? 'var(--cyan-glow)' : 'transparent', borderLeft: selected === f ? '2px solid var(--cyan)' : '2px solid transparent', opacity: f.status !== 'open' ? 0.5 : 1, transition: 'background 0.15s' }}
              onMouseEnter={e => { if (selected !== f) e.currentTarget.style.background = 'var(--bg-hover)' }}
              onMouseLeave={e => { if (selected !== f) e.currentTarget.style.background = 'transparent' }}
            >
              <Badge severity={f.severity} />
              <div style={{ fontSize: 13, fontWeight: 500, color: 'var(--text-primary)' }}>
                {f.title}
                {f.status !== 'open' && (
                  <span style={{ marginLeft: 8, fontSize: 10, color: 'var(--text-muted)', fontFamily: 'var(--font-mono)' }}>
                    · {STATUS_LABELS[f.status]}
                  </span>
                )}
              </div>
              <span style={{ padding: '2px 8px', borderRadius: 4, fontSize: 10, fontFamily: 'var(--font-mono)', color: 'var(--cyan)', background: 'var(--cyan-dim)', border: '1px solid var(--border)' }}>{f.module}</span>
              <div style={{ fontFamily: 'var(--font-mono)', fontSize: 10, color: 'var(--text-secondary)', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{f.namespace}</div>
              <div style={{ fontFamily: 'var(--font-mono)', fontSize: 10, color: 'var(--text-muted)', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{f.resource_name}</div>
            </div>
          ))}
          {filtered.length === 0 && <div style={{ padding: '48px', textAlign: 'center', color: 'var(--text-muted)' }}>No findings for this filter.</div>}
        </div>
      </div>
      {selected && <DetailPanel f={selected} onClose={() => setSelected(null)} onUpdateStatus={updateStatus} />}
    </div>
  )
}