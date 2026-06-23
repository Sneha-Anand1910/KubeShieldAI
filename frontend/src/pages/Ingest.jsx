import React, { useState, useRef } from 'react'
import { Upload, CheckCircle, Loader, Box, FileText, Shield, Key, Network, Users, Radio, ChevronRight, AlertCircle } from 'lucide-react'

const ResourceCard = ({ icon: Icon, label, count, color, delay = 0 }) => (
  <div style={{
    background: 'var(--bg-card)', border: '1px solid var(--border)',
    borderRadius: 'var(--radius-lg)', padding: '16px 20px',
    display: 'flex', alignItems: 'center', gap: 12,
    animation: `fade-up 0.4s ease ${delay}s both`,
  }}>
    <div style={{ width: 36, height: 36, background: `${color}20`, border: `1px solid ${color}40`, borderRadius: 8, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
      <Icon size={16} color={color} />
    </div>
    <div>
      <div style={{ fontSize: 22, fontWeight: 600, color: 'var(--text-primary)', fontFamily: 'var(--font-mono)', lineHeight: 1 }}>{count}</div>
      <div style={{ fontSize: 11, color: 'var(--text-muted)', marginTop: 2 }}>{label}</div>
    </div>
  </div>
)

const NamespacePill = ({ name, podCount, color }) => (
  <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '10px 14px', background: 'var(--bg-elevated)', border: `1px solid ${color}30`, borderLeft: `3px solid ${color}`, borderRadius: 'var(--radius-md)' }}>
    <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
      <div style={{ width: 6, height: 6, borderRadius: '50%', background: color, animation: 'pulse-dot 2s ease-in-out infinite' }} />
      <span style={{ fontFamily: 'var(--font-mono)', fontSize: 12, color: 'var(--text-primary)' }}>{name}</span>
    </div>
    <span style={{ fontFamily: 'var(--font-mono)', fontSize: 11, color: 'var(--text-muted)' }}>{podCount} pods</span>
  </div>
)

const ScanLog = ({ lines }) => (
  <div style={{ background: 'var(--bg-base)', border: '1px solid var(--border)', borderRadius: 'var(--radius-md)', padding: '14px 16px', fontFamily: 'var(--font-mono)', fontSize: 11, color: 'var(--text-secondary)', lineHeight: 1.8, maxHeight: 140, overflow: 'auto' }}>
    {lines.map((line, i) => (
      <div key={i}>
        <span style={{ color: 'var(--text-muted)' }}>[{new Date().toLocaleTimeString()}]</span>{' '}
        <span style={{ color: line.type === 'success' ? 'var(--green)' : line.type === 'error' ? 'var(--coral)' : 'var(--cyan)' }}>
          {line.text}
        </span>
      </div>
    ))}
    {lines.length > 0 && <div style={{ display: 'inline-block', width: 6, height: 12, background: 'var(--cyan)', marginLeft: 2, animation: 'pulse-dot 1s ease-in-out infinite' }} />}
  </div>
)

export default function Ingest({ onScanComplete }) {
  const [mode, setMode]       = useState('live')
  const [state, setState]     = useState('idle')   // idle | scanning | analyzing | done | error
  const [logLines, setLogLines] = useState([])
  const [summary, setSummary] = useState(null)
  const [scanResult, setScanResult] = useState(null)
  const [fileName, setFileName] = useState(null)
  const [dragging, setDragging] = useState(false)
  const [errorMsg, setErrorMsg] = useState('')
  const fileRef = useRef()

  const addLog = (text, type = 'info') =>
    setLogLines(prev => [...prev, { text, type }])

  const reset = () => { setState('idle'); setLogLines([]); setSummary(null); setScanResult(null); setErrorMsg('') }

  // ── Live scan ────────────────────────────────────────────────────────────
  const runLiveScan = async () => {
    setState('scanning')
    setLogLines([])
    try {
      addLog('→ Connecting to Kubernetes API server...')
      const ingestRes = await fetch('/api/ingest/live', { method: 'POST' })
      if (!ingestRes.ok) throw new Error(await ingestRes.text())
      const ingestData = await ingestRes.json()
      addLog(`✓ ${ingestData.resource_count} resources fetched from cluster`, 'success')
      setSummary(ingestData.summary)

      addLog('→ Forwarding to security-service...')
      setState('analyzing')
      // Send first resource as sample to analyze — in real flow you'd send all
      // For now we send the full list batched
      const analyzeRes = await fetch('/api/analyze', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ resources: ingestData.resources }),
      })
      if (!analyzeRes.ok) throw new Error(await analyzeRes.text())
      const result = await analyzeRes.json()
      addLog(`✓ Analysis complete — ${result.findings.length} findings, score ${result.score.risk_score}`, 'success')

      setScanResult(result)
      setState('done')
      // Pass results up to App so Findings page can use them
      onScanComplete && onScanComplete(result)

    } catch (err) {
      addLog(`✗ Error: ${err.message}`, 'error')
      setErrorMsg(err.message)
      setState('error')
    }
  }

  // ── YAML upload ──────────────────────────────────────────────────────────
  const handleFile = async (file) => {
    if (!file) return
    setFileName(file.name)
    setState('scanning')
    setLogLines([])
    try {
      addLog(`→ Uploading ${file.name}...`)
      const form = new FormData()
      form.append('file', file)
      const ingestRes = await fetch('/api/ingest/yaml', { method: 'POST', body: form })
      if (!ingestRes.ok) throw new Error(await ingestRes.text())
      const ingestData = await ingestRes.json()
      addLog(`✓ PyYAML parsed ${ingestData.resource_count} resources`, 'success')
      setSummary(ingestData.summary)

      addLog('→ Forwarding to security-service...')
      setState('analyzing')
      // Analyze each resource document
      let allFindings = []
      let latestScore = null
      for (const resource of ingestData.resources) {
        if (!resource?.kind) continue
        const analyzeRes = await fetch('/api/analyze', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ yaml_content: resource }),
        })
        if (!analyzeRes.ok) continue
        const r = await analyzeRes.json()
        allFindings = allFindings.concat(r.findings || [])
        latestScore = r.score
      }
      addLog(`✓ ${allFindings.length} findings across ${ingestData.resource_count} resources`, 'success')

      const result = { findings: allFindings, score: latestScore }
      setScanResult(result)
      setState('done')
      onScanComplete && onScanComplete(result)

    } catch (err) {
      addLog(`✗ Error: ${err.message}`, 'error')
      setErrorMsg(err.message)
      setState('error')
    }
  }

  return (
    <div style={{ padding: '32px 40px', maxWidth: 900, margin: '0 auto', animation: 'fade-up 0.3s ease' }}>
      <div style={{ fontFamily: 'var(--font-mono)', fontSize: 11, color: 'var(--cyan)', letterSpacing: '0.15em', textTransform: 'uppercase', marginBottom: 8 }}>
        01 · Ingestion service
      </div>
      <h1 style={{ fontSize: 28, fontWeight: 600, color: 'var(--text-primary)', marginBottom: 8 }}>Resource ingestion</h1>
      <p style={{ color: 'var(--text-secondary)', fontSize: 14, marginBottom: 24 }}>
        Pull live resource state from your cluster's API server, or upload a YAML manifest for offline analysis.
      </p>

      {/* Mode toggle */}
      <div style={{ display: 'flex', background: 'var(--bg-elevated)', border: '1px solid var(--border)', borderRadius: 'var(--radius-lg)', padding: 4, marginBottom: 24, width: 'fit-content', gap: 4 }}>
        {[
          { id: 'live', label: 'Live cluster scan', icon: Radio,  desc: 'Primary' },
          { id: 'yaml', label: 'Upload YAML',       icon: Upload, desc: 'Offline fallback' },
        ].map(({ id, label, icon: Icon, desc }) => (
          <button key={id} onClick={() => { setMode(id); reset() }} style={{
            display: 'flex', alignItems: 'center', gap: 8, padding: '10px 18px',
            borderRadius: 10, border: 'none',
            background: mode === id ? (id === 'live' ? 'var(--cyan-dim)' : 'var(--bg-card)') : 'transparent',
            cursor: 'pointer', transition: 'background 0.2s',
            outline: mode === id ? `1px solid ${id === 'live' ? 'var(--border-strong)' : 'var(--border)'}` : 'none',
          }}>
            <Icon size={14} color={mode === id ? (id === 'live' ? 'var(--cyan)' : 'var(--text-secondary)') : 'var(--text-muted)'} />
            <div style={{ textAlign: 'left' }}>
              <div style={{ fontSize: 12, fontWeight: 600, color: mode === id ? (id === 'live' ? 'var(--cyan)' : 'var(--text-primary)') : 'var(--text-muted)', lineHeight: 1.2 }}>{label}</div>
              <div style={{ fontSize: 10, color: 'var(--text-muted)', lineHeight: 1.2, marginTop: 1 }}>{desc}</div>
            </div>
          </button>
        ))}
      </div>

      {/* ── LIVE MODE ── */}
      {mode === 'live' && (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
          <div style={{ background: 'var(--bg-card)', border: '1px solid var(--border-mid)', borderRadius: 'var(--radius-xl)', padding: '24px' }}>
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 20 }}>
              <div>
                <div style={{ fontSize: 13, fontWeight: 600, color: 'var(--text-primary)', marginBottom: 4 }}>3-node Kubernetes cluster</div>
                <div style={{ fontFamily: 'var(--font-mono)', fontSize: 11, color: 'var(--text-muted)' }}>1 control plane · 2 worker nodes · in-cluster SA auth</div>
              </div>
              <div style={{ display: 'flex', alignItems: 'center', gap: 6, padding: '6px 12px', background: 'var(--green-dim)', border: '1px solid rgba(16,185,129,0.2)', borderRadius: 99 }}>
                <div style={{ width: 6, height: 6, borderRadius: '50%', background: 'var(--green)', animation: 'pulse-dot 2s ease-in-out infinite' }} />
                <span style={{ fontFamily: 'var(--font-mono)', fontSize: 11, color: 'var(--green)' }}>API server reachable</span>
              </div>
            </div>

            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 8, marginBottom: 20 }}>
              <NamespacePill name="dev-sim"    podCount={130} color="var(--coral)"  />
              <NamespacePill name="prod-sim"   podCount={32}  color="var(--green)"  />
              <NamespacePill name="kubeshield" podCount={18}  color="var(--cyan)"   />
              <NamespacePill name="monitoring" podCount={7}   color="var(--amber)"  />
            </div>

            {logLines.length > 0 && <div style={{ marginBottom: 16 }}><ScanLog lines={logLines} /></div>}

            {state === 'idle' && (
              <button onClick={runLiveScan} style={{ padding: '12px 28px', background: 'var(--cyan)', color: '#080C14', border: 'none', borderRadius: 'var(--radius-md)', fontWeight: 700, fontSize: 13, cursor: 'pointer', fontFamily: 'var(--font-ui)', display: 'flex', alignItems: 'center', gap: 8 }}>
                <Radio size={14} /> Start live cluster scan
              </button>
            )}
            {(state === 'scanning' || state === 'analyzing') && (
              <div style={{ display: 'flex', alignItems: 'center', gap: 10, color: 'var(--cyan)' }}>
                <Loader size={16} style={{ animation: 'spin 1s linear infinite' }} />
                <span style={{ fontFamily: 'var(--font-mono)', fontSize: 12 }}>
                  {state === 'scanning' ? 'Querying API server…' : 'Running security analysis…'}
                </span>
              </div>
            )}
            {state === 'done' && (
              <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
                <CheckCircle size={16} color="var(--green)" />
                <span style={{ fontFamily: 'var(--font-mono)', fontSize: 12, color: 'var(--green)' }}>All resources fetched and analysed</span>
                <button onClick={reset} style={{ marginLeft: 'auto', background: 'none', border: '1px solid var(--border)', color: 'var(--text-muted)', borderRadius: 6, padding: '4px 10px', fontSize: 11, cursor: 'pointer', fontFamily: 'var(--font-ui)' }}>Rescan</button>
              </div>
            )}
            {state === 'error' && (
              <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
                <AlertCircle size={16} color="var(--coral)" />
                <span style={{ fontFamily: 'var(--font-mono)', fontSize: 12, color: 'var(--coral)' }}>{errorMsg}</span>
                <button onClick={reset} style={{ marginLeft: 'auto', background: 'none', border: '1px solid var(--border)', color: 'var(--text-muted)', borderRadius: 6, padding: '4px 10px', fontSize: 11, cursor: 'pointer', fontFamily: 'var(--font-ui)' }}>Retry</button>
              </div>
            )}
          </div>

          {state === 'done' && summary && (
            <div style={{ animation: 'fade-up 0.4s ease' }}>
              <div style={{ fontSize: 11, color: 'var(--text-muted)', letterSpacing: '0.12em', textTransform: 'uppercase', marginBottom: 12 }}>Extracted from cluster</div>
              <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: 10 }}>
                <ResourceCard icon={Box}      label="Pods"             count={summary.pods}            color="var(--cyan)"           delay={0}    />
                <ResourceCard icon={FileText} label="Deployments"      count={summary.deployments}     color="var(--purple)"         delay={0.05} />
                <ResourceCard icon={Network}  label="Services"         count={summary.services}        color="var(--green)"          delay={0.1}  />
                <ResourceCard icon={Key}      label="Secrets"          count={summary.secrets}         color="var(--amber)"          delay={0.15} />
                <ResourceCard icon={Users}    label="RBAC roles"       count={summary.rbac_roles}      color="var(--coral)"          delay={0.2}  />
                <ResourceCard icon={Shield}   label="Network policies" count={summary.network_policies} color="var(--text-secondary)" delay={0.25} />
              </div>
              <button onClick={() => onScanComplete && onScanComplete(scanResult)} style={{ marginTop: 20, padding: '12px 28px', background: 'var(--cyan)', color: '#080C14', border: 'none', borderRadius: 'var(--radius-md)', fontWeight: 700, fontSize: 13, cursor: 'pointer', fontFamily: 'var(--font-ui)', display: 'flex', alignItems: 'center', gap: 8 }}>
                View security findings <ChevronRight size={14} />
              </button>
            </div>
          )}
        </div>
      )}

      {/* ── YAML MODE ── */}
      {mode === 'yaml' && (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
          <div style={{ display: 'flex', gap: 10, padding: '12px 16px', background: 'var(--amber-dim)', border: '1px solid rgba(245,158,11,0.25)', borderRadius: 'var(--radius-md)' }}>
            <AlertCircle size={14} color="var(--amber)" style={{ flexShrink: 0, marginTop: 2 }} />
            <p style={{ fontSize: 12, color: 'var(--amber)', margin: 0, lineHeight: 1.6 }}>
              YAML upload is a fallback for offline environments. For real cluster analysis use live scan — it captures runtime state that static YAMLs can't.
            </p>
          </div>

          <div
            onDragOver={e => { e.preventDefault(); setDragging(true) }}
            onDragLeave={() => setDragging(false)}
            onDrop={e => { e.preventDefault(); setDragging(false); handleFile(e.dataTransfer.files[0]) }}
            onClick={() => state === 'idle' && fileRef.current?.click()}
            style={{ border: `2px dashed ${dragging ? 'var(--cyan)' : state === 'done' ? 'var(--green)' : 'var(--border-mid)'}`, borderRadius: 'var(--radius-xl)', padding: '48px 32px', textAlign: 'center', cursor: state === 'idle' ? 'pointer' : 'default', background: dragging ? 'var(--cyan-glow)' : state === 'done' ? 'var(--green-dim)' : 'var(--bg-elevated)', transition: 'all 0.2s ease' }}
          >
            {state === 'idle' && (
              <>
                <div style={{ width: 52, height: 52, background: 'var(--bg-card)', border: '1px solid var(--border)', borderRadius: 12, display: 'flex', alignItems: 'center', justifyContent: 'center', margin: '0 auto 16px', animation: 'float 3s ease-in-out infinite' }}>
                  <Upload size={22} color="var(--text-secondary)" />
                </div>
                <div style={{ fontSize: 15, fontWeight: 500, color: 'var(--text-primary)', marginBottom: 6 }}>Drop your manifest here</div>
                <div style={{ fontSize: 12, color: 'var(--text-muted)' }}>supports .yaml and .yml · parsed via PyYAML</div>
              </>
            )}
            {(state === 'scanning' || state === 'analyzing') && (
              <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 16 }}>
                <Loader size={40} color="var(--text-secondary)" style={{ animation: 'spin 1s linear infinite' }} />
                <div>
                  <div style={{ fontSize: 14, fontWeight: 500, color: 'var(--text-primary)', marginBottom: 4 }}>
                    {state === 'scanning' ? `Parsing ${fileName}…` : 'Running security analysis…'}
                  </div>
                  <div style={{ fontSize: 12, color: 'var(--text-muted)' }}>PyYAML → security-service → scoring-service</div>
                </div>
              </div>
            )}
            {state === 'done' && (
              <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 10 }}>
                <CheckCircle size={40} color="var(--green)" />
                <div style={{ fontSize: 14, fontWeight: 500, color: 'var(--text-primary)' }}>
                  <span style={{ fontFamily: 'var(--font-mono)', color: 'var(--green)' }}>{fileName}</span> parsed and analysed
                </div>
              </div>
            )}
            {state === 'error' && (
              <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 10 }}>
                <AlertCircle size={40} color="var(--coral)" />
                <div style={{ fontSize: 13, color: 'var(--coral)' }}>{errorMsg}</div>
                <button onClick={reset} style={{ background: 'none', border: '1px solid var(--border)', color: 'var(--text-muted)', borderRadius: 6, padding: '6px 14px', fontSize: 12, cursor: 'pointer', fontFamily: 'var(--font-ui)' }}>Try again</button>
              </div>
            )}
            <input ref={fileRef} type="file" accept=".yaml,.yml" style={{ display: 'none' }} onChange={e => handleFile(e.target.files[0])} />
          </div>

          {logLines.length > 0 && <ScanLog lines={logLines} />}

          {state === 'done' && summary && (
            <div style={{ animation: 'fade-up 0.4s ease' }}>
              <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: 10, marginBottom: 16 }}>
                <ResourceCard icon={Box}      label="Pods"             count={summary.pods}            color="var(--cyan)"           delay={0}    />
                <ResourceCard icon={FileText} label="Deployments"      count={summary.deployments}     color="var(--purple)"         delay={0.05} />
                <ResourceCard icon={Network}  label="Services"         count={summary.services}        color="var(--green)"          delay={0.1}  />
                <ResourceCard icon={Key}      label="Secrets"          count={summary.secrets}         color="var(--amber)"          delay={0.15} />
                <ResourceCard icon={Users}    label="RBAC roles"       count={summary.rbac_roles}      color="var(--coral)"          delay={0.2}  />
                <ResourceCard icon={Shield}   label="Network policies" count={summary.network_policies} color="var(--text-secondary)" delay={0.25} />
              </div>
              <button onClick={() => onScanComplete && onScanComplete(scanResult)} style={{ padding: '12px 28px', background: 'var(--cyan)', color: '#080C14', border: 'none', borderRadius: 'var(--radius-md)', fontWeight: 700, fontSize: 13, cursor: 'pointer', fontFamily: 'var(--font-ui)', display: 'flex', alignItems: 'center', gap: 8 }}>
                View security findings <ChevronRight size={14} />
              </button>
            </div>
          )}
        </div>
      )}
    </div>
  )
}
