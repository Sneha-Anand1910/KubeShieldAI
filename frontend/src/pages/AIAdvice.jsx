import React, { useState, useRef, useEffect } from 'react'
import { Sparkles, ChevronDown, ChevronUp, Copy, Check, Loader, MessageSquare, Send, X, ShieldAlert, CheckCircle, AlertTriangle } from 'lucide-react'

const SEV_COLORS = { Critical: '#FF4D6D', High: '#F59E0B', Medium: '#A78BFA', Low: '#10B981' }
const SEV_ORDER  = { Critical: 0, High: 1, Medium: 2, Low: 3 }

// ── Code block with copy button ──────────────────────────────────────────────
const CodeBlock = ({ code }) => {
  const [copied, setCopied] = useState(false)
  return (
    <div style={{ position: 'relative', marginTop: 10 }}>
      <pre style={{ fontFamily: 'var(--font-mono)', fontSize: 12, color: 'var(--cyan)', background: 'var(--bg-base)', border: '1px solid var(--border)', borderRadius: 8, padding: '14px 16px', overflow: 'auto', lineHeight: 1.7, margin: 0, whiteSpace: 'pre-wrap' }}>{code}</pre>
      <button
        onClick={() => { navigator.clipboard?.writeText(code); setCopied(true); setTimeout(() => setCopied(false), 2000) }}
        style={{ position: 'absolute', top: 8, right: 8, background: 'var(--bg-elevated)', border: '1px solid var(--border)', borderRadius: 6, padding: '3px 8px', cursor: 'pointer', color: copied ? 'var(--green)' : 'var(--text-muted)', display: 'flex', alignItems: 'center', gap: 4, fontSize: 11, fontFamily: 'var(--font-ui)' }}
      >
        {copied ? <Check size={11} /> : <Copy size={11} />} {copied ? 'Copied' : 'Copy'}
      </button>
    </div>
  )
}

// ── Severity badge ────────────────────────────────────────────────────────────
const Badge = ({ severity }) => (
  <span style={{ padding: '2px 8px', borderRadius: 4, fontSize: 10, fontWeight: 600, fontFamily: 'var(--font-mono)', letterSpacing: '0.08em', textTransform: 'uppercase', color: SEV_COLORS[severity] || 'var(--text-muted)', background: `${SEV_COLORS[severity] || '#6B7280'}20`, border: `1px solid ${SEV_COLORS[severity] || '#6B7280'}40` }}>
    {severity}
  </span>
)

// ── Inline chat panel for one finding ────────────────────────────────────────
const FindingChat = ({ finding }) => {
  const [messages, setMessages]   = useState([])
  const [input, setInput]         = useState('')
  const [loading, setLoading]     = useState(false)
  const bottomRef = useRef(null)

  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: 'smooth' })
  }, [messages])

  const send = async () => {
    if (!input.trim() || loading) return
    const userMsg = input.trim()
    setInput('')
    setMessages(prev => [...prev, { role: 'user', content: userMsg }])
    setLoading(true)
    try {
      const res = await fetch('/api/ai/chat/finding', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          finding,
          chat_history: messages,
          message: userMsg,
        }),
      })
      const data = await res.json()
      setMessages(prev => [...prev, { role: 'assistant', content: data.reply || data.detail || 'No response', cached: data.cached }])
    } catch (e) {
      setMessages(prev => [...prev, { role: 'assistant', content: `Error: ${e.message}` }])
    } finally {
      setLoading(false)
    }
  }

  return (
    <div style={{ marginTop: 16, border: '1px solid var(--border)', borderRadius: 8, overflow: 'hidden' }}>
      {/* Chat history */}
      <div style={{ maxHeight: 260, overflowY: 'auto', padding: '12px 14px', background: 'var(--bg-base)', display: 'flex', flexDirection: 'column', gap: 10 }}>
        {messages.length === 0 && (
          <div style={{ fontSize: 12, color: 'var(--text-muted)', fontStyle: 'italic' }}>
            Ask anything about this finding — e.g. "Why is this dangerous?" or "Show me the kubectl command to fix it."
          </div>
        )}
        {messages.map((m, i) => (
          <div key={i} style={{ display: 'flex', flexDirection: 'column', alignItems: m.role === 'user' ? 'flex-end' : 'flex-start', gap: 4 }}>
            <div style={{ maxWidth: '85%', padding: '8px 12px', borderRadius: 8, fontSize: 12, lineHeight: 1.6, background: m.role === 'user' ? 'var(--cyan-dim)' : 'var(--bg-elevated)', color: m.role === 'user' ? 'var(--cyan)' : 'var(--text-secondary)', border: `1px solid ${m.role === 'user' ? 'var(--border-strong)' : 'var(--border)'}` }}>
              {m.content}
            </div>
            {m.cached && (
              <span style={{ display: 'flex', alignItems: 'center', gap: 4, fontSize: 10, color: 'var(--text-muted)', background: 'var(--bg-elevated)', border: '1px solid var(--border)', padding: '2px 8px', borderRadius: 10 }}>
                Cached from earlier
              </span>
            )}
          </div>
        ))}
        {loading && (
          <div style={{ display: 'flex', alignItems: 'center', gap: 6, color: 'var(--text-muted)', fontSize: 12 }}>
            <Loader size={12} style={{ animation: 'spin 1s linear infinite' }} /> Gemini is thinking…
          </div>
        )}
        <div ref={bottomRef} />
      </div>

      {/* Input */}
      <div style={{ display: 'flex', gap: 8, padding: '10px 12px', background: 'var(--bg-card)', borderTop: '1px solid var(--border)' }}>
        <input
          value={input}
          onChange={e => setInput(e.target.value)}
          onKeyDown={e => e.key === 'Enter' && !e.shiftKey && send()}
          placeholder="Ask about this finding…"
          style={{ flex: 1, background: 'var(--bg-base)', border: '1px solid var(--border)', borderRadius: 6, padding: '7px 12px', fontSize: 12, color: 'var(--text-primary)', fontFamily: 'var(--font-ui)', outline: 'none' }}
        />
        <button
          onClick={send}
          disabled={loading || !input.trim()}
          style={{ padding: '7px 12px', background: loading ? 'var(--bg-elevated)' : 'var(--cyan-dim)', border: '1px solid var(--border-strong)', borderRadius: 6, cursor: loading ? 'default' : 'pointer', color: 'var(--cyan)', display: 'flex', alignItems: 'center' }}
        >
          <Send size={13} />
        </button>
      </div>
    </div>
  )
}

// ── Per-finding card ──────────────────────────────────────────────────────────
const FindingCard = ({ finding }) => {
  const [open, setOpen]             = useState(false)
  const [showChat, setShowChat]     = useState(false)
  const [remediation, setRemediation] = useState(null)
  const [loading, setLoading]       = useState(false)
  const [error, setError]           = useState('')

  const fetchRemediation = async () => {
    if (remediation) { setOpen(true); return }
    setLoading(true)
    setError('')
    try {
      const res = await fetch('/api/ai/remediate', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ finding, cluster_context: 'KubeShield test cluster' }),
      })
      if (!res.ok) throw new Error(await res.text())
      setRemediation(await res.json())
      setOpen(true)
    } catch (e) {
      setError(e.message)
    } finally {
      setLoading(false)
    }
  }

  const isHighCrit = ['Critical', 'High'].includes(finding.severity)

  return (
    <div style={{ background: 'var(--bg-card)', border: `1px solid ${SEV_COLORS[finding.severity] || 'var(--border)'}30`, borderLeft: `3px solid ${SEV_COLORS[finding.severity] || 'var(--border)'}`, borderRadius: 'var(--radius-xl)', overflow: 'hidden' }}>

      {/* Header row */}
      <div style={{ padding: '14px 18px', display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', gap: 12 }}>
        <div style={{ flex: 1, minWidth: 0 }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 4, flexWrap: 'wrap' }}>
            <Badge severity={finding.severity} />
            <span style={{ fontSize: 10, fontFamily: 'var(--font-mono)', color: 'var(--text-muted)', background: 'var(--bg-elevated)', padding: '2px 6px', borderRadius: 4 }}>{finding.module}</span>
            <span style={{ fontSize: 10, color: 'var(--text-muted)' }}>{finding.resource_name}</span>
            {finding.namespace && finding.namespace !== 'cluster-wide' && (
              <span style={{ fontSize: 10, color: 'var(--text-muted)' }}>· {finding.namespace}</span>
            )}
          </div>
          <div style={{ fontSize: 13, fontWeight: 600, color: 'var(--text-primary)', lineHeight: 1.4 }}>{finding.title}</div>
          {finding.evidence && (
            <div style={{ fontSize: 11, color: 'var(--text-muted)', fontFamily: 'var(--font-mono)', marginTop: 4, wordBreak: 'break-all' }}>{finding.evidence}</div>
          )}
        </div>

        {/* Score pill */}
        <div style={{ flexShrink: 0, padding: '4px 10px', borderRadius: 20, background: `${SEV_COLORS[finding.severity] || '#6B7280'}15`, border: `1px solid ${SEV_COLORS[finding.severity] || '#6B7280'}30`, fontSize: 12, fontWeight: 700, color: SEV_COLORS[finding.severity] || 'var(--text-muted)', fontFamily: 'var(--font-mono)' }}>
          {finding.score?.toFixed(1)}/10
        </div>
      </div>

      {/* Action buttons */}
      <div style={{ padding: '0 18px 14px', display: 'flex', gap: 8, flexWrap: 'wrap' }}>
        <button
          onClick={fetchRemediation}
          disabled={loading}
          style={{ display: 'flex', alignItems: 'center', gap: 6, padding: '6px 14px', background: loading ? 'var(--bg-elevated)' : 'var(--purple-dim)', border: '1px solid rgba(167,139,250,0.3)', color: 'var(--purple)', borderRadius: 6, fontSize: 12, fontWeight: 600, cursor: loading ? 'default' : 'pointer', fontFamily: 'var(--font-ui)' }}
        >
          {loading
            ? <><Loader size={12} style={{ animation: 'spin 1s linear infinite' }} /> Analysing…</>
            : <><Sparkles size={12} /> {isHighCrit ? 'Generate fix' : 'Explain'}</>
          }
        </button>

        <button
          onClick={() => setShowChat(c => !c)}
          style={{ display: 'flex', alignItems: 'center', gap: 6, padding: '6px 14px', background: showChat ? 'var(--cyan-dim)' : 'var(--bg-elevated)', border: `1px solid ${showChat ? 'var(--border-strong)' : 'var(--border)'}`, color: showChat ? 'var(--cyan)' : 'var(--text-muted)', borderRadius: 6, fontSize: 12, fontWeight: 600, cursor: 'pointer', fontFamily: 'var(--font-ui)' }}
        >
          <MessageSquare size={12} /> Ask AI
        </button>
      </div>

      {/* Error */}
      {error && (
        <div style={{ margin: '0 18px 14px', padding: '8px 12px', background: 'var(--coral-dim)', border: '1px solid rgba(255,77,109,0.2)', borderRadius: 6, color: 'var(--coral)', fontSize: 11, fontFamily: 'var(--font-mono)' }}>{error}</div>
      )}

      {/* Remediation panel */}
      {remediation && open && (
        <div style={{ borderTop: '1px solid var(--border)', padding: '16px 18px', background: 'var(--bg-base)', animation: 'fade-up 0.2s ease' }}>

          {/* Explanation */}
          <div style={{ marginBottom: 14 }}>
            <div style={{ fontSize: 10, color: 'var(--text-muted)', letterSpacing: '0.12em', textTransform: 'uppercase', marginBottom: 6 }}>Explanation</div>
            <p style={{ fontSize: 13, color: 'var(--text-secondary)', lineHeight: 1.7, margin: 0 }}>{remediation.explanation}</p>
          </div>

          {/* Low/Medium — yaml snippet */}
          {remediation.yaml_snippet && (
            <div style={{ marginBottom: 14 }}>
              <div style={{ fontSize: 10, color: 'var(--text-muted)', letterSpacing: '0.12em', textTransform: 'uppercase', marginBottom: 4 }}>Fix snippet</div>
              <CodeBlock code={remediation.yaml_snippet} />
            </div>
          )}

          {/* High/Critical — full deployable YAML */}
          {remediation.yaml_fix && (
            <div style={{ marginBottom: 14 }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 6 }}>
                <div style={{ fontSize: 10, color: 'var(--text-muted)', letterSpacing: '0.12em', textTransform: 'uppercase' }}>Complete corrected manifest</div>
                {remediation.validated === true && (
                  <span style={{ display: 'flex', alignItems: 'center', gap: 4, fontSize: 10, color: 'var(--green)', background: 'rgba(16,185,129,0.1)', border: '1px solid rgba(16,185,129,0.3)', padding: '2px 8px', borderRadius: 10 }}>
                    <CheckCircle size={10} /> Verified by Gemini
                  </span>
                )}
                {remediation.cached && (
                  <span style={{ display: 'flex', alignItems: 'center', gap: 4, fontSize: 10, color: 'var(--text-muted)', background: 'var(--bg-elevated)', border: '1px solid var(--border)', padding: '2px 8px', borderRadius: 10 }}>
                    <Loader size={10} style={{ transform: 'rotate(0deg)' }} /> Cached from earlier
                  </span>
                )}
              </div>
              <CodeBlock code={remediation.yaml_fix} />
              {remediation.validation_notes && (
                <div style={{ marginTop: 8, fontSize: 11, color: 'var(--text-muted)', fontStyle: 'italic' }}>{remediation.validation_notes}</div>
              )}
            </div>
          )}

          {/* Remediation hint from finding */}
          {finding.remediation_hint && (
            <div style={{ padding: '8px 12px', background: 'var(--cyan-dim)', border: '1px solid var(--border-strong)', borderRadius: 6, fontSize: 12, color: 'var(--cyan)', marginTop: 8 }}>
              💡 {finding.remediation_hint}
            </div>
          )}

          <button
            onClick={() => setOpen(false)}
            style={{ marginTop: 12, background: 'none', border: '1px solid var(--border)', color: 'var(--text-muted)', borderRadius: 6, padding: '5px 12px', fontSize: 11, cursor: 'pointer', fontFamily: 'var(--font-ui)' }}
          >
            Collapse
          </button>
        </div>
      )}

      {/* Chat panel */}
      {showChat && (
        <div style={{ borderTop: '1px solid var(--border)', padding: '14px 18px', background: 'var(--bg-base)' }}>
          <div style={{ fontSize: 11, fontWeight: 600, color: 'var(--text-secondary)', marginBottom: 8, display: 'flex', alignItems: 'center', gap: 6 }}>
            <MessageSquare size={11} /> Chat about this finding
          </div>
          <FindingChat finding={finding} />
        </div>
      )}
    </div>
  )
}

// ── Main AIAdvice page ────────────────────────────────────────────────────────
export default function AIAdvice({ scanResult, onNav }) {
  const [filter, setFilter] = useState('All')
  const rawAiFindings = scanResult?.forwardedFindings || []
  const seen = new Set()
  const aiFindings = rawAiFindings.filter(f => {
    const key = f.finding_id || `${f.module}|${f.title}|${f.namespace}|${f.resource_name}`
    if (seen.has(key)) return false
    seen.add(key)
    return true
  })

  if (!aiFindings?.length) {
    const hasScan = scanResult?.findings?.length > 0
    return (
      <div style={{ padding: '32px 40px', animation: 'fade-up 0.3s ease' }}>
        <div style={{ fontFamily: 'var(--font-mono)', fontSize: 11, color: 'var(--cyan)', letterSpacing: '0.15em', textTransform: 'uppercase', marginBottom: 8 }}>04 · AI recommendation engine</div>
        <h1 style={{ fontFamily: 'var(--font-display)', fontSize: 32, color: 'var(--text-primary)', marginBottom: 4, textTransform: 'uppercase' }}>AI Remediation Advice</h1>
        <p style={{ color: 'var(--text-secondary)', fontSize: 13, marginBottom: 28 }}>
          Per-finding AI explanations, corrected YAML manifests, and an interactive chatbot — powered by Gemini.
        </p>
        <div style={{ padding: '48px', textAlign: 'center', background: 'var(--bg-card)', border: '1px solid var(--border)', borderRadius: 'var(--radius-xl)' }}>
          <Sparkles size={40} color="var(--text-muted)" style={{ marginBottom: 16 }} />
          <div style={{ fontSize: 15, color: 'var(--text-secondary)', marginBottom: 16 }}>
            {hasScan ? 'Forward findings from the Score page first' : 'Run a scan first to get AI advice'}
          </div>
          <button onClick={() => onNav(hasScan ? 'score' : 'ingest')} style={{ padding: '10px 24px', background: 'var(--cyan)', color: '#080C14', border: 'none', borderRadius: 8, fontWeight: 600, fontSize: 13, cursor: 'pointer', fontFamily: 'var(--font-ui)' }}>
            {hasScan ? 'Go to Score →' : 'Go to Ingest →'}
          </button>
        </div>
      </div>
    )
  }

  const counts = { Critical: 0, High: 0, Medium: 0, Low: 0 }
  aiFindings.forEach(f => { if (counts[f.severity] !== undefined) counts[f.severity]++ })

  const filtered = aiFindings
    .filter(f => filter === 'All' || f.severity === filter)
    .sort((a, b) => (SEV_ORDER[a.severity] ?? 9) - (SEV_ORDER[b.severity] ?? 9))

  return (
    <div style={{ padding: '32px 40px', overflow: 'auto', animation: 'fade-up 0.3s ease' }}>
      {/* Header */}
      <div style={{ fontFamily: 'var(--font-mono)', fontSize: 11, color: 'var(--cyan)', letterSpacing: '0.15em', textTransform: 'uppercase', marginBottom: 8 }}>04 · AI recommendation engine</div>
      <h1 style={{ fontFamily: 'var(--font-display)', fontSize: 32, color: 'var(--text-primary)', marginBottom: 4, textTransform: 'uppercase' }}>AI Remediation Advice</h1>
      <p style={{ color: 'var(--text-secondary)', fontSize: 13, marginBottom: 24 }}>
        Click <strong style={{ color: 'var(--purple)' }}>Generate fix</strong> on any finding for a Gemini-verified corrected manifest, or <strong style={{ color: 'var(--cyan)' }}>Ask AI</strong> to chat about it.
      </p>

      {/* Severity filter pills */}
      <div style={{ display: 'flex', gap: 8, marginBottom: 24, flexWrap: 'wrap' }}>
        {['All', 'Critical', 'High', 'Medium', 'Low'].map(s => {
          const count = s === 'All' ? aiFindings.length : counts[s]
          if (s !== 'All' && count === 0) return null
          return (
            <button
              key={s}
              onClick={() => setFilter(s)}
              style={{ padding: '5px 14px', borderRadius: 20, fontSize: 12, fontWeight: 600, fontFamily: 'var(--font-mono)', cursor: 'pointer', border: `1px solid ${filter === s ? (SEV_COLORS[s] || 'var(--cyan)') : 'var(--border)'}`, background: filter === s ? `${SEV_COLORS[s] || 'var(--cyan)'}18` : 'var(--bg-elevated)', color: filter === s ? (SEV_COLORS[s] || 'var(--cyan)') : 'var(--text-muted)', transition: 'all 0.15s' }}
            >
              {s} {count > 0 && <span style={{ marginLeft: 4, opacity: 0.7 }}>({count})</span>}
            </button>
          )
        })}
      </div>

      {/* Finding cards */}
      <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
        {filtered.map((f, i) => (
          <FindingCard key={f.finding_id || `${f.module}-${f.title}-${f.namespace}-${f.resource_name}-${i}`} finding={f} />
        ))}
      </div>

      {filtered.length === 0 && (
        <div style={{ textAlign: 'center', padding: 40, color: 'var(--text-muted)', fontSize: 13 }}>
          No {filter} findings.
        </div>
      )}
    </div>
  )
}