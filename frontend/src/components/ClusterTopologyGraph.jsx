import React from 'react'

const NS_COLORS = ['#FF4D6D', '#10B981', '#00D4FF', '#F59E0B', '#A78BFA', '#38BDF8']

// Groups raw k8s Pod resources (as returned by /scan/live or /scan/yaml)
// into { namespace, podCount, samplePods } — this is what makes the graph dynamic.
export function computeTopology(resources = []) {
  const nsMap = {}
  resources.forEach(r => {
    if (r?.kind !== 'Pod') return
    const ns = r.metadata?.namespace || 'default'
    const name = r.metadata?.name || 'unnamed-pod'
    if (!nsMap[ns]) nsMap[ns] = []
    nsMap[ns].push(name)
  })
  return Object.entries(nsMap).map(([name, pods], i) => ({
    name,
    podCount: pods.length,
    samplePods: pods.slice(0, 3),
    color: NS_COLORS[i % NS_COLORS.length],
  }))
}

export default function ClusterTopologyGraph({ resources }) {
  const namespaces = computeTopology(resources)

  if (namespaces.length === 0) {
    return (
      <div style={{ padding: 24, fontFamily: 'var(--font-mono)', fontSize: 12, color: 'var(--text-muted)', textAlign: 'center', border: '1px dashed var(--border-mid)' }}>
        No namespace data yet — run a scan to populate the topology map
      </div>
    )
  }

  return (
    <div style={{ overflowX: 'auto', padding: '20px 8px' }}>
      <div style={{ display: 'flex', justifyContent: 'center' }}>
        <div style={{ border: '2px solid var(--text-primary)', background: 'var(--bg-elevated)', padding: '8px 20px', fontFamily: 'var(--font-mono)', fontSize: 11, fontWeight: 700, color: 'var(--text-primary)' }}>
          API_SERVER
        </div>
      </div>
      <div style={{ display: 'flex', justifyContent: 'center' }}>
        <div style={{ width: 1, height: 20, background: 'var(--border-strong)' }} />
      </div>

      <div style={{ display: 'flex', justifyContent: 'center', minWidth: namespaces.length * 170 }}>
        {namespaces.map((ns, i) => (
          <div key={ns.name} style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', flex: 1, minWidth: 160, position: 'relative' }}>
            <div style={{
              position: 'absolute', top: 0,
              left: i === 0 ? '50%' : 0,
              right: i === namespaces.length - 1 ? '50%' : 0,
              height: 1, background: namespaces.length > 1 ? 'var(--border-mid)' : 'transparent',
            }} />
            <div style={{ width: 1, height: 16, background: 'var(--border-mid)' }} />

            <div style={{
              border: `1px solid ${ns.color}`, borderLeft: `3px solid ${ns.color}`,
              background: 'var(--bg-card)', padding: '10px 16px', minWidth: 140, textAlign: 'center',
              animation: 'fade-up 0.3s ease',
            }}>
              <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 6, marginBottom: 2 }}>
                <div style={{ width: 6, height: 6, borderRadius: '50%', background: ns.color, animation: 'pulse-dot 2s ease-in-out infinite' }} />
                <span style={{ fontFamily: 'var(--font-mono)', fontSize: 12, fontWeight: 700, color: 'var(--text-primary)' }}>{ns.name}</span>
              </div>
              <div style={{ fontFamily: 'var(--font-mono)', fontSize: 22, fontWeight: 700, color: ns.color, lineHeight: 1.3 }}>{ns.podCount}</div>
              <div style={{ fontFamily: 'var(--font-mono)', fontSize: 9, color: 'var(--text-muted)', textTransform: 'uppercase', letterSpacing: '0.08em' }}>pods</div>
            </div>

            {ns.samplePods.length > 0 && (
              <>
                <div style={{ width: 1, height: 16, background: 'var(--border)' }} />
                <div style={{ display: 'flex', flexDirection: 'column', gap: 6, alignItems: 'center', width: '100%' }}>
                  {ns.samplePods.map(p => (
                    <div key={p} title={p} style={{
                      border: '1px dashed var(--border-mid)', padding: '4px 10px',
                      fontFamily: 'var(--font-mono)', fontSize: 9, color: 'var(--text-secondary)',
                      maxWidth: 150, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap',
                    }}>
                      {p}
                    </div>
                  ))}
                  {ns.podCount > ns.samplePods.length && (
                    <div style={{ fontFamily: 'var(--font-mono)', fontSize: 9, color: 'var(--text-muted)' }}>
                      +{ns.podCount - ns.samplePods.length} more
                    </div>
                  )}
                </div>
              </>
            )}
          </div>
        ))}
      </div>
    </div>
  )
}