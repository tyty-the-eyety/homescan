// INCREMENT 10: Device presence history — timeline chart per device

import { useEffect, useState, useMemo } from 'react'
import { AreaChart, Area, XAxis, YAxis, Tooltip, ResponsiveContainer, ReferenceLine } from 'recharts'
import { fetchDevices, fetchDeviceHistory, fetchDeviceUptime } from '../api'
import { T } from '../theme'

const DAYS_OPTIONS = [
  { label: '24h',  value: 1  },
  { label: '7d',   value: 7  },
  { label: '30d',  value: 30 },
]

function uptimeColor(pct) {
  if (pct >= 95) return T.green
  if (pct >= 80) return T.amber
  return T.red
}

function DeviceInfoCard({ device, uptimeData }) {
  let openPorts = []
  try { openPorts = device.open_ports ? JSON.parse(device.open_ports) : [] } catch {}

  const isOnline = device.last_status === 'online'

  const fields = [
    ['IP Address',   device.ip_address,   'monospace'],
    ['MAC',          device.mac_address,  'monospace'],
    ['Vendor',       device.vendor,       null],
    ['Device Type',  device.device_type,  null],
    ['OS Guess',     device.os_guess,     null],
    ['TTL Hint',     device.ttl_os_hint,  null],
    ['NetBIOS',      device.netbios_name, null],
    ['Hostname',     device.hostname && device.hostname !== '(Unknown)' ? device.hostname : null, null],
    ['Group',        device.group_name || null, null],
    ['Ping',         device.last_ping_ms != null ? `${device.last_ping_ms.toFixed(1)} ms` : null, null],
  ].filter(([, val]) => val)

  return (
    <div style={{ background: T.surface, border: `1px solid ${T.border}`, borderRadius: 10, padding: '1rem 1.25rem', marginBottom: '1.25rem', display: 'flex', gap: '2rem', flexWrap: 'wrap', alignItems: 'flex-start' }}>
      {/* Identity */}
      <div style={{ flex: 1, minWidth: 200 }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: '0.6rem', marginBottom: '0.75rem', flexWrap: 'wrap' }}>
          <span style={{ fontSize: '1.1rem', fontWeight: 700, color: T.text }}>
            {device.nickname || device.hostname || device.ip_address || device.mac_address}
          </span>
          <span style={{
            fontSize: '0.72rem', fontWeight: 600, padding: '2px 8px', borderRadius: 10,
            background: isOnline ? T.greenDim : T.redDim,
            color: isOnline ? T.green : T.red,
          }}>
            {isOnline ? '● Online' : '○ Offline'}
          </span>
          {device.is_known === 1 && (
            <span style={{ fontSize: '0.72rem', fontWeight: 600, padding: '2px 8px', borderRadius: 10, background: T.accentDim, color: T.accent }}>
              Known
            </span>
          )}
          {uptimeData && (
            <span style={{
              fontSize: '0.72rem', fontWeight: 600, padding: '2px 8px', borderRadius: 10,
              background: T.surface2,
              color: uptimeColor(uptimeData.uptime_pct),
            }}>
              {uptimeData.uptime_pct}% uptime
            </span>
          )}
        </div>
        <div style={{ display: 'flex', flexWrap: 'wrap', gap: '0.5rem 1.5rem' }}>
          {fields.map(([label, val, font]) => (
            <div key={label}>
              <div style={{ fontSize: '0.68rem', fontWeight: 600, textTransform: 'uppercase', letterSpacing: '0.07em', color: T.textDim }}>{label}</div>
              <div style={{ fontSize: '0.85rem', color: T.textMid, fontFamily: font || 'inherit' }}>{val}</div>
            </div>
          ))}
        </div>
      </div>

      {/* Open ports */}
      {openPorts.length > 0 && (
        <div style={{ minWidth: 220 }}>
          <div style={{ fontSize: '0.68rem', fontWeight: 600, textTransform: 'uppercase', letterSpacing: '0.07em', color: T.textDim, marginBottom: 6 }}>
            Open Ports ({openPorts.length})
          </div>
          <div style={{ display: 'flex', flexWrap: 'wrap', gap: '0.4rem' }}>
            {openPorts.map(p => (
              <span key={p.port} title={p.service || p.port} style={{
                padding: '2px 8px', borderRadius: 4, background: T.accentDim,
                color: T.accent, fontFamily: 'monospace', fontSize: '0.82rem',
              }}>
                {p.port}{p.service ? `/${p.service}` : ''}
              </span>
            ))}
          </div>
        </div>
      )}
    </div>
  )
}

function deviceLabel(d) {
  return d.nickname || d.hostname || d.ip_address || d.mac_address
}

function fmt(isoStr) {
  if (!isoStr) return ''
  const d = new Date(isoStr + 'Z')
  return d.toLocaleString(undefined, { month: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit' })
}

function fmtShort(isoStr, days) {
  if (!isoStr) return ''
  const d = new Date(isoStr + 'Z')
  if (days <= 1) return d.toLocaleTimeString(undefined, { hour: '2-digit', minute: '2-digit' })
  return d.toLocaleDateString(undefined, { month: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit' })
}

// Convert event log into recharts step-chart data
function buildChartData(events, days) {
  if (!events.length) return []

  const now = new Date()
  const windowStart = new Date(now - days * 86400 * 1000)

  // Prepend a synthetic point at window start with the earliest known status
  const firstStatus = events[0]?.status === 'online' ? 0 : 1  // opposite = was offline before first event
  const points = [
    { ts: windowStart.toISOString().slice(0, 19), value: firstStatus },
  ]

  for (const e of events) {
    points.push({ ts: e.timestamp.slice(0, 19), value: e.status === 'online' ? 1 : 0 })
  }

  // Extend to now with current status
  const last = points[points.length - 1]
  points.push({ ts: now.toISOString().slice(0, 19), value: last.value })

  return points
}

function calcStats(events, days) {
  if (!events.length) return null

  const now = Date.now()
  const windowMs = days * 86400 * 1000
  const windowStart = now - windowMs

  let onlineMs = 0
  let prevTs = windowStart
  let prevStatus = events[0]?.status === 'online' ? 'offline' : 'online' // before first event

  for (const e of events) {
    const ts = new Date(e.timestamp + 'Z').getTime()
    if (prevStatus === 'online') onlineMs += Math.max(0, ts - prevTs)
    prevTs = ts
    prevStatus = e.status
  }
  // Add time from last event to now
  if (prevStatus === 'online') onlineMs += Math.max(0, now - prevTs)

  const uptimePct = Math.round((onlineMs / windowMs) * 100)
  const currentStatus = events[events.length - 1]?.status
  const outages = events.filter(e => e.status === 'offline').length

  return { uptimePct, currentStatus, outages }
}

function StatCard({ label, value, color }) {
  return (
    <div style={{ background: T.surface, border: `1px solid ${T.border}`, borderRadius: 8, padding: '0.75rem 1.25rem', minWidth: 120, textAlign: 'center' }}>
      <div style={{ fontSize: '1.6rem', fontWeight: 700, color: color || T.accent }}>{value}</div>
      <div style={{ fontSize: '0.75rem', color: T.textDim, textTransform: 'uppercase', letterSpacing: '0.05em', marginTop: 4 }}>{label}</div>
    </div>
  )
}

const CustomTooltip = ({ active, payload }) => {
  if (!active || !payload?.length) return null
  const { ts, value } = payload[0].payload
  return (
    <div style={{ background: T.surface2, border: `1px solid ${T.border2}`, borderRadius: 6, padding: '8px 12px', fontSize: '0.82rem', color: T.text }}>
      <div style={{ color: T.textDim, marginBottom: 2 }}>{fmt(ts)}</div>
      <div style={{ color: value === 1 ? T.green : T.red, fontWeight: 600 }}>
        {value === 1 ? '● Online' : '○ Offline'}
      </div>
    </div>
  )
}

export default function History() {
  const [devices,    setDevices]    = useState([])
  const [selectedMac, setSelectedMac] = useState('')
  const [days,       setDays]       = useState(7)
  const [events,     setEvents]     = useState([])
  const [loading,    setLoading]    = useState(false)
  const [uptimeData, setUptimeData] = useState(null)

  useEffect(() => {
    fetchDevices().then(devs => {
      setDevices(devs)
      if (devs.length > 0 && !selectedMac) setSelectedMac(devs[0].mac_address)
    })
  }, [])

  useEffect(() => {
    if (!selectedMac) return
    setLoading(true)
    Promise.all([
      fetchDeviceHistory(selectedMac, days),
      fetchDeviceUptime(selectedMac, days),
    ]).then(([evts, upt]) => {
      setEvents(evts)
      setUptimeData(upt)
    }).finally(() => setLoading(false))
  }, [selectedMac, days])

  const chartData = useMemo(() => buildChartData(events, days), [events, days])
  const stats = useMemo(() => calcStats(events, days), [events, days])
  const selectedDevice = devices.find(d => d.mac_address === selectedMac)

  return (
    <div>
      <h2 style={{ color: T.text, fontSize: '1.1rem', fontWeight: 600, marginTop: 0, marginBottom: '1.5rem' }}>
        Device History
      </h2>

      {/* Controls */}
      <div style={{ display: 'flex', gap: '0.75rem', marginBottom: '1.5rem', flexWrap: 'wrap', alignItems: 'center' }}>
        <select
          value={selectedMac}
          onChange={e => setSelectedMac(e.target.value)}
          style={{ padding: '7px 12px', background: T.surface2, border: `1px solid ${T.border2}`, borderRadius: 6, color: T.text, fontSize: '0.875rem', minWidth: 220 }}
        >
          {devices.map(d => (
            <option key={d.mac_address} value={d.mac_address}>
              {deviceLabel(d)} — {d.ip_address || d.mac_address}
            </option>
          ))}
        </select>

        <div style={{ display: 'flex', gap: '0.25rem' }}>
          {DAYS_OPTIONS.map(opt => (
            <button
              key={opt.value}
              onClick={() => setDays(opt.value)}
              style={{
                padding: '6px 14px',
                borderRadius: 6,
                border: `1px solid ${days === opt.value ? T.accent : T.border2}`,
                background: days === opt.value ? T.accentDim : T.surface2,
                color: days === opt.value ? T.accent : T.textMid,
                cursor: 'pointer',
                fontSize: '0.875rem',
              }}
            >
              {opt.label}
            </button>
          ))}
        </div>
      </div>

      {/* Device info card */}
      {selectedDevice && <DeviceInfoCard device={selectedDevice} uptimeData={uptimeData} />}

      {/* Stats row */}
      {stats && (
        <div style={{ display: 'flex', gap: '0.75rem', marginBottom: '1.5rem', flexWrap: 'wrap' }}>
          <StatCard
            label="Uptime"
            value={`${stats.uptimePct}%`}
            color={stats.uptimePct >= 90 ? T.green : stats.uptimePct >= 60 ? T.amber : T.red}
          />
          <StatCard
            label="Current"
            value={stats.currentStatus === 'online' ? 'Online' : 'Offline'}
            color={stats.currentStatus === 'online' ? T.green : T.red}
          />
          <StatCard label="Outages" value={stats.outages} color={stats.outages === 0 ? T.green : T.amber} />
          <StatCard label="Events" value={events.length} color={T.textMid} />
        </div>
      )}

      {/* Chart */}
      <div style={{ background: T.surface, border: `1px solid ${T.border}`, borderRadius: 10, padding: '1.5rem 1rem 1rem' }}>
        {loading ? (
          <div style={{ color: T.textDim, textAlign: 'center', padding: '3rem' }}>Loading…</div>
        ) : chartData.length < 2 ? (
          <div style={{ color: T.textDim, textAlign: 'center', padding: '3rem' }}>
            No history yet for this device in the selected period.<br />
            <span style={{ fontSize: '0.85rem' }}>History is recorded automatically each scan.</span>
          </div>
        ) : (
          <ResponsiveContainer width="100%" height={220}>
            <AreaChart data={chartData} margin={{ top: 10, right: 10, left: 0, bottom: 0 }}>
              <defs>
                <linearGradient id="onlineGradient" x1="0" y1="0" x2="0" y2="1">
                  <stop offset="5%"  stopColor={T.green} stopOpacity={0.25} />
                  <stop offset="95%" stopColor={T.green} stopOpacity={0.02} />
                </linearGradient>
              </defs>
              <XAxis
                dataKey="ts"
                tickFormatter={ts => fmtShort(ts, days)}
                tick={{ fill: T.textDim, fontSize: 11 }}
                axisLine={{ stroke: T.border }}
                tickLine={false}
                interval="preserveStartEnd"
                minTickGap={60}
              />
              <YAxis
                domain={[0, 1]}
                ticks={[0, 1]}
                tickFormatter={v => v === 1 ? 'Online' : 'Offline'}
                tick={{ fill: T.textDim, fontSize: 11 }}
                axisLine={false}
                tickLine={false}
                width={54}
              />
              <Tooltip content={<CustomTooltip />} />
              <ReferenceLine y={0.5} stroke={T.border} strokeDasharray="3 3" />
              <Area
                type="stepAfter"
                dataKey="value"
                stroke={T.green}
                strokeWidth={2}
                fill="url(#onlineGradient)"
                dot={false}
                isAnimationActive={false}
              />
            </AreaChart>
          </ResponsiveContainer>
        )}
      </div>

      {/* Event log */}
      {events.length > 0 && (
        <div style={{ marginTop: '1.5rem' }}>
          <div style={{ color: T.textDim, fontSize: '0.75rem', fontWeight: 600, textTransform: 'uppercase', letterSpacing: '0.07em', marginBottom: '0.75rem' }}>
            Event Log
          </div>
          <div style={{ background: T.surface, border: `1px solid ${T.border}`, borderRadius: 10, overflow: 'hidden', maxHeight: 280, overflowY: 'auto' }}>
            {[...events].reverse().map(e => (
              <div key={e.id} style={{ display: 'flex', alignItems: 'center', gap: '1rem', padding: '8px 14px', borderBottom: `1px solid ${T.border}`, fontSize: '0.85rem' }}>
                <span style={{ color: e.status === 'online' ? T.green : T.red, fontWeight: 600, minWidth: 56 }}>
                  {e.status === 'online' ? '● Online' : '○ Offline'}
                </span>
                <span style={{ color: T.textMid, fontFamily: 'monospace', fontSize: '0.8rem' }}>
                  {fmt(e.timestamp)}
                </span>
                {e.ip_address && (
                  <span style={{ color: T.textDim, fontFamily: 'monospace', fontSize: '0.8rem' }}>
                    {e.ip_address}
                  </span>
                )}
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  )
}
