import React, { useState, useRef } from 'react'
import { Upload, FileText, CheckCircle, Loader, Box, Shield, Key, Network, Users, Radio, ChevronRight, AlertCircle } from 'lucide-react'
import { mockParsedResources } from '../utils/mockData'

const ResourceCard = ({ icon: Icon, label, count, color, delay = 0 }) => (
  <div style={{
    background: 'var(--bg-card)',
    border: '1px solid var(--border)',
    borderRadius: 'var(--radius-lg)',
    padding: '16px 20px',
    display: 'flex',
    alignItems: 'center',
    gap: 12,
    animation: `fade-up 0.4s ease ${delay}s both`,
  }}>
    <div style={{
      width: 36, height: 36,
      background: `${color}20`,
      border: `1px solid ${color}40`,
      borderRadius: 8,
      display: 'flex', alignItems: 'center', justifyContent: 'center',
    }}>
      <Icon size={16} color={color} />
    </div>
    <div>
      <div style={{ fontSize: 22, fontWeight: 600, color: 'var(--text-primary)', fontFamily: 'var(--font-mono)', lineHeight: 1 }}>
        {count}
      </div>
      <div style={{ fontSize: 11, color: 'var(--text-muted)', marginTop: 2 }}>{label}</div>
    </div>
  </div>
)

const NamespacePill = ({ name, podCount, color }) => (
  <div style={{
    display: 'flex', alignItems: 'center', justifyContent: 'space-between',
    padding: '10px 14px',
    background: 'var(--bg-elevated)',
    border: `1px solid ${color}30`,
    borderLeft: `3px solid ${color}`,
    borderRadius: 'var(--radius-md)',
  }}>
    <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
      <div style={{ width: 6, height: 6, borderRadius: '50%', background: color, animation: 'pulse-dot 2s ease-in-out infinite' }} />
      <span style={{ fontFamily: 'var(--font-mono)', fontSize: 12, color: 'var(--text-primary)' }}>{name}</span>
    </div>
    <span style={{ fontFamily: 'var(--font-mono)', fontSize: 11, color: 'var(--text-muted)' }}>{podCount} pods</span>
  </div>
)

const ScanLog = ({ lines }) => (
  <div style={{
    background: 'var(--bg-base)',
    border: '1px solid var(--border)',
    borderRadius: 'var(--radius-md)',
    padding: '14px 16px',
    fontFamily: 'var(--font-mono)',
    fontSize: 11,
    color: 'var(--text-secondary)',
    lineHeight: 1.8,
    maxHeight: 140,
    overflow: 'auto',
  }}>
    {lines.map((line, i) => (
      <div key={i}>
        <span style={{ color: 'var(--text-muted)' }}>[{new Date().toLocaleTimeString()}]</span>{' '}
        <span style={{ color: line.startsWith('✓') ? 'var(--green)' : line.startsWith('→') ? 'var(--cyan)' : 'var(--text-secondary)' }}>
          {line}
        </span>
      </div>
    ))}
    {lines.length > 0 && <div style={{ display: 'inline-block', width: 6, height: 12, background: 'var(--cyan)', marginLeft: 2, animation: 'pulse-dot 1s ease-in-out infinite' }} />}
  </div>
)

const LIVE_LOGS = [
  '→ Connecting to Kubernetes API server...',
  '✓ In-cluster ServiceAccount authenticated',
  '→ Listing namespaces: kubeshield, dev-sim, prod-sim, monitoring',
  '→ Fetching pods across all namespaces...',
  '✓ 187 pods discovered across 2 worker nodes',
  '→ Fetching Deployments, Services, Secrets...',
  '✓ 5 Deployments, 8 Services, 6 Secrets extracted',
  '→ Fetching RBAC — ClusterRoles, RoleBindings...',
  '✓ 4 ClusterRoles, 11 RoleBindings retrieved',
  '→ Fetching NetworkPolicies...',
  '✓ 2 NetworkPolicies found',
  '✓ All resources forwarded to security-service',
]

const YAML_LOGS = [
  '→ Reading uploaded YAML file...',
  '✓ PyYAML parser loaded manifest',
  '→ Extracting resource kinds...',
  '✓ Pods, Deployments, Services, Secrets, RBAC parsed',
  '→ Building Pydantic models...',
  '✓ 48 resources validated and forwarded to security-service',
]

export default function Ingest({ onScanComplete }) {
  const [mode, setMode] = useState('live')           // 'live' | 'yaml'
  const [state, setState] = useState('idle')          // idle | scanning | done
  const [fileName, setFileName] = useState(null)
  const [dragging, setDragging] = useState(false)
  const [logLines, setLogLines] = useState([])
  const fileRef = useRef()

  const runLiveScan = () => {
    setState('scanning')
    setLogLines([])
    const logs = LIVE_LOGS
    logs.forEach((line, i) => {
      setTimeout(() => {
        setLogLines(prev => [...prev, line])
        if (i === logs.length - 1) {
          setTimeout(() => { setState('done'); onScanComplete && onScanComplete() }, 400)
        }
      }, i * 220)
    })
  }

  const handleFile = (file) => {
    if (!file) return
    setFileName(file.name)
    setState('scanning')
    setLogLines([])
    YAML_LOGS.forEach((line, i) => {
      setTimeout(() => {
        setLogLines(prev => [...prev, line])
        if (i === YAML_LOGS.length - 1) {
          setTimeout(() => { setState('done'); onScanComplete && onScanComplete() }, 400)
        }
      }, i * 280)
    })
  }

  const reset = () => { setState('idle'); setLogLines([]); setFileName(null) }

  return (
    <div style={{ padding: '32px 40px', maxWidth: 900, margin: '0 auto', animation: 'fade-up 0.3s ease' }}>
      {/* Header */}
      <div style={{ marginBottom: 28 }}>
        <div style={{ fontFamily: 'var(--font-mono)', fontSize: 11, color: 'var(--cyan)', letterSpacing: '0.15em', textTransform: 'uppercase', marginBottom: 8 }}>
          01 · Ingestion service
        </div>
        <h1 style={{ fontSize: 28, fontWeight: 600, color: 'var(--text-primary)', lineHeight: 1.2 }}>
          Resource ingestion
        </h1>
        <p style={{ color: 'var(--text-secondary)', marginTop: 8, fontSize: 14 }}>
          Pull live resource state directly from your cluster's API server, or upload a YAML manifest for offline analysis.
        </p>
      </div>

      {/* Mode toggle */}
      <div style={{
        display: 'flex',
        background: 'var(--bg-elevated)',
        border: '1px solid var(--border)',
        borderRadius: 'var(--radius-lg)',
        padding: 4,
        marginBottom: 24,
        width: 'fit-content',
        gap: 4,
      }}>
        {[
          { id: 'live', label: 'Live cluster scan', icon: Radio, desc: 'Primary' },
          { id: 'yaml', label: 'Upload YAML',       icon: Upload, desc: 'Offline fallback' },
        ].map(({ id, label, icon: Icon, desc }) => (
          <button key={id} onClick={() => { setMode(id); reset() }} style={{
            display: 'flex', alignItems: 'center', gap: 8,
            padding: '10px 18px',
            borderRadius: 10,
            border: 'none',
            background: mode === id ? (id === 'live' ? 'var(--cyan-dim)' : 'var(--bg-card)') : 'transparent',
            cursor: 'pointer',
            transition: 'background 0.2s',
            outline: mode === id ? `1px solid ${id === 'live' ? 'var(--border-strong)' : 'var(--border)'}` : 'none',
          }}>
            <Icon size={14} color={mode === id ? (id === 'live' ? 'var(--cyan)' : 'var(--text-secondary)') : 'var(--text-muted)'} />
            <div style={{ textAlign: 'left' }}>
              <div style={{ fontSize: 12, fontWeight: 600, color: mode === id ? (id === 'live' ? 'var(--cyan)' : 'var(--text-primary)') : 'var(--text-muted)', lineHeight: 1.2 }}>
                {label}
              </div>
              <div style={{ fontSize: 10, color: mode === id && id === 'live' ? 'var(--cyan)' : 'var(--text-muted)', lineHeight: 1.2, marginTop: 1 }}>
                {desc}
              </div>
            </div>
          </button>
        ))}
      </div>

      {/* ── LIVE SCAN MODE ── */}
      {mode === 'live' && (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
          {/* Cluster info card */}
          <div style={{
            background: 'var(--bg-card)',
            border: '1px solid var(--border-mid)',
            borderRadius: 'var(--radius-xl)',
            padding: '24px',
          }}>
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 20 }}>
              <div>
                <div style={{ fontSize: 13, fontWeight: 600, color: 'var(--text-primary)', marginBottom: 4 }}>
                  3-node Kubernetes cluster
                </div>
                <div style={{ fontFamily: 'var(--font-mono)', fontSize: 11, color: 'var(--text-muted)' }}>
                  1 control plane · 2 worker nodes · in-cluster SA auth
                </div>
              </div>
              <div style={{ display: 'flex', alignItems: 'center', gap: 6, padding: '6px 12px', background: 'var(--green-dim)', border: '1px solid rgba(16,185,129,0.2)', borderRadius: 99 }}>
                <div style={{ width: 6, height: 6, borderRadius: '50%', background: 'var(--green)', animation: 'pulse-dot 2s ease-in-out infinite' }} />
                <span style={{ fontFamily: 'var(--font-mono)', fontSize: 11, color: 'var(--green)' }}>API server reachable</span>
              </div>
            </div>

            {/* Namespaces */}
            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 8, marginBottom: 20 }}>
              <NamespacePill name="dev-sim"     podCount={130} color="var(--coral)"  />
              <NamespacePill name="prod-sim"    podCount={32}  color="var(--green)"  />
              <NamespacePill name="kubeshield"  podCount={18}  color="var(--cyan)"   />
              <NamespacePill name="monitoring"  podCount={7}   color="var(--amber)"  />
            </div>

            {/* What will be fetched */}
            <div style={{ padding: '12px 16px', background: 'var(--bg-elevated)', borderRadius: 'var(--radius-md)', marginBottom: 20 }}>
              <div style={{ fontSize: 10, color: 'var(--text-muted)', letterSpacing: '0.1em', textTransform: 'uppercase', marginBottom: 10 }}>
                Resources to fetch via API server
              </div>
              <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6 }}>
                {['Pods', 'Deployments', 'Services', 'Secrets', 'ClusterRoles', 'RoleBindings', 'NetworkPolicies', 'ServiceAccounts'].map(r => (
                  <span key={r} style={{
                    padding: '3px 10px', borderRadius: 4,
                    fontSize: 11, fontFamily: 'var(--font-mono)',
                    color: 'var(--cyan)',
                    background: 'var(--cyan-dim)',
                    border: '1px solid var(--border)',
                  }}>{r}</span>
                ))}
              </div>
            </div>

            {/* Log output */}
            {logLines.length > 0 && <div style={{ marginBottom: 16 }}><ScanLog lines={logLines} /></div>}

            {/* Action button */}
            {state === 'idle' && (
              <button onClick={runLiveScan} style={{
                padding: '12px 28px',
                background: 'var(--cyan)',
                color: '#080C14',
                border: 'none',
                borderRadius: 'var(--radius-md)',
                fontWeight: 700,
                fontSize: 13,
                cursor: 'pointer',
                fontFamily: 'var(--font-ui)',
                display: 'flex', alignItems: 'center', gap: 8,
                transition: 'opacity 0.15s',
              }}
              onMouseEnter={e => e.currentTarget.style.opacity = '0.85'}
              onMouseLeave={e => e.currentTarget.style.opacity = '1'}
              >
                <Radio size={14} />
                Start live cluster scan
              </button>
            )}

            {state === 'scanning' && (
              <div style={{ display: 'flex', alignItems: 'center', gap: 10, color: 'var(--cyan)' }}>
                <Loader size={16} style={{ animation: 'spin 1s linear infinite' }} />
                <span style={{ fontFamily: 'var(--font-mono)', fontSize: 12 }}>Querying API server…</span>
              </div>
            )}

            {state === 'done' && (
              <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
                <CheckCircle size={16} color="var(--green)" />
                <span style={{ fontFamily: 'var(--font-mono)', fontSize: 12, color: 'var(--green)' }}>
                  All resources fetched and forwarded to security-service
                </span>
                <button onClick={reset} style={{ marginLeft: 'auto', background: 'none', border: '1px solid var(--border)', color: 'var(--text-muted)', borderRadius: 6, padding: '4px 10px', fontSize: 11, cursor: 'pointer', fontFamily: 'var(--font-ui)' }}>
                  Rescan
                </button>
              </div>
            )}
          </div>

          {/* Resources extracted (shown after done) */}
          {state === 'done' && (
            <div style={{ animation: 'fade-up 0.4s ease' }}>
              <div style={{ fontSize: 11, color: 'var(--text-muted)', letterSpacing: '0.12em', textTransform: 'uppercase', marginBottom: 12 }}>
                Extracted from cluster
              </div>
              <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: 10 }}>
                <ResourceCard icon={Box}      label="Pods"             count={187}  color="var(--cyan)"            delay={0}    />
                <ResourceCard icon={FileText} label="Deployments"      count={12}   color="var(--purple)"          delay={0.05} />
                <ResourceCard icon={Network}  label="Services"         count={16}   color="var(--green)"           delay={0.1}  />
                <ResourceCard icon={Key}      label="Secrets"          count={9}    color="var(--amber)"           delay={0.15} />
                <ResourceCard icon={Users}    label="RBAC roles"       count={4}    color="var(--coral)"           delay={0.2}  />
                <ResourceCard icon={Shield}   label="Network policies" count={2}    color="var(--text-secondary)"  delay={0.25} />
              </div>
              <button onClick={() => onScanComplete && onScanComplete()} style={{
                marginTop: 20,
                padding: '12px 28px',
                background: 'var(--cyan)',
                color: '#080C14',
                border: 'none',
                borderRadius: 'var(--radius-md)',
                fontWeight: 700,
                fontSize: 13,
                cursor: 'pointer',
                fontFamily: 'var(--font-ui)',
                display: 'flex', alignItems: 'center', gap: 8,
              }}>
                View security findings <ChevronRight size={14} />
              </button>
            </div>
          )}
        </div>
      )}

      {/* ── YAML UPLOAD MODE ── */}
      {mode === 'yaml' && (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
          {/* Notice */}
          <div style={{ display: 'flex', gap: 10, padding: '12px 16px', background: 'var(--amber-dim)', border: '1px solid rgba(245,158,11,0.25)', borderRadius: 'var(--radius-md)' }}>
            <AlertCircle size={14} color="var(--amber)" style={{ flexShrink: 0, marginTop: 2 }} />
            <p style={{ fontSize: 12, color: 'var(--amber)', margin: 0, lineHeight: 1.6 }}>
              YAML upload is a fallback for offline or air-gapped environments. For real cluster analysis, use live scan above — it captures runtime state that static YAMLs can't.
            </p>
          </div>

          {/* Drop zone */}
          <div
            onDragOver={e => { e.preventDefault(); setDragging(true) }}
            onDragLeave={() => setDragging(false)}
            onDrop={e => { e.preventDefault(); setDragging(false); handleFile(e.dataTransfer.files[0]) }}
            onClick={() => state === 'idle' && fileRef.current?.click()}
            style={{
              border: `2px dashed ${dragging ? 'var(--cyan)' : state === 'done' ? 'var(--green)' : 'var(--border-mid)'}`,
              borderRadius: 'var(--radius-xl)',
              padding: '48px 32px',
              textAlign: 'center',
              cursor: state === 'idle' ? 'pointer' : 'default',
              background: dragging ? 'var(--cyan-glow)' : state === 'done' ? 'var(--green-dim)' : 'var(--bg-elevated)',
              transition: 'all 0.2s ease',
            }}
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

            {state === 'scanning' && (
              <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 16 }}>
                <Loader size={40} color="var(--text-secondary)" style={{ animation: 'spin 1s linear infinite' }} />
                <div>
                  <div style={{ fontSize: 14, fontWeight: 500, color: 'var(--text-primary)', marginBottom: 4 }}>
                    Parsing <span style={{ fontFamily: 'var(--font-mono)', color: 'var(--cyan)' }}>{fileName}</span>
                  </div>
                  <div style={{ fontSize: 12, color: 'var(--text-muted)' }}>PyYAML → Pydantic models → security-service</div>
                </div>
              </div>
            )}

            {state === 'done' && (
              <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 10 }}>
                <CheckCircle size={40} color="var(--green)" />
                <div style={{ fontSize: 14, fontWeight: 500, color: 'var(--text-primary)' }}>
                  <span style={{ fontFamily: 'var(--font-mono)', color: 'var(--green)' }}>{fileName}</span> parsed
                </div>
                <div style={{ fontSize: 12, color: 'var(--text-muted)' }}>48 resources extracted · forwarded to security-service</div>
              </div>
            )}

            <input ref={fileRef} type="file" accept=".yaml,.yml" style={{ display: 'none' }} onChange={e => handleFile(e.target.files[0])} />
          </div>

          {/* Log output */}
          {logLines.length > 0 && <ScanLog lines={logLines} />}

          {/* Resources + CTA */}
          {state === 'done' && (
            <div style={{ animation: 'fade-up 0.4s ease' }}>
              <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: 10, marginBottom: 16 }}>
                <ResourceCard icon={Box}      label="Pods"             count={mockParsedResources.pods}            color="var(--cyan)"           delay={0}    />
                <ResourceCard icon={FileText} label="Deployments"      count={mockParsedResources.deployments}     color="var(--purple)"         delay={0.05} />
                <ResourceCard icon={Network}  label="Services"         count={mockParsedResources.services}        color="var(--green)"          delay={0.1}  />
                <ResourceCard icon={Key}      label="Secrets"          count={mockParsedResources.secrets}         color="var(--amber)"          delay={0.15} />
                <ResourceCard icon={Users}    label="RBAC roles"       count={mockParsedResources.rbacRoles}       color="var(--coral)"          delay={0.2}  />
                <ResourceCard icon={Shield}   label="Network policies" count={mockParsedResources.networkPolicies} color="var(--text-secondary)" delay={0.25} />
              </div>
              <button onClick={() => onScanComplete && onScanComplete()} style={{
                padding: '12px 28px',
                background: 'var(--cyan)',
                color: '#080C14',
                border: 'none',
                borderRadius: 'var(--radius-md)',
                fontWeight: 700,
                fontSize: 13,
                cursor: 'pointer',
                fontFamily: 'var(--font-ui)',
                display: 'flex', alignItems: 'center', gap: 8,
              }}>
                View security findings <ChevronRight size={14} />
              </button>
            </div>
          )}
        </div>
      )}
    </div>
  )
}
