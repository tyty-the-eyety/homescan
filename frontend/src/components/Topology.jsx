// Phase 4: Network topology — SVG radial map
import { useState, useEffect, useCallback } from 'react'
import { fetchTopology } from '../api'
import { T } from '../theme'

const GATEWAY_R = 28
const DEVICE_R = 18
const INTERNET_R = 22
const CANVAS_W = 900
const CANVAS_H = 650
const CX = CANVAS_W / 2
const CY = CANVAS_H / 2
const ORBIT_R = 230

function typeIcon(device, gatewayIp) {
  if (device.ip_address === gatewayIp) return '⬡'
  const t = (device.device_type || '').toLowerCase()
  const v = (device.vendor || '').toLowerCase()
  if (t.includes('router') || t.includes('gateway') || t.includes('network')) return '⬡'
  if (t.includes('printer')) return '⬛'
  if (t.includes('camera')) return '◉'
  if (t.includes('media') || t.includes('plex') || t.includes('kodi')) return '▶'
  if (t.includes('nas') || t.includes('server')) return '▣'
  if (t.includes('iot') || t.includes('smart')) return '⬤'
  if (t.includes('apple') || v.includes('apple')) return '◍'
  if (t.includes('windows') || t.includes('pc') || t.includes('laptop')) return '□'
  if (t.includes('mobile') || t.includes('android') || t.includes('phone')) return '▢'
  return '●'
}

function statusColor(device) {
  return device.last_status === 'online' ? T.green : T.textDim
}

function displayName(device) {
  return device.nickname || device.hostname || device.ip_address || device.mac_address
}

// Group devices by type for layout
function layoutDevices(devices, gatewayIp) {
  const non_gateway = devices.filter(d => d.ip_address !== gatewayIp)
  const count = non_gateway.length
  return non_gateway.map((d, i) => {
    const angle = (2 * Math.PI * i) / Math.max(count, 1) - Math.PI / 2
    return {
      device: d,
      x: CX + ORBIT_R * Math.cos(angle),
      y: CY + ORBIT_R * Math.sin(angle),
    }
  })
}

export default function Topology({ sseRevision }) {
  const [data, setData] = useState(null)
  const [selected, setSelected] = useState(null)

  const load = useCallback(() => {
    fetchTopology().then(setData)
  }, [])

  useEffect(() => { load() }, [load])
  useEffect(() => { if (sseRevision > 0) load() }, [sseRevision, load])

  if (!data) {
    return <div style={{ color: T.textDim, padding: '2rem' }}>Loading topology…</div>
  }

  const { gateway_ip, devices } = data
  const gateway = devices.find(d => d.ip_address === gateway_ip)
  const positioned = layoutDevices(devices, gateway_ip)
  const selectedDevice = selected ? devices.find(d => d.mac_address === selected) : null

  return (
    <div style={{ display: 'flex', gap: '1.5rem', flexWrap: 'wrap', alignItems: 'flex-start' }}>

      {/* SVG canvas */}
      <div style={{ background: T.surface, border: `1px solid ${T.border}`, borderRadius: 12, overflow: 'hidden', flex: '1 1 500px' }}>
        <svg width={CANVAS_W} height={CANVAS_H} viewBox={`0 0 ${CANVAS_W} ${CANVAS_H}`} style={{ maxWidth: '100%', height: 'auto', display: 'block' }}>
          <defs>
            <radialGradient id="bgGrad" cx="50%" cy="50%" r="50%">
              <stop offset="0%" stopColor={T.surface2} />
              <stop offset="100%" stopColor={T.bg} />
            </radialGradient>
          </defs>
          <rect width={CANVAS_W} height={CANVAS_H} fill="url(#bgGrad)" />

          {/* Orbit ring */}
          <circle cx={CX} cy={CY} r={ORBIT_R} fill="none" stroke={T.border} strokeWidth={1} strokeDasharray="4 6" opacity={0.5} />

          {/* Internet cloud above gateway */}
          <line x1={CX} y1={CY - GATEWAY_R} x2={CX} y2={CY - GATEWAY_R - 60} stroke={T.border2} strokeWidth={1.5} strokeDasharray="4 4" />
          <circle cx={CX} cy={CY - GATEWAY_R - 80} r={INTERNET_R} fill={T.surface} stroke={T.border2} strokeWidth={1.5} />
          <text x={CX} y={CY - GATEWAY_R - 80} textAnchor="middle" dominantBaseline="central" fontSize={14} fill={T.textDim}>☁</text>
          <text x={CX} y={CY - GATEWAY_R - 80 + INTERNET_R + 12} textAnchor="middle" fontSize={10} fill={T.textDim}>Internet</text>

          {/* Spoke lines from gateway to each device */}
          {positioned.map(({ device, x, y }) => (
            <line
              key={device.mac_address + '-line'}
              x1={CX} y1={CY} x2={x} y2={y}
              stroke={device.last_status === 'online' ? T.border2 : T.border}
              strokeWidth={device.last_status === 'online' ? 1.5 : 1}
              opacity={0.6}
            />
          ))}

          {/* Gateway node */}
          <g
            onClick={() => setSelected(gateway?.mac_address === selected ? null : gateway?.mac_address)}
            style={{ cursor: 'pointer' }}
          >
            <circle cx={CX} cy={CY} r={GATEWAY_R + 4} fill={T.accentDim} opacity={0.4} />
            <circle cx={CX} cy={CY} r={GATEWAY_R}
              fill={gateway?.mac_address === selected ? T.accentDim : T.surface}
              stroke={T.accent}
              strokeWidth={2}
            />
            <text x={CX} y={CY} textAnchor="middle" dominantBaseline="central" fontSize={16} fill={T.accent}>⬡</text>
            <text x={CX} y={CY + GATEWAY_R + 14} textAnchor="middle" fontSize={11} fontWeight={600} fill={T.accent}>
              {gateway ? displayName(gateway) : 'Gateway'}
            </text>
            {gateway_ip && (
              <text x={CX} y={CY + GATEWAY_R + 26} textAnchor="middle" fontSize={10} fill={T.textDim} fontFamily="monospace">
                {gateway_ip}
              </text>
            )}
          </g>

          {/* Device nodes */}
          {positioned.map(({ device, x, y }) => {
            const isSel = device.mac_address === selected
            const color = isSel ? T.accent : statusColor(device)
            return (
              <g key={device.mac_address} onClick={() => setSelected(isSel ? null : device.mac_address)} style={{ cursor: 'pointer' }}>
                {isSel && <circle cx={x} cy={y} r={DEVICE_R + 5} fill={T.accentDim} opacity={0.5} />}
                <circle cx={x} cy={y} r={DEVICE_R}
                  fill={isSel ? T.accentDim : T.surface}
                  stroke={color}
                  strokeWidth={isSel ? 2 : 1.5}
                />
                <text x={x} y={y} textAnchor="middle" dominantBaseline="central" fontSize={12} fill={color}>
                  {typeIcon(device, gateway_ip)}
                </text>
                <text x={x} y={y + DEVICE_R + 12} textAnchor="middle" fontSize={10} fill={T.textMid} style={{ pointerEvents: 'none' }}>
                  {displayName(device).slice(0, 16)}
                </text>
              </g>
            )
          })}
        </svg>
      </div>

      {/* Info panel */}
      <div style={{ minWidth: 240, maxWidth: 300, flex: '0 0 auto' }}>
        {/* Stats */}
        <div style={{ background: T.surface, border: `1px solid ${T.border}`, borderRadius: 10, padding: '1rem', marginBottom: '1rem' }}>
          <div style={{ fontSize: '0.75rem', fontWeight: 600, textTransform: 'uppercase', letterSpacing: '0.08em', color: T.textDim, marginBottom: '0.75rem' }}>
            Network
          </div>
          {[
            ['Total Devices', devices.length],
            ['Online', devices.filter(d => d.last_status === 'online').length],
            ['Offline', devices.filter(d => d.last_status !== 'online').length],
            ['Gateway', gateway_ip || '—'],
          ].map(([label, val]) => (
            <div key={label} style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 6, fontSize: '0.875rem' }}>
              <span style={{ color: T.textMid }}>{label}</span>
              <span style={{ color: T.text, fontWeight: 600, fontFamily: typeof val === 'string' && val.includes('.') ? 'monospace' : 'inherit' }}>{val}</span>
            </div>
          ))}
        </div>

        {/* Legend */}
        <div style={{ background: T.surface, border: `1px solid ${T.border}`, borderRadius: 10, padding: '1rem', marginBottom: '1rem' }}>
          <div style={{ fontSize: '0.75rem', fontWeight: 600, textTransform: 'uppercase', letterSpacing: '0.08em', color: T.textDim, marginBottom: '0.75rem' }}>
            Legend
          </div>
          {[
            ['⬡', 'Router / Gateway'],
            ['▣', 'NAS / Server'],
            ['◉', 'IP Camera'],
            ['▶', 'Media Server'],
            ['⬤', 'Smart Home / IoT'],
            ['□', 'PC / Laptop'],
            ['▢', 'Mobile Device'],
            ['⬛', 'Printer'],
            ['●', 'Unknown'],
          ].map(([icon, label]) => (
            <div key={label} style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', marginBottom: 4, fontSize: '0.8rem', color: T.textMid }}>
              <span style={{ fontSize: '0.9rem', minWidth: 20 }}>{icon}</span> {label}
            </div>
          ))}
          <div style={{ marginTop: 8, display: 'flex', gap: '1rem', fontSize: '0.78rem' }}>
            <span><span style={{ color: T.green }}>●</span> Online</span>
            <span><span style={{ color: T.textDim }}>●</span> Offline</span>
          </div>
        </div>

        {/* Selected device card */}
        {selectedDevice && (
          <div style={{ background: T.surface, border: `1px solid ${T.accent}44`, borderRadius: 10, padding: '1rem' }}>
            <div style={{ fontSize: '0.75rem', fontWeight: 600, textTransform: 'uppercase', letterSpacing: '0.08em', color: T.accent, marginBottom: '0.75rem' }}>
              Selected Device
            </div>
            {[
              ['Name',    displayName(selectedDevice)],
              ['IP',      selectedDevice.ip_address],
              ['MAC',     selectedDevice.mac_address],
              ['Type',    selectedDevice.device_type || '—'],
              ['Vendor',  selectedDevice.vendor || '—'],
              ['Group',   selectedDevice.group_name || '—'],
              ['Status',  selectedDevice.last_status],
              ['HTTP',    selectedDevice.http_title || '—'],
              ['mDNS',    selectedDevice.mdns_name || '—'],
            ].map(([label, val]) => val && val !== '—' ? (
              <div key={label} style={{ marginBottom: 6 }}>
                <div style={{ fontSize: '0.68rem', fontWeight: 600, textTransform: 'uppercase', color: T.textDim, letterSpacing: '0.06em' }}>{label}</div>
                <div style={{ fontSize: '0.85rem', color: T.text, fontFamily: ['IP', 'MAC'].includes(label) ? 'monospace' : 'inherit' }}>{val}</div>
              </div>
            ) : null)}
          </div>
        )}
      </div>
    </div>
  )
}
