import React, { useState } from 'react'
import { Sparkles, ChevronDown, ChevronUp, Copy, Check } from 'lucide-react'
import { mockFindings, mockAIAdvice, severityColors } from '../utils/mockData'

const Badge = ({ severity }) => (
  <span style={{
    padding: '2px 8px', borderRadius: 4, fontSize: 10, fontWeight: 600,
    fontFamily: 'var(--font-mono)', letterSpacing: '0.08em', textTransform: 'uppercase',
    color: severityColors[severity], background: `${severityColors[severity]}20`,
    border: `1px solid ${severityColors[severity]}40`,
  }}>{severity}</span>
)

const CodeBlock = ({ code }) => {
  const [copied, setCopied] = useState(false)
  const copy = () => {
    navigator.clipboard?.writeText(code)
    setCopied(true)
    setTimeout(() => setCopied(false), 2000)
  }
  return (
    <div style={{ position: 'relative', marginTop: 12 }}>
      <pre style={{
        fontFamily: 'var(--font-mono)',
        fontSize: 12,
        color: 'var(--cyan)',
        background: 'var(--bg-base)',
        border: '1px solid var(--border)',
        borderRadius: 8,
        padding: '16px',
        overflow: 'auto',
        lineHeight: 1.7,
        margin: 0,
      }}>{code}</pre>
      <button onClick={copy} style={{
        position: 'absolute', top: 10, right: 10,
        background: 'var(--bg-elevated)', border: '1px solid var(--border)',
        borderRadius: 6, padding: '4px 8px', cursor: 'pointer',
        color: copied ? 'var(--green)' : 'var(--text-muted)',
        display: 'flex', alignItems: 'center', gap: 4, fontSize: 11,
        fontFamily: 'var(--font-ui)',
      }}>
        {copied ? <Check size={12} /> : <Copy size={12} />}
        {copied ? 'Copied' : 'Copy'}
      </button>
    </div>
  )
}

const FindingAdviceCard = ({ f }) => {
  const [open, setOpen] = useState(f.id === 'RBAC-001')
  const advice = mockAIAdvice[f.id]

  return (
    <div style={{
      background: 'var(--bg-card)',
      border: `1px solid ${open ? 'var(--border-mid)' : 'var(--border)'}`,
      borderRadius: 'var(--radius-lg)',
      overflow: 'hidden',
      transition: 'border-color 0.2s',
    }}>
      <button onClick={() => setOpen(!open)} style={{
        width: '100%', display: 'flex', alignItems: 'center', justifyContent: 'space-between',
        padding: '16px 20px', background: 'none', border: 'none', cursor: 'pointer', textAlign: 'left',
      }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
          <Badge severity={f.severity} />
          <span style={{ fontSize: 13, fontWeight: 500, color: 'var(--text-primary)' }}>{f.title}</span>
          <span style={{ fontFamily: 'var(--font-mono)', fontSize: 10, color: 'var(--text-muted)' }}>{f.id}</span>
        </div>
        {open ? <ChevronUp size={14} color="var(--text-muted)" /> : <ChevronDown size={14} color="var(--text-muted)" />}
      </button>

      {open && (
        <div style={{ padding: '0 20px 20px', borderTop: '1px solid var(--border)', animation: 'fade-up 0.2s ease' }}>
          {advice ? (
            <div style={{ display: 'flex', flexDirection: 'column', gap: 20, paddingTop: 20 }}>
              {/* AI explanation */}
              <div style={{ padding: '14px 16px', background: 'var(--purple-dim)', border: '1px solid rgba(167,139,250,0.2)', borderRadius: 8 }}>
                <div style={{ display: 'flex', gap: 8, alignItems: 'flex-start' }}>
                  <Sparkles size={14} color="var(--purple)" style={{ marginTop: 2, flexShrink: 0 }} />
                  <p style={{ fontSize: 13, color: 'var(--text-secondary)', lineHeight: 1.7, margin: 0 }}>
                    {advice.explanation}
                  </p>
                </div>
              </div>

              {/* Remediation steps */}
              <div>
                <div style={{ fontSize: 10, color: 'var(--text-muted)', letterSpacing: '0.12em', textTransform: 'uppercase', marginBottom: 12 }}>Remediation steps</div>
                <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
                  {advice.steps.map((step, i) => (
                    <div key={i} style={{ display: 'flex', gap: 12, alignItems: 'flex-start' }}>
                      <span style={{
                        minWidth: 22, height: 22,
                        background: 'var(--cyan-dim)', border: '1px solid var(--border-strong)',
                        borderRadius: 4, display: 'flex', alignItems: 'center', justifyContent: 'center',
                        fontFamily: 'var(--font-mono)', fontSize: 10, color: 'var(--cyan)', fontWeight: 600,
                      }}>{i + 1}</span>
                      <p style={{ fontSize: 13, color: 'var(--text-secondary)', lineHeight: 1.6, margin: 0 }}>{step}</p>
                    </div>
                  ))}
                </div>
              </div>

              {/* YAML patch */}
              <div>
                <div style={{ fontSize: 10, color: 'var(--text-muted)', letterSpacing: '0.12em', textTransform: 'uppercase', marginBottom: 4 }}>Corrected YAML</div>
                <CodeBlock code={advice.patch} />
              </div>
            </div>
          ) : (
            <div style={{ paddingTop: 20 }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: 8, padding: '14px 16px', background: 'var(--bg-elevated)', border: '1px solid var(--border)', borderRadius: 8 }}>
                <Sparkles size={14} color="var(--purple)" />
                <span style={{ fontSize: 13, color: 'var(--text-muted)' }}>Click to generate AI remediation advice for this finding.</span>
                <button style={{
                  marginLeft: 'auto',
                  padding: '6px 14px',
                  background: 'var(--purple-dim)',
                  border: '1px solid rgba(167,139,250,0.3)',
                  color: 'var(--purple)',
                  borderRadius: 6, cursor: 'pointer', fontSize: 12, fontFamily: 'var(--font-ui)',
                }}>Generate</button>
              </div>
            </div>
          )}
        </div>
      )}
    </div>
  )
}

export default function AIAdvice() {
  const priority = [...mockFindings].sort((a, b) => b.score - a.score)

  return (
    <div style={{ padding: '32px 40px', overflow: 'auto', animation: 'fade-up 0.3s ease' }}>
      <div style={{ fontFamily: 'var(--font-mono)', fontSize: 11, color: 'var(--cyan)', letterSpacing: '0.15em', textTransform: 'uppercase', marginBottom: 8 }}>
        04 · AI recommendation engine
      </div>
      <h1 style={{ fontSize: 28, fontWeight: 600, color: 'var(--text-primary)', marginBottom: 4 }}>AI remediation advice</h1>
      <p style={{ color: 'var(--text-secondary)', fontSize: 14, marginBottom: 32 }}>
        Gemini-powered explanations, step-by-step remediation, and corrected YAML for each finding — prioritised by risk score.
      </p>

      <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
        {priority.map(f => <FindingAdviceCard key={f.id} f={f} />)}
      </div>
    </div>
  )
}
