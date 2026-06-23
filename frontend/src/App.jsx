import React, { useState } from 'react'
import Sidebar from './components/Sidebar'
import Ingest from './pages/Ingest'
import Findings from './pages/Findings'
import Score from './pages/Score'
import AIAdvice from './pages/AIAdvice'
import History from './pages/History'

export default function App() {
  const [page, setPage] = useState('ingest')

  // scanResult is set by Ingest and passed to all other pages
  // shape: { findings: [...], score: { risk_score, grade, breakdown, ... } }
  const [scanResult, setScanResult] = useState(null)

  const handleScanComplete = (result) => {
    setScanResult(result)
    setPage('findings')
  }

  const pageProps = { scanResult, onNav: setPage }

  return (
    <div style={{ display: 'flex', height: '100vh', overflow: 'hidden', background: 'var(--bg-base)' }}>
      <Sidebar active={page} onNav={setPage} clusterStatus={scanResult ? 'connected' : 'connected'} />
      <main style={{ flex: 1, overflow: 'auto', position: 'relative' }}>
        <div style={{
          position: 'fixed', top: 0, left: 220, right: 0, height: 1,
          background: 'linear-gradient(90deg, transparent 0%, var(--cyan) 50%, transparent 100%)',
          opacity: 0.15, animation: 'scan-line 8s linear infinite', pointerEvents: 'none', zIndex: 10,
        }} />
        {page === 'ingest'   && <Ingest   onScanComplete={handleScanComplete} />}
        {page === 'findings' && <Findings {...pageProps} />}
        {page === 'score'    && <Score    {...pageProps} />}
        {page === 'ai'       && <AIAdvice {...pageProps} />}
        {page === 'history'  && <History  {...pageProps} />}
      </main>
    </div>
  )
}
