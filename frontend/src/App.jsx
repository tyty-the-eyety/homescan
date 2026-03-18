import { useState, useCallback, useRef, useEffect } from 'react'
import { T } from './theme'
import DeviceList from './components/DeviceList'
import History from './components/History'
import Settings from './components/Settings'
import Topology from './components/Topology'
import ToastContainer, { toast } from './components/Toast'
import useSSE from './useSSE'
import { fetchPublicIp } from './api'

const TABS = [
  { id: 'devices',  label: 'Devices'  },
  { id: 'topology', label: 'Topology' },
  { id: 'history',  label: 'History'  },
  { id: 'settings', label: 'Settings' },
]

export default function App() {
  const [tab, setTab] = useState('devices')
  // SSE-driven state: bump a counter so children know to re-fetch
  const [sseRevision, setSseRevision] = useState(0)
  const [scanning, setScanning] = useState(false)
  const [publicIp, setPublicIp] = useState(null)
  const sseDataRef = useRef(null)

  useEffect(() => {
    fetchPublicIp().then(d => { if (d?.ip) setPublicIp(d.ip) })
  }, [])

  const handleSSE = useCallback((event, data) => {
    if (event === 'scan_start') {
      setScanning(true)
    }
    if (event === 'scan_complete') {
      setScanning(false)
      sseDataRef.current = data
      setSseRevision(r => r + 1)
      const { result } = data
      if (result.new > 0) {
        toast(`Scan complete: ${result.new} new device${result.new > 1 ? 's' : ''} found`, 'success')
      } else {
        toast(`Scan complete: ${result.scanned} devices`, 'info')
      }
    }
    if (event === 'probe_complete') {
      setSseRevision(r => r + 1)
      toast(`Probe complete for ${data.device?.nickname || data.device?.ip_address || data.mac}`, 'success')
    }
    if (event === 'public_ip_changed') {
      setPublicIp(data.new_ip)
      toast(`Public IP changed: ${data.new_ip}`, 'warning')
    }
  }, [])

  useSSE(handleSSE)

  return (
    <div style={{ minHeight: '100vh', background: T.bg, color: T.text, fontFamily: 'system-ui, -apple-system, sans-serif' }}>

      {/* Header */}
      <div style={{ background: T.surface, borderBottom: `1px solid ${T.border}`, padding: '0 2rem' }}>
        <div style={{ maxWidth: 1400, margin: '0 auto', display: 'flex', alignItems: 'center', gap: '2rem', height: 56 }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: '0.6rem' }}>
            <span style={{ fontSize: '1.2rem' }}>📡</span>
            <span style={{ fontWeight: 700, fontSize: '1.1rem', color: T.text }}>HomeScan</span>
            <span style={{ color: T.textDim, fontSize: '0.85rem', marginLeft: 4 }}>Network Monitor</span>
          </div>

          {/* Tab nav */}
          <nav style={{ display: 'flex', gap: '0.25rem', marginLeft: '1rem' }}>
            {TABS.map(t => (
              <button
                key={t.id}
                onClick={() => setTab(t.id)}
                style={{
                  padding: '6px 16px',
                  borderRadius: 6,
                  border: 'none',
                  cursor: 'pointer',
                  fontSize: '0.875rem',
                  fontWeight: 500,
                  background: tab === t.id ? T.accentDim : 'transparent',
                  color: tab === t.id ? T.accent : T.textMid,
                  transition: 'all 0.15s',
                }}
              >
                {t.label}
              </button>
            ))}
          </nav>

          {/* Public IP badge */}
          {publicIp && (
            <div style={{ marginLeft: 'auto', display: 'flex', alignItems: 'center', gap: '0.4rem' }}>
              <span style={{ fontSize: '0.75rem', color: T.textDim }}>Public IP</span>
              <span style={{ fontSize: '0.82rem', fontFamily: 'monospace', color: T.textMid, background: T.surface2, border: `1px solid ${T.border}`, borderRadius: 4, padding: '2px 8px' }}>{publicIp}</span>
            </div>
          )}

          {/* Scanning indicator */}
          {scanning && (
            <div style={{ marginLeft: publicIp ? '0' : 'auto', display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
              <span style={{
                width: 8, height: 8, borderRadius: '50%', background: T.accent,
                animation: 'pulse 1s ease-in-out infinite',
              }} />
              <span style={{ color: T.accent, fontSize: '0.82rem', fontWeight: 500 }}>Scanning...</span>
            </div>
          )}
        </div>
      </div>

      {/* Page content */}
      <div style={{ maxWidth: 1400, margin: '0 auto', padding: '2rem' }}>
        {tab === 'devices'  && <DeviceList sseRevision={sseRevision} sseDataRef={sseDataRef} scanning={scanning} />}
        {tab === 'topology' && <Topology sseRevision={sseRevision} />}
        {tab === 'history'  && <History />}
        {tab === 'settings' && <Settings />}
      </div>

      <ToastContainer />

      {/* Global CSS animations */}
      <style>{`
        @keyframes pulse {
          0%, 100% { opacity: 1; }
          50% { opacity: 0.3; }
        }
        @keyframes toast-in {
          from { opacity: 0; transform: translateY(10px); }
          to { opacity: 1; transform: translateY(0); }
        }
      `}</style>
    </div>
  )
}
