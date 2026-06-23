import React, { useState, useEffect } from 'react'
import { Clock, Download, ChevronRight } from 'lucide-react'

const scoreColor = (s) => s > 70 ? 'var(--coral)' : s > 40 ? 'var(--amber)' : 'var(--green)'

export default function History() {
  const [history, setHistory] = useState([])

  useEffect(() => {
    fetch('/api/history')
      .then(r => r.json())
      .then(data => setHistory(data.history || []))
      .catch(() => setHistory([]))
  }, [])

  return (
    <div style={{ padding: '32px 40px', overflow: 'auto', animation: 'fade-up 0.3s ease' }}>
      <div style={{ fontFamily: 'var(--font-mono)', fontSize: 11, color: 'var(--cyan)', letterSpacing: '0.15em', textTransform: 'uppercase', marginBottom: 8 }}>
        05 · Scan history
      </div>
      <h1 style={{ fontSize: 28, fontWeight: 600, color: 'var(--text-primary)', marginBottom: 24 }}>History</h1>

      {history.length === 0 ? (
        <div style={{ padding: '48px', textAlign: 'center', background: 'var(--bg-card)', border: '1px solid var(--border)', borderRadius: 'var(--radius-xl)', color: 'var(--text-muted)' }}>
          <Clock size={40} style={{ marginBottom: 16 }} />
          <div>No scan history yet — run a scan first</div>
        </div>
      ) : (
        <div style={{ background: 'var(--bg-card)', border: '1px solid var(--border)', borderRadius: 'var(--radius-xl)', overflow: 'hidden' }}>
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 100px 90px 90px 80px 80px', padding: '12px 20px', borderBottom: '1px solid var(--border)', gap: 12 }}>
            {['Scan ID', 'Resources', 'Findings', 'Risk score', 'Status', ''].map(h => (
              <div key={h} style={{ fontSize: 10, color: 'var(--text-muted)', letterSpacing: '0.1em', textTransform: 'uppercase', fontWeight: 500 }}>{h}</div>
            ))}
          </div>
          {history.map((s, i) => (
            <div key={s.id} style={{ display: 'grid', gridTemplateColumns: '1fr 100px 90px 90px 80px 80px', padding: '16px 20px', borderBottom: i < history.length - 1 ? '1px solid var(--border)' : 'none', alignItems: 'center', gap: 12, cursor: 'pointer', transition: 'background 0.15s' }}
              onMouseEnter={e => e.currentTarget.style.background = 'var(--bg-hover)'}
              onMouseLeave={e => e.currentTarget.style.background = 'transparent'}
            >
              <div>
                <div style={{ fontFamily: 'var(--font-mono)', fontSize: 12, color: 'var(--cyan)', marginBottom: 2 }}>{s.id}</div>
                <div style={{ fontSize: 11, color: 'var(--text-muted)' }}>{new Date(s.timestamp).toLocaleString()}</div>
              </div>
              <div style={{ fontFamily: 'var(--font-mono)', fontSize: 14, color: 'var(--text-primary)' }}>{s.resources}</div>
              <div style={{ fontFamily: 'var(--font-mono)', fontSize: 14, color: 'var(--text-primary)' }}>{s.findings}</div>
              <div style={{ fontFamily: 'var(--font-mono)', fontSize: 18, fontWeight: 600, color: scoreColor(s.score) }}>{s.score}</div>
              <span style={{ padding: '3px 8px', borderRadius: 4, fontSize: 10, fontFamily: 'var(--font-mono)', color: 'var(--green)', background: 'var(--green-dim)', border: '1px solid rgba(16,185,129,0.2)' }}>{s.status}</span>
              <div style={{ display: 'flex', gap: 8, justifyContent: 'flex-end' }}>
                <button style={{ background: 'none', border: 'none', cursor: 'pointer', color: 'var(--text-muted)', padding: 4 }}><Download size={14} /></button>
                <button style={{ background: 'none', border: 'none', cursor: 'pointer', color: 'var(--text-muted)', padding: 4 }}><ChevronRight size={14} /></button>
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  )
}