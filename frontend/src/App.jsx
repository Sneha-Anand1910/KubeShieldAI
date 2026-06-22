import React, { useState } from 'react'
import Sidebar from './components/Sidebar'
import Ingest from './pages/Ingest'
import Findings from './pages/Findings'
import Score from './pages/Score'
import AIAdvice from './pages/AIAdvice'
import History from './pages/History'

const PAGES = { ingest: Ingest, findings: Findings, score: Score, ai: AIAdvice, history: History }

export default function App() {
  const [page, setPage] = useState('ingest')
  const [clusterStatus] = useState('connected')

  const Page = PAGES[page]

  return (
    <div style={{ display: 'flex', height: '100vh', overflow: 'hidden', background: 'var(--bg-base)' }}>
      <Sidebar active={page} onNav={setPage} clusterStatus={clusterStatus} />

      <main style={{ flex: 1, overflow: 'auto', position: 'relative' }}>
        {/* Subtle scan line animation */}
        <div style={{
          position: 'fixed',
          top: 0, left: 220, right: 0,
          height: 1,
          background: 'linear-gradient(90deg, transparent 0%, var(--cyan) 50%, transparent 100%)',
          opacity: 0.15,
          animation: 'scan-line 8s linear infinite',
          pointerEvents: 'none',
          zIndex: 10,
        }} />

        <Page onScanComplete={() => setPage('findings')} />
      </main>
    </div>
  )
}
