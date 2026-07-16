import React, { useState } from 'react'
import { Shield, Sun, Moon, Radio } from 'lucide-react'
import { ThemeProvider, useTheme } from './theme/ThemeContext'
import Ingest from './pages/Ingest'
import Findings from './pages/Findings'
import Score from './pages/Score'
import AIAdvice from './pages/AIAdvice'
import History from './pages/History'

const TABS = [
  { id: 'ingest',   n: '01', label: 'INGESTION MAP' },
  { id: 'findings', n: '02', label: 'THREAT LEDGER' },
  { id: 'score',    n: '03', label: 'HARDENING SCORE' },
  { id: 'ai',       n: '04', label: 'AI ADVISORY' },
  { id: 'history',  n: '05', label: 'SCAN HISTORY' },
]

function HeaderBar({ page, setPage, scanResult }) {
  const { theme, toggle } = useTheme()

  const pods = scanResult?.summary?.pods
  const namespaces = scanResult?.summary?.namespaceCount

  return (
    <>
      <header style={{
        display: 'flex', alignItems: 'center', justifyContent: 'space-between',
        padding: '14px 28px', borderBottom: '2px solid var(--text-primary)',
        background: 'var(--bg-base)',
      }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
          <div style={{ width: 32, height: 32, background: 'var(--cyan)', display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0 }}>
            <Shield size={18} color="var(--bg-base)" />
          </div>
          <div>
            <div style={{ fontFamily: 'var(--font-mono)', fontWeight: 700, fontSize: 14, letterSpacing: '0.05em', color: 'var(--text-primary)' }}>
              KUBESHIELD_AI <span style={{ color: 'var(--text-muted)', fontWeight: 400 }}>// COMMAND OVERWATCH HUD</span>
            </div>
            <div style={{ fontFamily: 'var(--font-mono)', fontSize: 10, color: 'var(--text-muted)', letterSpacing: '0.1em' }}>
              KUBERNETES COMPLIANCE + CLUSTER TOPOLOGY ENGINE
            </div>
          </div>
        </div>

        <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 6, fontFamily: 'var(--font-mono)', fontSize: 11, color: 'var(--text-muted)' }}>
            <Radio size={12} color="var(--green)" />
            SYSTEM_STATUS: <span style={{ color: 'var(--green)', fontWeight: 600 }}>ACTIVE</span>
          </div>

          <button onClick={toggle} style={{
            display: 'flex', alignItems: 'center', gap: 6, padding: '8px 14px',
            border: '1px solid var(--text-primary)', background: 'var(--bg-base)', color: 'var(--text-primary)',
            fontFamily: 'var(--font-mono)', fontSize: 11, cursor: 'pointer',
          }}>
            {theme === 'dark' ? <><Sun size={12} /> LIGHT</> : <><Moon size={12} /> DARK</>}
          </button>

          <button onClick={() => setPage('ingest')} style={{
            padding: '10px 18px', background: 'var(--cyan)', color: 'var(--bg-base)', border: 'none',
            fontFamily: 'var(--font-mono)', fontWeight: 700, fontSize: 12, cursor: 'pointer',
          }}>
            CONNECT CLUSTER →
          </button>
        </div>
      </header>

      <div style={{
        display: 'flex', gap: 28, overflowX: 'auto', whiteSpace: 'nowrap',
        padding: '8px 28px', borderBottom: '1px solid var(--border)',
        fontFamily: 'var(--font-mono)', fontSize: 11, color: 'var(--text-muted)', background: 'var(--bg-surface)',
      }}>
        <span>NAMESPACES: {namespaces ?? '—'}</span>
        <span>PODS: {pods ?? '—'}</span>
        <span>FINDINGS: {scanResult?.findings?.length ?? '—'}</span>
        <span>CORE_GRADE: {scanResult?.score?.grade ?? '—'}</span>
        <span>INDEX: {scanResult?.score?.risk_score != null ? `${scanResult.score.risk_score}%` : '—'}</span>
        <span>SOURCE: {scanResult ? 'LIVE' : 'MOCK'}</span>
      </div>

      <div style={{ display: 'flex', borderBottom: '1px solid var(--border)', overflowX: 'auto' }}>
        {TABS.map(t => (
          <button key={t.id} onClick={() => setPage(t.id)} style={{
            padding: '12px 20px', border: 'none', borderRight: '1px solid var(--border)',
            background: page === t.id ? 'var(--text-primary)' : 'var(--bg-base)',
            color: page === t.id ? 'var(--bg-base)' : 'var(--text-secondary)',
            fontFamily: 'var(--font-mono)', fontWeight: 700, fontSize: 11, letterSpacing: '0.05em',
            cursor: 'pointer', whiteSpace: 'nowrap',
          }}>
            {t.n} // {t.label}
          </button>
        ))}
      </div>
    </>
  )
}

function Shell() {
  const [page, setPage] = useState('ingest')
  const [scanResult, setScanResult] = useState(null)

  const handleScanComplete = (result) => {
    setScanResult(result)
    setPage('findings')
  }

  const pageProps = { scanResult, onNav: setPage }

  return (
    <div style={{ minHeight: '100vh', background: 'var(--bg-base)' }}>
      <HeaderBar page={page} setPage={setPage} scanResult={scanResult} />
      <main style={{ position: 'relative' }}>
        <div style={{ display: page === 'ingest' ? 'block' : 'none' }}>
          <Ingest onScanComplete={handleScanComplete} />
        </div>
       <div style={{ display: page === 'findings' ? 'block' : 'none' }}>
          <Findings {...pageProps} />
        </div>
        <div style={{ display: page === 'score' ? 'block' : 'none' }}>
          <Score {...pageProps} />
        </div>
        <div style={{ display: page === 'ai' ? 'block' : 'none' }}>
          <AIAdvice {...pageProps} />
        </div>
        <div style={{ display: page === 'history' ? 'block' : 'none' }}>
          <History {...pageProps} />
        </div>
      </main>
    </div>
  )
}

export default function App() {
  return (
    <ThemeProvider>
      <Shell />
    </ThemeProvider>
  )
}