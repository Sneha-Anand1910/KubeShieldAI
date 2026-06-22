import React from 'react'
import { Upload, Shield, BarChart3, Sparkles, Clock, Activity } from 'lucide-react'

const NAV = [
  { id: 'ingest',   label: 'Ingest',    icon: Upload,    sub: 'Parse YAML' },
  { id: 'findings', label: 'Findings',  icon: Shield,    sub: 'Security analysis' },
  { id: 'score',    label: 'Risk Score',icon: BarChart3, sub: 'Scoring engine' },
  { id: 'ai',       label: 'AI Advice', icon: Sparkles,  sub: 'Gemini remediation' },
  { id: 'history',  label: 'History',   icon: Clock,     sub: 'Past scans' },
]

export default function Sidebar({ active, onNav, clusterStatus }) {
  return (
    <aside style={{
      width: 220,
      minHeight: '100vh',
      background: 'var(--bg-surface)',
      borderRight: '1px solid var(--border)',
      display: 'flex',
      flexDirection: 'column',
      flexShrink: 0,
    }}>
      {/* Logo */}
      <div style={{ padding: '28px 20px 20px', borderBottom: '1px solid var(--border)' }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 4 }}>
          <div style={{
            width: 32, height: 32,
            background: 'var(--cyan-dim)',
            border: '1px solid var(--border-strong)',
            borderRadius: 8,
            display: 'flex', alignItems: 'center', justifyContent: 'center',
            animation: 'glow-pulse 3s ease-in-out infinite',
          }}>
            <Shield size={16} color="var(--cyan)" />
          </div>
          <div>
            <div style={{ fontFamily: 'var(--font-mono)', fontWeight: 600, fontSize: 13, color: 'var(--text-primary)', letterSpacing: '0.05em' }}>
              KubeShield
            </div>
            <div style={{ fontSize: 10, color: 'var(--cyan)', fontFamily: 'var(--font-mono)', letterSpacing: '0.1em' }}>
              AI · v1.0
            </div>
          </div>
        </div>
      </div>

      {/* Cluster status */}
      <div style={{ padding: '12px 20px', borderBottom: '1px solid var(--border)' }}>
        <div style={{ fontSize: 10, color: 'var(--text-muted)', letterSpacing: '0.12em', textTransform: 'uppercase', marginBottom: 8 }}>
          Cluster
        </div>
        <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
          <div style={{
            width: 6, height: 6, borderRadius: '50%',
            background: clusterStatus === 'connected' ? 'var(--green)' : 'var(--coral)',
            animation: 'pulse-dot 2s ease-in-out infinite',
          }} />
          <span style={{ fontFamily: 'var(--font-mono)', fontSize: 11, color: 'var(--text-secondary)' }}>
            {clusterStatus === 'connected' ? '3 nodes ready' : 'disconnected'}
          </span>
        </div>
        <div style={{ marginTop: 6, display: 'flex', gap: 6 }}>
          {['master','worker-1','worker-2'].map(n => (
            <div key={n} style={{
              flex: 1, height: 3, borderRadius: 99,
              background: clusterStatus === 'connected' ? 'var(--green)' : 'var(--text-muted)',
              opacity: clusterStatus === 'connected' ? 1 : 0.3,
              transition: 'background 0.5s',
            }} />
          ))}
        </div>
      </div>

      {/* Nav */}
      <nav style={{ flex: 1, padding: '8px 10px' }}>
        {NAV.map(({ id, label, icon: Icon, sub }) => {
          const isActive = active === id
          return (
            <button key={id} onClick={() => onNav(id)} style={{
              width: '100%',
              display: 'flex',
              alignItems: 'center',
              gap: 10,
              padding: '10px 10px',
              borderRadius: 8,
              border: 'none',
              background: isActive ? 'var(--cyan-dim)' : 'transparent',
              cursor: 'pointer',
              textAlign: 'left',
              marginBottom: 2,
              transition: 'background 0.15s',
              position: 'relative',
              outline: 'none',
            }}
            onMouseEnter={e => { if (!isActive) e.currentTarget.style.background = 'var(--bg-hover)' }}
            onMouseLeave={e => { if (!isActive) e.currentTarget.style.background = 'transparent' }}
            >
              {isActive && (
                <div style={{
                  position: 'absolute',
                  left: 0, top: '50%', transform: 'translateY(-50%)',
                  width: 3, height: 18, borderRadius: '0 2px 2px 0',
                  background: 'var(--cyan)',
                }} />
              )}
              <Icon size={15} color={isActive ? 'var(--cyan)' : 'var(--text-muted)'} />
              <div>
                <div style={{ fontSize: 13, fontWeight: 500, color: isActive ? 'var(--cyan)' : 'var(--text-secondary)', lineHeight: 1.2 }}>
                  {label}
                </div>
                <div style={{ fontSize: 10, color: 'var(--text-muted)', lineHeight: 1.2 }}>
                  {sub}
                </div>
              </div>
            </button>
          )
        })}
      </nav>

      {/* Footer */}
      <div style={{ padding: '12px 20px', borderTop: '1px solid var(--border)' }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
          <Activity size={12} color="var(--text-muted)" />
          <span style={{ fontSize: 10, color: 'var(--text-muted)', fontFamily: 'var(--font-mono)' }}>
            PES University · CCNCS
          </span>
        </div>
      </div>
    </aside>
  )
}
