import React from 'react'
import { BarChart3 } from 'lucide-react'
import { PieChart, Pie, Cell, BarChart, Bar, XAxis, YAxis, Tooltip, ResponsiveContainer } from 'recharts'

const SEV_COLORS = { Critical: '#FF4D6D', High: '#F59E0B', Medium: '#A78BFA', Low: '#10B981' }
const CHECK_COLORS = { 'Pod Security': '#00D4FF', 'RBAC': '#A78BFA', 'Secrets': '#F59E0B', 'Network': '#10B981' }

// Grade thresholds — MUST match score_to_grade() in the scoring service
const GRADE_BANDS = [
  { g: 'A+', range: '0–10',   label: 'Secure',   color: '#16a34a' },
  { g: 'A',  range: '11–20',  label: 'Low',      color: '#22c55e' },
  { g: 'B',  range: '21–35',  label: 'Moderate', color: '#84cc16' },
  { g: 'C',  range: '36–50',  label: 'Elevated', color: '#f59e0b' },
  { g: 'D',  range: '51–65',  label: 'High',     color: '#f97316' },
  { g: 'E',  range: '66–80',  label: 'Severe',   color: '#ea580c' },
  { g: 'F',  range: '81–100', label: 'Critical', color: '#dc2626' },
]

const CustomTooltip = ({ active, payload, label }) => {
  if (!active || !payload?.length) return null
  return (
    <div style={{ background: 'var(--bg-card)', border: '1px solid var(--border)', borderRadius: 8, padding: '10px 14px' }}>
      <div style={{ fontSize: 11, color: 'var(--text-muted)', marginBottom: 4 }}>{label}</div>
      {payload.map((p, i) => <div key={i} style={{ fontFamily: 'var(--font-mono)', fontSize: 13, color: p.color || 'var(--cyan)' }}>{p.name}: {p.value}</div>)}
    </div>
  )
}

const ScoreGauge = ({ score }) => {
  const color = score > 70 ? '#FF4D6D' : score > 40 ? '#F59E0B' : '#10B981'
  const circumference = 2 * Math.PI * 70
  const offset = circumference - (score / 100) * circumference * 0.75
  return (
    <div style={{ position: 'relative', width: 200, height: 160, margin: '0 auto' }}>
      <svg width="200" height="160" viewBox="0 0 200 160">
        <circle cx="100" cy="120" r="70" fill="none" stroke="var(--bg-hover)" strokeWidth="10" strokeDasharray={`${circumference * 0.75} ${circumference * 0.25}`} strokeDashoffset={circumference * 0.125} strokeLinecap="round" transform="rotate(180 100 120)" />
        <circle cx="100" cy="120" r="70" fill="none" stroke={color} strokeWidth="10" strokeDasharray={`${circumference - offset} ${offset}`} strokeDashoffset={circumference * 0.125} strokeLinecap="round" transform="rotate(180 100 120)" style={{ transition: 'stroke-dasharray 1s ease', filter: `drop-shadow(0 0 8px ${color})` }} />
      </svg>
      <div style={{ position: 'absolute', bottom: 16, left: 0, right: 0, textAlign: 'center' }}>
        <div style={{ fontFamily: 'var(--font-mono)', fontSize: 42, fontWeight: 600, color, lineHeight: 1 }}>{score}</div>
        <div style={{ fontSize: 11, color: 'var(--text-muted)', marginTop: 4 }}>overall risk</div>
      </div>
    </div>
  )
}

export default function Score({ scanResult, onNav }) {
  if (!scanResult?.score) {
    return (
      <div style={{ padding: '32px 40px', animation: 'fade-up 0.3s ease' }}>
        <div style={{ fontFamily: 'var(--font-mono)', fontSize: 11, color: 'var(--cyan)', letterSpacing: '0.15em', textTransform: 'uppercase', marginBottom: 8 }}>03 · Scoring engine</div>
        <h1 style={{ fontSize: 28, fontWeight: 600, color: 'var(--text-primary)', marginBottom: 24 }}>Risk score</h1>
        <div style={{ padding: '48px', textAlign: 'center', background: 'var(--bg-card)', border: '1px solid var(--border)', borderRadius: 'var(--radius-xl)' }}>
          <BarChart3 size={40} color="var(--text-muted)" style={{ marginBottom: 16 }} />
          <div style={{ fontSize: 15, color: 'var(--text-secondary)', marginBottom: 16 }}>Run a scan first to see scoring</div>
          <button onClick={() => onNav('ingest')} style={{ padding: '10px 24px', background: 'var(--cyan)', color: '#080C14', border: 'none', borderRadius: 8, fontWeight: 600, fontSize: 13, cursor: 'pointer', fontFamily: 'var(--font-ui)' }}>Go to Ingest →</button>
        </div>
      </div>
    )
  }

  const { score, findings } = scanResult
  const pieData = Object.entries(score.severity_counts || {}).map(([name, value]) => ({ name, value, color: SEV_COLORS[name] })).filter(d => d.value > 0)
  const moduleData = Object.entries(score.breakdown || {}).map(([name, v]) => ({ name, count: v.findings_count, fill: CHECK_COLORS[name] || 'var(--cyan)' }))

  return (
    <div style={{ padding: '32px 40px', overflow: 'auto', animation: 'fade-up 0.3s ease' }}>
      <div style={{ fontFamily: 'var(--font-mono)', fontSize: 11, color: 'var(--cyan)', letterSpacing: '0.15em', textTransform: 'uppercase', marginBottom: 8 }}>03 · Scoring engine</div>
      <h1 style={{ fontSize: 28, fontWeight: 600, color: 'var(--text-primary)', marginBottom: 16 }}>Risk score</h1>

      {/* Self-explaining grade */}
      {score.explanation && (
        <div style={{ display: 'flex', gap: 10, padding: '14px 16px', marginBottom: 16, background: 'var(--bg-card)', border: '1px solid var(--border)', borderRadius: 'var(--radius-lg)' }}>
          <BarChart3 size={15} color="var(--cyan)" style={{ flexShrink: 0, marginTop: 2 }} />
          <div>
            <div style={{ fontSize: 10, color: 'var(--text-muted)', letterSpacing: '0.12em', textTransform: 'uppercase', marginBottom: 4 }}>Why this grade</div>
            <p style={{ fontSize: 13, color: 'var(--text-secondary)', lineHeight: 1.6, margin: 0 }}>{score.explanation}</p>
          </div>
        </div>
      )}

      {/* Attack paths — the standout signal: findings that chain into a breach */}
      {score.attack_paths?.length > 0 && (
        <div style={{ marginBottom: 16, background: 'var(--coral-dim, rgba(255,77,109,0.08))', border: '1px solid rgba(255,77,109,0.28)', borderRadius: 'var(--radius-lg)', padding: '16px 18px' }}>
          <div style={{ marginBottom: 4 }}>
            <span style={{ fontSize: 12, fontWeight: 600, color: 'var(--coral)' }}>⚠ {score.attack_paths.length} attack path{score.attack_paths.length > 1 ? 's' : ''} detected</span>
          </div>
          <div style={{ fontSize: 11, color: 'var(--text-muted)', marginBottom: 12, lineHeight: 1.5 }}>
            Separate findings that combine into a possible breach route — more dangerous together than on their own.
          </div>
          <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
            {score.attack_paths.map((p, i) => (
              <div key={i} style={{ display: 'flex', gap: 10, alignItems: 'flex-start' }}>
                <span style={{ fontFamily: 'var(--font-mono)', fontSize: 12, color: 'var(--coral)', minWidth: 16, marginTop: 1 }}>{i + 1}</span>
                <div>
                  <div style={{ display: 'flex', alignItems: 'center', gap: 8, flexWrap: 'wrap' }}>
                    <span style={{ fontSize: 13, color: 'var(--text-primary)', fontWeight: 600 }}>{p.name}</span>
                    {p.namespace && <span style={{ fontFamily: 'var(--font-mono)', fontSize: 10, color: 'var(--text-muted)', background: 'var(--bg-elevated)', border: '1px solid var(--border)', borderRadius: 4, padding: '1px 6px' }}>scope: {p.namespace}</span>}
                  </div>
                  {p.why && <div style={{ fontSize: 12, color: 'var(--text-secondary)', lineHeight: 1.6, marginTop: 4 }}>{p.why}</div>}
                </div>
              </div>
            ))}
          </div>
        </div>
      )}

      <div style={{ display: 'grid', gridTemplateColumns: '240px 1fr', gap: 20, marginBottom: 20 }}>
        <div style={{ background: 'var(--bg-card)', border: '1px solid var(--border)', borderRadius: 'var(--radius-xl)', padding: '24px 16px', display: 'flex', flexDirection: 'column', alignItems: 'center' }}>
          <ScoreGauge score={score.risk_score} />
          <div style={{ marginTop: 12, textAlign: 'center' }}>
            <span style={{ fontSize: 13, fontWeight: 600, color: 'var(--text-primary)', fontFamily: 'var(--font-mono)', marginRight: 8 }}>Grade: {score.grade}</span>
            <span style={{ fontSize: 12, color: 'var(--text-secondary)' }}>{score.risk_level}</span>
          </div>
          {/* Grade legend — highlights the band the current score falls in */}
          <div style={{ width: '100%', marginTop: 16, paddingTop: 12, borderTop: '1px solid var(--border)', display: 'flex', flexDirection: 'column', gap: 3 }}>
            <div style={{ fontSize: 9, color: 'var(--text-muted)', letterSpacing: '0.1em', textTransform: 'uppercase', marginBottom: 4 }}>Score → grade</div>
            {GRADE_BANDS.map(b => {
              const active = b.g === score.grade
              return (
                <div key={b.g} style={{ display: 'flex', alignItems: 'center', gap: 6, padding: '1px 4px', borderRadius: 4, background: active ? `${b.color}22` : 'transparent' }}>
                  <span style={{ width: 7, height: 7, borderRadius: 2, background: b.color, flexShrink: 0 }} />
                  <span style={{ fontFamily: 'var(--font-mono)', fontSize: 10, fontWeight: active ? 700 : 500, color: active ? b.color : 'var(--text-secondary)', minWidth: 16 }}>{b.g}</span>
                  <span style={{ fontFamily: 'var(--font-mono)', fontSize: 10, color: 'var(--text-muted)', minWidth: 46 }}>{b.range}</span>
                  <span style={{ fontSize: 10, color: active ? 'var(--text-primary)' : 'var(--text-muted)' }}>{b.label}</span>
                </div>
              )
            })}
          </div>
        </div>
        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12 }}>
          {[
            { label: 'Total findings',           value: score.total_findings,                    color: 'var(--text-primary)', hint: 'every violation' },
            { label: 'Distinct issues',          value: score.distinct_issues ?? '—',            color: 'var(--cyan)',         hint: 'unique problem types' },
            { label: 'Resources affected',       value: score.resources_affected ?? '—',         color: 'var(--amber)',        hint: 'distinct objects flagged' },
            { label: 'Security modules affected', value: (score.checks_evaluated || []).length,  color: 'var(--text-primary)', hint: 'modules that fired' },
          ].map(({ label, value, color, hint }) => (
            <div key={label} style={{ background: 'var(--bg-card)', border: '1px solid var(--border)', borderRadius: 'var(--radius-lg)', padding: '20px' }}>
              <div style={{ fontSize: 10, color: 'var(--text-muted)', letterSpacing: '0.12em', textTransform: 'uppercase', marginBottom: 8 }}>{label}</div>
              <div style={{ fontFamily: 'var(--font-mono)', fontSize: 28, fontWeight: 600, color, lineHeight: 1 }}>{value}</div>
              {hint && <div style={{ fontSize: 9, color: 'var(--text-muted)', marginTop: 8, letterSpacing: '0.02em' }}>{hint}</div>}
            </div>
          ))}
        </div>
      </div>

      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 20 }}>
        <div style={{ background: 'var(--bg-card)', border: '1px solid var(--border)', borderRadius: 'var(--radius-xl)', padding: '24px' }}>
          <div style={{ fontSize: 12, fontWeight: 500, color: 'var(--text-secondary)', marginBottom: 16 }}>Severity breakdown</div>
          <ResponsiveContainer width="100%" height={180}>
            <PieChart>
              <Pie data={pieData} innerRadius={50} outerRadius={75} paddingAngle={3} dataKey="value">
                {pieData.map((entry, i) => <Cell key={i} fill={entry.color} stroke="transparent" />)}
              </Pie>
              <Tooltip content={<CustomTooltip />} />
            </PieChart>
          </ResponsiveContainer>
          <div style={{ display: 'flex', flexWrap: 'wrap', gap: 8, marginTop: 8 }}>
            {pieData.map(d => (
              <div key={d.name} style={{ display: 'flex', alignItems: 'center', gap: 5 }}>
                <div style={{ width: 8, height: 8, borderRadius: 2, background: d.color }} />
                <span style={{ fontSize: 11, color: 'var(--text-muted)' }}>{d.name} ({d.value})</span>
              </div>
            ))}
          </div>
        </div>

        <div style={{ background: 'var(--bg-card)', border: '1px solid var(--border)', borderRadius: 'var(--radius-xl)', padding: '24px' }}>
          <div style={{ fontSize: 12, fontWeight: 500, color: 'var(--text-secondary)', marginBottom: 16 }}>Findings by module</div>
          <ResponsiveContainer width="100%" height={180}>
            <BarChart data={moduleData} layout="vertical" barCategoryGap="30%">
              <XAxis type="number" tick={{ fontSize: 10, fill: 'var(--text-muted)' }} axisLine={false} tickLine={false} />
              <YAxis type="category" dataKey="name" tick={{ fontSize: 11, fill: 'var(--text-secondary)' }} axisLine={false} tickLine={false} width={90} />
              <Tooltip content={<CustomTooltip />} />
              <Bar dataKey="count" radius={[0, 4, 4, 0]}>
                {moduleData.map((entry, i) => <Cell key={i} fill={entry.fill} />)}
              </Bar>
            </BarChart>
          </ResponsiveContainer>
        </div>
      </div>

      {/* Top priorities */}
      {score.top_priorities?.length > 0 && (
        <div style={{ marginTop: 20, background: 'var(--bg-card)', border: '1px solid var(--border)', borderRadius: 'var(--radius-xl)', padding: '24px' }}>
          <div style={{ fontSize: 12, fontWeight: 500, color: 'var(--text-secondary)', marginBottom: 16 }}>Top priorities to fix</div>
          {score.top_priorities.map((p, i) => (
            <div key={i} style={{ display: 'flex', alignItems: 'center', gap: 12, padding: '10px 0', borderBottom: i < score.top_priorities.length - 1 ? '1px solid var(--border)' : 'none' }}>
              <span style={{ fontFamily: 'var(--font-mono)', fontSize: 11, color: 'var(--text-muted)', minWidth: 20 }}>#{p.rank}</span>
              <div style={{ flex: 1 }}>
                <div style={{ fontSize: 13, color: 'var(--text-primary)' }}>{p.Issue}</div>
                <div style={{ fontSize: 11, color: 'var(--text-muted)' }}>{p.resource} · Fix effort: {p.effort}</div>
              </div>
              <span style={{ fontSize: 11, color: SEV_COLORS[p.Severity] || 'var(--text-muted)', fontFamily: 'var(--font-mono)' }}>{p.Severity}</span>
            </div>
          ))}
        </div>
      )}
    </div>
  )
}
