import React, { useState, useRef, useEffect, useCallback } from 'react'
import { Upload, CheckCircle, Loader, Box, FileText, Shield, Key, Network, Users, Radio, ChevronRight, AlertCircle, RefreshCw } from 'lucide-react'
import { useTheme } from '../theme/ThemeContext'

// ── Color palette ──────────────────────────────────────────────────────────
const NS_PALETTE = [
  { border: '#FF4444', bg: '#FF444415', dot: '#FF4444', label: '#FF6666' },
  { border: '#00D4FF', bg: '#00D4FF15', dot: '#00D4FF', label: '#33DDFF' },
  { border: '#A78BFA', bg: '#A78BFA15', dot: '#A78BFA', label: '#C4ADFC' },
  { border: '#10B981', bg: '#10B98115', dot: '#10B981', label: '#34D399' },
  { border: '#F59E0B', bg: '#F59E0B15', dot: '#F59E0B', label: '#FBB43A' },
  { border: '#EC4899', bg: '#EC489915', dot: '#EC4899', label: '#F472B6' },
]

const POD_STATUS_COLOR = {
  Running:   '#10B981',
  Pending:   '#F59E0B',
  Failed:    '#FF4444',
  Succeeded: '#A78BFA',
  Unknown:   '#6B7280',
}

// ── Namespace + Pod Graph rendered with SVG ────────────────────────────────
function ClusterGraph({ namespaces, dark }) {
  const [hovered, setHovered] = useState(null)
  const [selectedNs, setSelectedNs] = useState(null)

  if (!namespaces.length) return null

  const CARD_W  = 220
  const CARD_H  = 140
  const COLS    = Math.min(3, namespaces.length)
  const ROWS    = Math.ceil(namespaces.length / COLS)
  const GAP_X   = 40
  const GAP_Y   = 60
  const PAD     = 24
  const SVG_W   = COLS * CARD_W + (COLS - 1) * GAP_X + PAD * 2
  const SVG_H   = ROWS * CARD_H + (ROWS - 1) * GAP_Y + PAD * 2

  return (
    <div style={{ overflowX: 'auto', overflowY: 'auto', maxHeight: 480 }}>
      <svg
        width={SVG_W}
        height={SVG_H}
        style={{ fontFamily: 'var(--font-mono)', display: 'block' }}
      >
        <defs>
          <filter id="glow">
            <feGaussianBlur stdDeviation="2" result="blur" />
            <feMerge><feMergeNode in="blur" /><feMergeNode in="SourceGraphic" /></feMerge>
          </filter>
        </defs>

        {/* Draw connection lines between adjacent namespaces */}
        {namespaces.map((ns, i) => {
          if (i === 0) return null
          const prevCol = (i - 1) % COLS
          const prevRow = Math.floor((i - 1) / COLS)
          const curCol  = i % COLS
          const curRow  = Math.floor(i / COLS)
          const x1 = PAD + prevCol * (CARD_W + GAP_X) + CARD_W
          const y1 = PAD + prevRow * (CARD_H + GAP_Y) + CARD_H / 2
          const x2 = PAD + curCol  * (CARD_W + GAP_X)
          const y2 = PAD + curRow  * (CARD_H + GAP_Y) + CARD_H / 2
          if (prevRow !== curRow) return null
          return (
            <line key={`line-${i}`}
              x1={x1} y1={y1} x2={x2} y2={y2}
              stroke={dark ? '#1E3A5F' : '#D1D5DB'}
              strokeWidth={1}
              strokeDasharray="4 4"
            />
          )
        })}

        {/* Namespace cards */}
        {namespaces.map((ns, i) => {
          const col    = i % COLS
          const row    = Math.floor(i / COLS)
          const x      = PAD + col * (CARD_W + GAP_X)
          const y      = PAD + row * (CARD_H + GAP_Y)
          const pal    = NS_PALETTE[i % NS_PALETTE.length]
          const isHov  = hovered === ns.name
          const isSel  = selectedNs === ns.name
          const pods   = ns.pods || []
          const maxPodDots = 12
          const showPods   = pods.slice(0, maxPodDots)

          return (
            <g key={ns.name}
              style={{ cursor: 'pointer' }}
              onClick={() => setSelectedNs(isSel ? null : ns.name)}
              onMouseEnter={() => setHovered(ns.name)}
              onMouseLeave={() => setHovered(null)}
            >
              <rect
                x={x} y={y} width={CARD_W} height={CARD_H}
                rx={8} ry={8}
                fill={dark ? (isHov || isSel ? pal.bg : '#111827') : (isHov || isSel ? pal.bg : '#F9FAFB')}
                stroke={isSel ? pal.border : isHov ? pal.border : (dark ? '#1F2937' : '#E5E7EB')}
                strokeWidth={isSel ? 2 : 1}
                filter={isSel ? 'url(#glow)' : ''}
              />

              <rect x={x} y={y + 12} width={3} height={CARD_H - 24} rx={2} fill={pal.border} />

              <text
                x={x + 14} y={y + 22}
                fontSize={11} fontWeight={700}
                fill={pal.label}
                letterSpacing={1}
              >
                {ns.name.length > 18 ? ns.name.slice(0, 15) + '...' : ns.name}
              </text>

              <text x={x + 14} y={y + 38} fontSize={9} fill={dark ? '#6B7280' : '#9CA3AF'}>
                {ns.pod_count} pods · {ns.status || 'Active'}
              </text>

              {showPods.map((pod, pi) => {
                const dotCol  = pi % 6
                const dotRow  = Math.floor(pi / 6)
                const dotX    = x + 14 + dotCol * 18
                const dotY    = y + 52 + dotRow * 18
                const status  = pod.status || 'Running'
                const color   = POD_STATUS_COLOR[status] || '#6B7280'
                return (
                  <g key={pod.name || pi}>
                    <circle
                      cx={dotX + 4} cy={dotY + 4}
                      r={5}
                      fill={color + '30'}
                      stroke={color}
                      strokeWidth={1}
                    />
                    <title>{pod.name || `pod-${pi}`} ({status})</title>
                  </g>
                )
              })}

              {pods.length > maxPodDots && (
                <text
                  x={x + 14} y={y + CARD_H - 10}
                  fontSize={9} fill={dark ? '#4B5563' : '#9CA3AF'}
                >
                  +{pods.length - maxPodDots} more
                </text>
              )}

              <circle
                cx={x + CARD_W - 14} cy={y + 14}
                r={4}
                fill={ns.status === 'Active' ? '#10B981' : '#F59E0B'}
              >
                <animate attributeName="opacity" values="1;0.4;1" dur="2s" repeatCount="indefinite" />
              </circle>
            </g>
          )
        })}
      </svg>

      {selectedNs && (() => {
        const ns  = namespaces.find(n => n.name === selectedNs)
        const pal = NS_PALETTE[namespaces.indexOf(ns) % NS_PALETTE.length]
        if (!ns) return null
        return (
          <div style={{
            marginTop: 16,
            background: dark ? '#111827' : '#F9FAFB',
            border: `1px solid ${pal.border}40`,
            borderLeft: `3px solid ${pal.border}`,
            borderRadius: 8,
            padding: '14px 16px',
            animation: 'fade-up 0.2s ease',
          }}>
            <div style={{ fontSize: 11, fontWeight: 700, color: pal.label, fontFamily: 'var(--font-mono)', marginBottom: 10, letterSpacing: 1 }}>
              {selectedNs} — all pods
            </div>
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(180px, 1fr))', gap: 6 }}>
              {(ns.pods || []).map((pod, i) => {
                const status = pod.status || 'Running'
                const color  = POD_STATUS_COLOR[status] || '#6B7280'
                return (
                  <div key={i} style={{ display: 'flex', alignItems: 'center', gap: 6, padding: '4px 8px', background: dark ? '#0d1117' : '#fff', borderRadius: 4, border: `1px solid ${color}30` }}>
                    <div style={{ width: 6, height: 6, borderRadius: '50%', background: color, flexShrink: 0 }} />
                    <span style={{ fontFamily: 'var(--font-mono)', fontSize: 10, color: dark ? '#9CA3AF' : '#374151', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                      {pod.name}
                    </span>
                    <span style={{ marginLeft: 'auto', fontSize: 9, color, flexShrink: 0 }}>{status}</span>
                  </div>
                )
              })}
            </div>
          </div>
        )
      })()}
    </div>
  )
}

// ── Resource summary cards ─────────────────────────────────────────────────
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
      <div style={{ fontSize: 22, fontWeight: 600, color: 'var(--text-primary)', fontFamily: 'var(--font-mono)', lineHeight: 1 }}>{count ?? '—'}</div>
      <div style={{ fontSize: 11, color: 'var(--text-muted)', marginTop: 2 }}>{label}</div>
    </div>
  </div>
)

// ── Scan log terminal ──────────────────────────────────────────────────────
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

// ── Main Ingest component ──────────────────────────────────────────────────
export default function Ingest({ onScanComplete }) {
  const { theme } = useTheme()
  const dark = theme === 'dark'

  const [mode, setMode]           = useState('live')
  const [state, setState]         = useState('idle')
  const [logLines, setLogLines]   = useState([])
  const [summary, setSummary]     = useState(null)
  const [scanResult, setScanResult] = useState(null)
  const [fileName, setFileName]   = useState(null)
  const [dragging, setDragging]   = useState(false)
  const [errorMsg, setErrorMsg]   = useState('')

  // ── Dynamic cluster state ──────────────────────────────────────────────
  const [namespaces, setNamespaces]       = useState([])
  const [nsLoading, setNsLoading]         = useState(true)
  const [nsError, setNsError]             = useState(false)
  const [clusterReachable, setClusterReachable] = useState(false)
  const [clusterMeta, setClusterMeta]     = useState(null)
  const [lastRefresh, setLastRefresh]     = useState(null)

  const fileRef = useRef()

  const fetchNamespaces = useCallback(async () => {
    setNsLoading(true)
    setNsError(false)
    try {
      const res  = await fetch('/api/ingest/namespaces')
      if (!res.ok) throw new Error('unreachable')
      const data = await res.json()
      setNamespaces(data.namespaces || [])
      setClusterReachable(true)
      setClusterMeta(data.cluster_info || null)
      setLastRefresh(new Date())
    } catch {
      setClusterReachable(false)
      setNsError(true)
      setNamespaces([])
    } finally {
      setNsLoading(false)
    }
  }, [])

  useEffect(() => {
    fetchNamespaces()
    const interval = setInterval(fetchNamespaces, 60000)
    return () => clearInterval(interval)
  }, [fetchNamespaces])

  const addLog = (text, type = 'info') =>
    setLogLines(prev => [...prev, { text, type }])

  const reset = () => {
    setState('idle')
    setLogLines([])
    setSummary(null)
    setScanResult(null)
    setErrorMsg('')
  }

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
      const analyzeRes = await fetch('/api/analyze', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ resources: ingestData.resources }),
      })
      if (!analyzeRes.ok) throw new Error(await analyzeRes.text())
      const result = await analyzeRes.json()
      addLog(`✓ Analysis complete — ${result.findings.length} findings, score ${result.score?.risk_score}`, 'success')
      setScanResult(result)
      setState('done')
      onScanComplete?.({ ...result, summary: ingestData.summary })
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
      onScanComplete?.({ ...result, summary: ingestData.summary })
    } catch (err) {
      addLog(`✗ Error: ${err.message}`, 'error')
      setErrorMsg(err.message)
      setState('error')
    }
  }

  return (
    <div style={{ padding: '32px 40px', animation: 'fade-up 0.3s ease' }}>

      {/* ── Page header ───────────────────────────────────────────────────── */}
      <div style={{ marginBottom: 24 }}>
        <div style={{ fontFamily: 'var(--font-mono)', fontSize: 11, color: 'var(--cyan)', letterSpacing: '0.2em', textTransform: 'uppercase', marginBottom: 6 }}>
          01 · INGESTION SERVICE
        </div>
        <h1 style={{ fontFamily: 'var(--font-display)', fontSize: 32, color: 'var(--text-primary)', marginBottom: 4, textTransform: 'uppercase' }}>
          Resource ingestion
        </h1>
        <p style={{ color: 'var(--text-secondary)', fontSize: 13 }}>
          Pull live resource state from your cluster's API server, or upload a YAML manifest for offline analysis.
        </p>
      </div>

      {/* ── Mode toggle ───────────────────────────────────────────────────── */}
      <div style={{ display: 'flex', background: 'var(--bg-elevated)', border: '1px solid var(--border)', borderRadius: 'var(--radius-lg)', padding: 4, marginBottom: 28, width: 'fit-content', gap: 4 }}>
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
              <div style={{ fontSize: 10, color: mode === id ? (id === 'live' ? 'var(--cyan)' : 'var(--text-primary)') : 'var(--text-muted)', lineHeight: 1.2 }}>{desc}</div>
            </div>
          </button>
        ))}
      </div>

      {/* ── LIVE MODE ─────────────────────────────────────────────────────── */}
      {mode === 'live' && (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
          <div style={{ background: 'var(--bg-card)', border: '1px solid var(--border-mid)', borderRadius: 'var(--radius-xl)', padding: 24 }}>

            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 20 }}>
              <div>
                <div style={{ fontSize: 13, fontWeight: 700, color: 'var(--text-primary)', marginBottom: 4, fontFamily: 'var(--font-mono)', letterSpacing: -0.3 }}>
                  {clusterMeta
                    ? `${clusterMeta.node_count}-node Kubernetes cluster`
                    : '3-node Kubernetes cluster'}
                </div>
                <div style={{ fontFamily: 'var(--font-mono)', fontSize: 11, color: 'var(--text-muted)' }}>
                  {clusterMeta
                    ? `${clusterMeta.nodes?.join(' · ')} · ${clusterMeta.kubernetes_version || 'k8s'}`
                    : '1 control plane · 2 worker nodes · in-cluster SA auth'}
                </div>
              </div>
              <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                <button
                  onClick={fetchNamespaces}
                  disabled={nsLoading}
                  style={{ background: 'none', border: '1px solid var(--border)', borderRadius: 6, padding: '4px 8px', cursor: 'pointer', color: 'var(--text-muted)', display: 'flex', alignItems: 'center', gap: 4, fontSize: 11, fontFamily: 'var(--font-ui)' }}
                >
                  <RefreshCw size={11} style={{ animation: nsLoading ? 'spin 1s linear infinite' : 'none' }} />
                  {lastRefresh ? lastRefresh.toLocaleTimeString() : 'Refresh'}
                </button>

                <div style={{ display: 'flex', alignItems: 'center', gap: 6, padding: '6px 12px', background: clusterReachable ? 'var(--green-dim)' : 'rgba(255,77,109,0.1)', border: `1px solid ${clusterReachable ? 'rgba(16,185,129,0.2)' : 'rgba(255,77,109,0.2)'}`, borderRadius: 99 }}>
                  <div style={{ width: 6, height: 6, borderRadius: '50%', background: clusterReachable ? 'var(--green)' : 'var(--coral)', animation: 'pulse-dot 2s ease-in-out infinite' }} />
                  <span style={{ fontFamily: 'var(--font-mono)', fontSize: 11, color: clusterReachable ? 'var(--green)' : 'var(--coral)' }}>
                    {clusterReachable ? 'API server reachable' : 'API server unreachable'}
                  </span>
                </div>
              </div>
            </div>

            {/* ── Ingestion log (left) + Hierarchical topology map (right) ── */}
            <div style={{ display: 'grid', gridTemplateColumns: '380px 1fr', gap: 24 }}>
              <div>
                <div style={{ fontFamily: 'var(--font-mono)', fontSize: 10, color: 'var(--text-muted)', letterSpacing: '0.12em', marginBottom: 10 }}>
                  01A // BASH INGESTION STREAM
                </div>
                <ScanLog lines={logLines.length > 0 ? logLines : [
                  { text: '$ exec --init map-topology --target=k8s_api_server', type: 'info' },
                  { text: nsLoading ? 'connecting…' : clusterReachable ? '✓ connection established' : '✗ connection failed', type: nsLoading ? 'info' : clusterReachable ? 'success' : 'error' },
                ]} />
              </div>

              <div>
                <div style={{ fontFamily: 'var(--font-mono)', fontSize: 10, color: 'var(--text-muted)', letterSpacing: '0.12em', marginBottom: 10 }}>
                  01B // HIERARCHICAL TOPOLOGY MAP
                </div>
                {nsLoading ? (
                  <div style={{ display: 'flex', alignItems: 'center', gap: 10, padding: '24px 0', color: 'var(--text-muted)', fontFamily: 'var(--font-mono)', fontSize: 12 }}>
                    <Loader size={14} style={{ animation: 'spin 1s linear infinite' }} />
                    Fetching namespaces and pods from cluster...
                  </div>
                ) : nsError ? (
                  <div style={{ padding: '20px', background: 'rgba(255,77,109,0.08)', border: '1px solid rgba(255,77,109,0.2)', borderRadius: 8, fontSize: 12, color: 'var(--coral)', fontFamily: 'var(--font-mono)' }}>
                    Could not reach cluster API. Check that the backend is running and has a valid kubeconfig.
                  </div>
                ) : namespaces.length === 0 ? (
                  <div style={{ padding: '20px', color: 'var(--text-muted)', fontSize: 12, fontFamily: 'var(--font-mono)' }}>
                    No namespaces found.
                  </div>
                ) : (
                  <ClusterGraph namespaces={namespaces} dark={dark} />
                )}
              </div>
            </div>

            <div style={{ marginTop: 20 }}>
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
          </div>

          {state === 'done' && summary && (
            <div style={{ animation: 'fade-up 0.4s ease' }}>
              <div style={{ fontSize: 11, color: 'var(--text-muted)', letterSpacing: '0.12em', textTransform: 'uppercase', marginBottom: 12 }}>Extracted from cluster</div>
              <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: 10 }}>
                <ResourceCard icon={Box}      label="Pods"             count={summary.pods}             color="var(--cyan)"           delay={0}    />
                <ResourceCard icon={FileText} label="Deployments"      count={summary.deployments}      color="var(--purple)"         delay={0.05} />
                <ResourceCard icon={Network}  label="Services"         count={summary.services}         color="var(--green)"          delay={0.1}  />
                <ResourceCard icon={Key}      label="Secrets"          count={summary.secrets}          color="var(--amber)"          delay={0.15} />
                <ResourceCard icon={Users}    label="RBAC roles"       count={summary.rbac_roles}       color="var(--coral)"          delay={0.2}  />
                <ResourceCard icon={Shield}   label="Network policies" count={summary.network_policies} color="var(--text-secondary)" delay={0.25} />
              </div>
              <button onClick={() => onScanComplete?.(scanResult)} style={{ marginTop: 20, padding: '12px 28px', background: 'var(--cyan)', color: '#080C14', border: 'none', borderRadius: 'var(--radius-md)', fontWeight: 700, fontSize: 13, cursor: 'pointer', fontFamily: 'var(--font-ui)', display: 'flex', alignItems: 'center', gap: 8 }}>
                View security findings <ChevronRight size={14} />
              </button>
            </div>
          )}
        </div>
      )}

      {/* ── YAML MODE ─────────────────────────────────────────────────────── */}
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
                <ResourceCard icon={Box}      label="Pods"             count={summary.pods}             color="var(--cyan)"           delay={0}    />
                <ResourceCard icon={FileText} label="Deployments"      count={summary.deployments}      color="var(--purple)"         delay={0.05} />
                <ResourceCard icon={Network}  label="Services"         count={summary.services}         color="var(--green)"          delay={0.1}  />
                <ResourceCard icon={Key}      label="Secrets"          count={summary.secrets}          color="var(--amber)"          delay={0.15} />
                <ResourceCard icon={Users}    label="RBAC roles"       count={summary.rbac_roles}       color="var(--coral)"          delay={0.2}  />
                <ResourceCard icon={Shield}   label="Network policies" count={summary.network_policies} color="var(--text-secondary)" delay={0.25} />
              </div>
              <button onClick={() => onScanComplete?.(scanResult)} style={{ padding: '12px 28px', background: 'var(--cyan)', color: '#080C14', border: 'none', borderRadius: 'var(--radius-md)', fontWeight: 700, fontSize: 13, cursor: 'pointer', fontFamily: 'var(--font-ui)', display: 'flex', alignItems: 'center', gap: 8 }}>
                View security findings <ChevronRight size={14} />
              </button>
            </div>
          )}
        </div>
      )}
    </div>
  )
}