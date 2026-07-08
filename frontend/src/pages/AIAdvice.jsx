import React, { useState } from 'react'
import { Sparkles, ChevronDown, ChevronUp, Copy, Check, Loader } from 'lucide-react'

const SEV_COLORS = { Critical: '#FF4D6D', High: '#F59E0B', Medium: '#A78BFA', Low: '#10B981' }

const CodeBlock = ({ code }) => {
  const [copied, setCopied] = useState(false)
  return (
    <div style={{ position: 'relative', marginTop: 12 }}>
      <pre style={{ fontFamily: 'var(--font-mono)', fontSize: 12, color: 'var(--cyan)', background: 'var(--bg-base)', border: '1px solid var(--border)', borderRadius: 8, padding: '16px', overflow: 'auto', lineHeight: 1.7, margin: 0 }}>{code}</pre>
      <button onClick={() => { navigator.clipboard?.writeText(code); setCopied(true); setTimeout(() => setCopied(false), 2000) }} style={{ position: 'absolute', top: 10, right: 10, background: 'var(--bg-elevated)', border: '1px solid var(--border)', borderRadius: 6, padding: '4px 8px', cursor: 'pointer', color: copied ? 'var(--green)' : 'var(--text-muted)', display: 'flex', alignItems: 'center', gap: 4, fontSize: 11, fontFamily: 'var(--font-ui)' }}>
        {copied ? <Check size={12} /> : <Copy size={12} />} {copied ? 'Copied' : 'Copy'}
      </button>
    </div>
  )
}

export default function AIAdvice({ scanResult, onNav }) {
  const [advice, setAdvice]   = useState(null)
  const [loading, setLoading] = useState(false)
  const [error, setError]     = useState('')
  const [open, setOpen]       = useState(false)

  if (!scanResult?.findings?.length) {
    return (
      <div style={{ padding: '32px 40px', animation: 'fade-up 0.3s ease' }}>
        <div style={{ fontFamily: 'var(--font-mono)', fontSize: 11, color: 'var(--cyan)', letterSpacing: '0.15em', textTransform: 'uppercase', marginBottom: 8 }}>04 · AI recommendation engine</div>
        <h1 style={{ fontFamily: 'var(--font-display)', fontSize: 32, color: 'var(--text-primary)', marginBottom: 4, textTransform: 'uppercase' }}>
          AI Remediation Advice
        </h1>
        <p style={{ color: 'var(--text-secondary)', fontSize: 13,  padding: 4, marginBottom: 28, width: 'fit-content', gap: 4 }}>
          Sends your findings to an API key which generates human-readable explanations and step-by-step remediation guidance for each issue.
        </p>
        <div style={{ padding: '48px', textAlign: 'center', background: 'var(--bg-card)', border: '1px solid var(--border)', borderRadius: 'var(--radius-xl)' }}>
          <Sparkles size={40} color="var(--text-muted)" style={{ marginBottom: 16 }} />
          <div style={{ fontSize: 15, color: 'var(--text-secondary)', marginBottom: 16 }}>Run a scan first to get AI advice</div>
          <button onClick={() => onNav('ingest')} style={{ padding: '10px 24px', background: 'var(--cyan)', color: '#080C14', border: 'none', borderRadius: 8, fontWeight: 600, fontSize: 13, cursor: 'pointer', fontFamily: 'var(--font-ui)' }}>Go to Ingest →</button>
        </div>
      </div>
    )
  }

  const fetchAdvice = async () => {
    setLoading(true)
    setError('')
    try {
      // Map findings to the shape ai-service expects
      const findings = scanResult.findings.slice(0, 20).map((f, i) => ({
        id: `finding-${i}`,
        title: f.Issue,
        severity: f.Severity?.toUpperCase(),
        module: f.check || 'unknown',
        resource_name: f.resource || 'unknown',
        evidence: f.Detail || '',
        score: 5.0,
      }))
      const res = await fetch('/api/ai/explain', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ findings, cluster_context: 'KubeShield test cluster' }),
      })
      if (!res.ok) throw new Error(await res.text())
      setAdvice(await res.json())
      setOpen(true)
    } catch (err) {
      setError(err.message)
    } finally {
      setLoading(false)
    }
  }

  const counts = { Critical: 0, High: 0, Medium: 0, Low: 0 }
  scanResult.findings.forEach(f => { if (counts[f.Severity] !== undefined) counts[f.Severity]++ })

  return (
    <div style={{ padding: '32px 40px', overflow: 'auto', animation: 'fade-up 0.3s ease' }}>
      <div style={{ fontFamily: 'var(--font-mono)', fontSize: 11, color: 'var(--cyan)', letterSpacing: '0.15em', textTransform: 'uppercase', marginBottom: 8 }}>04 · AI recommendation engine</div>
      <h1 style={{ fontFamily: 'var(--font-display)', fontSize: 32, color: 'var(--text-primary)', marginBottom: 4, textTransform: 'uppercase' }}>
          AI Remediation Advice
        </h1>
        <p style={{ color: 'var(--text-secondary)', fontSize: 13,  padding: 4, marginBottom: 28, width: 'fit-content', gap: 4 }}>
          Sends your findings to an API key which generates human-readable explanations and step-by-step remediation guidance for each issue.
        </p>
      {/* Findings summary */}
      <div style={{ display: 'flex', gap: 10, marginBottom: 24 }}>
        {Object.entries(counts).filter(([,n]) => n > 0).map(([sev, n]) => (
          <div key={sev} style={{ padding: '6px 14px', borderRadius: 'var(--radius-md)', background: `${SEV_COLORS[sev]}18`, border: `1px solid ${SEV_COLORS[sev]}40`, display: 'flex', alignItems: 'center', gap: 6 }}>
            <span style={{ fontFamily: 'var(--font-mono)', fontWeight: 600, fontSize: 16, color: SEV_COLORS[sev] }}>{n}</span>
            <span style={{ fontSize: 11, color: 'var(--text-secondary)' }}>{sev}</span>
          </div>
        ))}
      </div>

      {/* Generate button */}
      {!advice && (
        <div style={{ background: 'var(--bg-card)', border: '1px solid var(--border)', borderRadius: 'var(--radius-xl)', padding: '28px', display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 20 }}>
          <div>
            <div style={{ fontSize: 14, fontWeight: 600, color: 'var(--text-primary)', marginBottom: 4 }}>
              Analyse {scanResult.findings.length} findings with Gemini
            </div>
            <div style={{ fontSize: 12, color: 'var(--text-muted)' }}>
              Get plain-English explanations, prioritised remediation steps, and corrected YAML examples
            </div>
          </div>
          <button onClick={fetchAdvice} disabled={loading} style={{ padding: '12px 24px', background: loading ? 'var(--bg-elevated)' : 'var(--purple-dim)', border: '1px solid rgba(167,139,250,0.3)', color: 'var(--purple)', borderRadius: 'var(--radius-md)', fontSize: 13, fontWeight: 600, cursor: loading ? 'default' : 'pointer', fontFamily: 'var(--font-ui)', display: 'flex', alignItems: 'center', gap: 8, whiteSpace: 'nowrap' }}>
            {loading ? <><Loader size={14} style={{ animation: 'spin 1s linear infinite' }} /> Calling Gemini…</> : <><Sparkles size={14} /> Generate advice</>}
          </button>
        </div>
      )}

      {error && <div style={{ padding: '12px 16px', background: 'var(--coral-dim)', border: '1px solid rgba(255,77,109,0.2)', borderRadius: 8, color: 'var(--coral)', fontSize: 12, fontFamily: 'var(--font-mono)', marginBottom: 16 }}>{error}</div>}

      {/* Advice card */}
      {advice && (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 16, animation: 'fade-up 0.3s ease' }}>
          {/* Severity summary */}
          <div style={{ padding: '14px 16px', background: 'var(--purple-dim)', border: '1px solid rgba(167,139,250,0.2)', borderRadius: 8, display: 'flex', gap: 8 }}>
            <Sparkles size={14} color="var(--purple)" style={{ marginTop: 2, flexShrink: 0 }} />
            <p style={{ fontSize: 13, color: 'var(--text-secondary)', lineHeight: 1.7, margin: 0 }}>{advice.severity_summary}</p>
          </div>

          {/* Explanation */}
          <div style={{ background: 'var(--bg-card)', border: '1px solid var(--border)', borderRadius: 'var(--radius-xl)', overflow: 'hidden' }}>
            <button onClick={() => setOpen(!open)} style={{ width: '100%', display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '16px 20px', background: 'none', border: 'none', cursor: 'pointer', textAlign: 'left' }}>
              <span style={{ fontSize: 14, fontWeight: 600, color: 'var(--text-primary)' }}>Full analysis & remediation</span>
              {open ? <ChevronUp size={14} color="var(--text-muted)" /> : <ChevronDown size={14} color="var(--text-muted)" />}
            </button>
            {open && (
              <div style={{ padding: '0 20px 20px', borderTop: '1px solid var(--border)', animation: 'fade-up 0.2s ease' }}>
                <div style={{ paddingTop: 20, display: 'flex', flexDirection: 'column', gap: 20 }}>
                  <div>
                    <div style={{ fontSize: 10, color: 'var(--text-muted)', letterSpacing: '0.12em', textTransform: 'uppercase', marginBottom: 8 }}>Explanation</div>
                    <p style={{ fontSize: 13, color: 'var(--text-secondary)', lineHeight: 1.7, margin: 0 }}>{advice.explanation}</p>
                  </div>
                  <div>
                    <div style={{ fontSize: 10, color: 'var(--text-muted)', letterSpacing: '0.12em', textTransform: 'uppercase', marginBottom: 12 }}>Remediation steps</div>
                    <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
                      {advice.remediation.map((step, i) => (
                        <div key={i} style={{ display: 'flex', gap: 12, alignItems: 'flex-start' }}>
                          <span style={{ minWidth: 22, height: 22, background: 'var(--cyan-dim)', border: '1px solid var(--border-strong)', borderRadius: 4, display: 'flex', alignItems: 'center', justifyContent: 'center', fontFamily: 'var(--font-mono)', fontSize: 10, color: 'var(--cyan)', fontWeight: 600 }}>{i + 1}</span>
                          <p style={{ fontSize: 13, color: 'var(--text-secondary)', lineHeight: 1.6, margin: 0 }}>{step}</p>
                        </div>
                      ))}
                    </div>
                  </div>
                  {advice.examples?.length > 0 && (
                    <div>
                      <div style={{ fontSize: 10, color: 'var(--text-muted)', letterSpacing: '0.12em', textTransform: 'uppercase', marginBottom: 4 }}>Corrected YAML examples</div>
                      {advice.examples.map((ex, i) => <CodeBlock key={i} code={ex} />)}
                    </div>
                  )}
                </div>
              </div>
            )}
          </div>

          <button onClick={() => { setAdvice(null); setOpen(false) }} style={{ alignSelf: 'flex-start', background: 'none', border: '1px solid var(--border)', color: 'var(--text-muted)', borderRadius: 6, padding: '6px 14px', fontSize: 12, cursor: 'pointer', fontFamily: 'var(--font-ui)' }}>
            Regenerate
          </button>
        </div>
      )}
    </div>
  )
}
