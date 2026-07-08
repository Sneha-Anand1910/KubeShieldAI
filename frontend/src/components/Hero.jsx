import React from 'react'

export default function Hero({ scanResult, onEnter }) {
  const hardening = scanResult?.score?.risk_score ?? 46

  return (
    <div className="hud-grid-bg" style={{ display: 'grid', gridTemplateColumns: '1fr 380px', borderBottom: '1px solid var(--border)' }}>
      <div style={{ padding: '48px 40px' }}>
        <div style={{ fontFamily: 'var(--font-mono)', fontSize: 11, color: 'var(--text-muted)', letterSpacing: '0.15em', marginBottom: 16 }}>
          [ PROJECT MANIFESTO / 001 ]
        </div>
        <h1 style={{ fontFamily: 'var(--font-display)', fontSize: 46, lineHeight: 1.1, color: 'var(--text-primary)', marginBottom: 20, textTransform: 'uppercase' }}>
          KUBERNETES <span style={{ color: 'var(--cyan)' }}>SECURITY.</span> COMPLIANCE.<br />TOPOLOGY.
        </h1>
        <p style={{ maxWidth: 560, color: 'var(--text-secondary)', fontSize: 14, lineHeight: 1.7, marginBottom: 28 }}>
          A high-frequency AI-driven Kubernetes compliance engine implementing real-time target cluster security audits, API topology mapping, RBAC tracking, and automated declarative YAML vulnerability patch dispatches.
        </p>
        <div style={{ display: 'flex', gap: 12 }}>
          <button onClick={onEnter} style={{ padding: '14px 24px', background: 'var(--cyan)', color: 'var(--bg-base)', border: 'none', fontFamily: 'var(--font-mono)', fontWeight: 700, fontSize: 13, cursor: 'pointer' }}>
            ENTER COMMAND CENTER →
          </button>
          <button style={{ padding: '14px 24px', background: 'transparent', color: 'var(--text-primary)', border: '1px solid var(--text-primary)', fontFamily: 'var(--font-mono)', fontWeight: 700, fontSize: 13, cursor: 'pointer' }}>
            LOAD SIMULATION
          </button>
        </div>
      </div>

      <div style={{ borderLeft: '1px solid var(--border)', padding: '32px 28px', display: 'flex', flexDirection: 'column', gap: 14 }}>
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
          <span style={{ fontFamily: 'var(--font-mono)', fontSize: 11, color: 'var(--text-muted)', letterSpacing: '0.1em' }}>‒ SYSTEM TELEMETRY HUD</span>
          <span style={{ fontFamily: 'var(--font-mono)', fontSize: 10, fontWeight: 700, background: 'var(--cyan)', color: 'var(--bg-base)', padding: '2px 8px' }}>LIVE</span>
        </div>
        {[
          ['SCAN_HASH_ID', scanResult ? 'C6E2176F35B9' : '—'],
          ['TIMESTAMP', scanResult ? new Date().toISOString().replace('T', ' ').slice(0, 19) + ' UTC' : '—'],
          ['SOURCE', scanResult ? 'LIVE' : 'MOCK'],
          ['CORE_GRADE', scanResult?.score?.grade ?? '—'],
          ['TOTAL_FINDINGS', scanResult?.findings?.length ?? '—'],
        ].map(([k, v]) => (
          <div key={k} style={{ display: 'flex', justifyContent: 'space-between', borderBottom: '1px dashed var(--border)', paddingBottom: 6, fontFamily: 'var(--font-mono)', fontSize: 11 }}>
            <span style={{ color: 'var(--text-muted)' }}>{k}:</span>
            <span style={{ color: 'var(--text-primary)', fontWeight: 600 }}>{v}</span>
          </div>
        ))}
        <div>
          <div style={{ display: 'flex', justifyContent: 'space-between', fontFamily: 'var(--font-mono)', fontSize: 11, marginBottom: 6 }}>
            <span style={{ color: 'var(--text-muted)' }}>HARDENING INDEX</span>
            <span style={{ color: 'var(--coral)' }}>{hardening}%</span>
          </div>
          <div style={{ height: 6, background: 'var(--bg-hover)', border: '1px solid var(--border)' }}>
            <div style={{ height: '100%', width: `${hardening}%`, background: 'var(--coral)' }} />
          </div>
        </div>
      </div>
    </div>
  )
}