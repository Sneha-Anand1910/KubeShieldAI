import React from 'react'
import { RadialBarChart, RadialBar, PieChart, Pie, Cell, BarChart, Bar, XAxis, YAxis, Tooltip, ResponsiveContainer, LineChart, Line } from 'recharts'
import { mockFindings, severityColors, moduleColors } from '../utils/mockData'
import { mockScanHistory } from '../utils/mockData'

const overallScore = 74

const severityCounts = mockFindings.reduce((acc, f) => {
  acc[f.severity] = (acc[f.severity] || 0) + 1
  return acc
}, {})

const pieData = Object.entries(severityCounts).map(([name, value]) => ({ name, value, color: severityColors[name] }))

const moduleData = Object.entries(
  mockFindings.reduce((acc, f) => { acc[f.module] = (acc[f.module] || 0) + 1; return acc }, {})
).map(([name, count]) => ({ name, count, fill: moduleColors[name] }))

const trendData = [...mockScanHistory].reverse().map(s => ({
  date: new Date(s.timestamp).toLocaleDateString('en', { month: 'short', day: 'numeric' }),
  score: s.score,
}))

const ScoreGauge = ({ score }) => {
  const color = score > 70 ? '#FF4D6D' : score > 40 ? '#F59E0B' : '#10B981'
  const circumference = 2 * Math.PI * 70
  const offset = circumference - (score / 100) * circumference * 0.75

  return (
    <div style={{ position: 'relative', width: 200, height: 160, margin: '0 auto' }}>
      <svg width="200" height="160" viewBox="0 0 200 160">
        <circle cx="100" cy="120" r="70" fill="none" stroke="var(--bg-hover)" strokeWidth="10"
          strokeDasharray={`${circumference * 0.75} ${circumference * 0.25}`}
          strokeDashoffset={circumference * 0.125}
          strokeLinecap="round" transform="rotate(180 100 120)" />
        <circle cx="100" cy="120" r="70" fill="none" stroke={color} strokeWidth="10"
          strokeDasharray={`${circumference - offset} ${offset}`}
          strokeDashoffset={circumference * 0.125}
          strokeLinecap="round" transform="rotate(180 100 120)"
          style={{ transition: 'stroke-dasharray 1s ease', filter: `drop-shadow(0 0 8px ${color})` }} />
      </svg>
      <div style={{ position: 'absolute', bottom: 16, left: 0, right: 0, textAlign: 'center' }}>
        <div style={{ fontFamily: 'var(--font-mono)', fontSize: 42, fontWeight: 600, color, lineHeight: 1 }}>{score}</div>
        <div style={{ fontSize: 11, color: 'var(--text-muted)', marginTop: 4 }}>overall risk</div>
      </div>
    </div>
  )
}

const CustomTooltip = ({ active, payload, label }) => {
  if (!active || !payload?.length) return null
  return (
    <div style={{ background: 'var(--bg-card)', border: '1px solid var(--border)', borderRadius: 8, padding: '10px 14px' }}>
      <div style={{ fontSize: 11, color: 'var(--text-muted)', marginBottom: 4 }}>{label}</div>
      {payload.map((p, i) => (
        <div key={i} style={{ fontFamily: 'var(--font-mono)', fontSize: 13, color: p.color || 'var(--cyan)' }}>
          {p.name}: {p.value}
        </div>
      ))}
    </div>
  )
}

const StatCard = ({ label, value, sub, color }) => (
  <div style={{ background: 'var(--bg-card)', border: '1px solid var(--border)', borderRadius: 'var(--radius-lg)', padding: '20px' }}>
    <div style={{ fontSize: 10, color: 'var(--text-muted)', letterSpacing: '0.12em', textTransform: 'uppercase', marginBottom: 8 }}>{label}</div>
    <div style={{ fontFamily: 'var(--font-mono)', fontSize: 28, fontWeight: 600, color: color || 'var(--text-primary)', lineHeight: 1 }}>{value}</div>
    {sub && <div style={{ fontSize: 11, color: 'var(--text-muted)', marginTop: 6 }}>{sub}</div>}
  </div>
)

export default function Score() {
  return (
    <div style={{ padding: '32px 40px', overflow: 'auto', animation: 'fade-up 0.3s ease' }}>
      <div style={{ fontFamily: 'var(--font-mono)', fontSize: 11, color: 'var(--cyan)', letterSpacing: '0.15em', textTransform: 'uppercase', marginBottom: 8 }}>
        03 · Scoring engine
      </div>
      <h1 style={{ fontSize: 28, fontWeight: 600, color: 'var(--text-primary)', marginBottom: 24 }}>Risk score</h1>

      {/* Top row: gauge + stats */}
      <div style={{ display: 'grid', gridTemplateColumns: '240px 1fr', gap: 20, marginBottom: 20 }}>
        <div style={{ background: 'var(--bg-card)', border: '1px solid var(--border)', borderRadius: 'var(--radius-xl)', padding: '24px 16px', display: 'flex', flexDirection: 'column', alignItems: 'center' }}>
          <ScoreGauge score={overallScore} />
          <div style={{ marginTop: 12, textAlign: 'center' }}>
            <span style={{ fontSize: 12, color: 'var(--coral)', background: 'var(--coral-dim)', padding: '3px 10px', borderRadius: 99, border: '1px solid rgba(255,77,109,0.3)' }}>
              High risk
            </span>
          </div>
        </div>

        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12 }}>
          <StatCard label="Total findings"    value={mockFindings.length}  sub="across all modules"             color="var(--text-primary)" />
          <StatCard label="Critical + high"   value="5"  sub="require immediate action"        color="var(--coral)" />
          <StatCard label="Resources scanned" value="48" sub="pods, deployments, services…"    color="var(--text-primary)" />
          <StatCard label="Namespaces"        value="4"  sub="dev-sim, prod-sim, kubeshield…"  color="var(--text-primary)" />
        </div>
      </div>

      {/* Charts row */}
      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr', gap: 20 }}>
        {/* Severity donut */}
        <div style={{ background: 'var(--bg-card)', border: '1px solid var(--border)', borderRadius: 'var(--radius-xl)', padding: '24px' }}>
          <div style={{ fontSize: 12, fontWeight: 500, color: 'var(--text-secondary)', marginBottom: 16 }}>Severity breakdown</div>
          <ResponsiveContainer width="100%" height={180}>
            <PieChart>
              <Pie data={pieData} innerRadius={50} outerRadius={75} paddingAngle={3} dataKey="value">
                {pieData.map((entry, i) => (
                  <Cell key={i} fill={entry.color} stroke="transparent" />
                ))}
              </Pie>
              <Tooltip content={<CustomTooltip />} />
            </PieChart>
          </ResponsiveContainer>
          <div style={{ display: 'flex', flexWrap: 'wrap', gap: 8, marginTop: 8 }}>
            {pieData.map(d => (
              <div key={d.name} style={{ display: 'flex', alignItems: 'center', gap: 5 }}>
                <div style={{ width: 8, height: 8, borderRadius: 2, background: d.color }} />
                <span style={{ fontSize: 11, color: 'var(--text-muted)', textTransform: 'capitalize' }}>{d.name} ({d.value})</span>
              </div>
            ))}
          </div>
        </div>

        {/* Module bar */}
        <div style={{ background: 'var(--bg-card)', border: '1px solid var(--border)', borderRadius: 'var(--radius-xl)', padding: '24px' }}>
          <div style={{ fontSize: 12, fontWeight: 500, color: 'var(--text-secondary)', marginBottom: 16 }}>Findings by module</div>
          <ResponsiveContainer width="100%" height={180}>
            <BarChart data={moduleData} layout="vertical" barCategoryGap="30%">
              <XAxis type="number" tick={{ fontSize: 10, fill: 'var(--text-muted)' }} axisLine={false} tickLine={false} />
              <YAxis type="category" dataKey="name" tick={{ fontSize: 11, fill: 'var(--text-secondary)' }} axisLine={false} tickLine={false} width={55} />
              <Tooltip content={<CustomTooltip />} />
              <Bar dataKey="count" radius={[0, 4, 4, 0]}>
                {moduleData.map((entry, i) => (
                  <Cell key={i} fill={entry.fill} />
                ))}
              </Bar>
            </BarChart>
          </ResponsiveContainer>
        </div>

        {/* Score trend */}
        <div style={{ background: 'var(--bg-card)', border: '1px solid var(--border)', borderRadius: 'var(--radius-xl)', padding: '24px' }}>
          <div style={{ fontSize: 12, fontWeight: 500, color: 'var(--text-secondary)', marginBottom: 16 }}>Risk score trend</div>
          <ResponsiveContainer width="100%" height={180}>
            <LineChart data={trendData}>
              <XAxis dataKey="date" tick={{ fontSize: 10, fill: 'var(--text-muted)' }} axisLine={false} tickLine={false} />
              <YAxis domain={[0, 100]} tick={{ fontSize: 10, fill: 'var(--text-muted)' }} axisLine={false} tickLine={false} width={28} />
              <Tooltip content={<CustomTooltip />} />
              <Line type="monotone" dataKey="score" stroke="var(--cyan)" strokeWidth={2} dot={{ fill: 'var(--cyan)', r: 3, strokeWidth: 0 }} name="score" />
            </LineChart>
          </ResponsiveContainer>
        </div>
      </div>
    </div>
  )
}
