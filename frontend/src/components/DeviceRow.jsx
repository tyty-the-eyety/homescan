// v3: Groups, ping RTT, uptime in expanded panel

import { useState, useEffect } from 'react'
import { setDeviceAlertOffline, updateDeviceGroup, fetchDeviceUptime, fetchIpHistory, deepProbeDevice, triggerCveScan, fetchDeviceCves } from '../api'
import { T } from '../theme'
import { timeAgo, fullDate } from '../timeago'

const GROUP_PRESETS = ['IoT', 'Media', 'Work', 'Infrastructure', 'Mobile', 'Network', 'Servers']

const cellStyle = { padding: '10px 14px', fontSize: '0.875rem', color: T.text, verticalAlign: 'middle' }
const smallBtn = (extra = {}) => ({
  padding: '4px 10px',
  borderRadius: 5,
  border: `1px solid ${T.border2}`,
  background: 'transparent',
  color: T.textMid,
  cursor: 'pointer',
  fontSize: '0.8rem',
  ...extra,
})

function pingColor(ms) {
  if (ms == null) return T.textDim
  if (ms < 10) return T.green
  if (ms < 100) return T.amber
  return T.red
}

function cveBadgeProps(cves) {
  if (!cves || cves.length === 0) return null
  const hasCritical = cves.some(c => c.severity === 'CRITICAL')
  const hasHigh     = cves.some(c => c.severity === 'HIGH')
  const hasMedium   = cves.some(c => c.severity === 'MEDIUM')
  if (hasCritical) return { label: `${cves.length} CVE`, bg: '#3d0a0a', color: '#f87171', border: '#7f1d1d' }
  if (hasHigh)     return { label: `${cves.length} CVE`, bg: '#2d0a0a', color: T.red,    border: '#7f1d1d' }
  if (hasMedium)   return { label: `${cves.length} CVE`, bg: T.amberDim, color: T.amber, border: T.amber + '55' }
  return               { label: `${cves.length} CVE`, bg: T.surface2, color: T.textMid, border: T.border2 }
}

function uptimeColor(pct) {
  if (pct >= 95) return T.green
  if (pct >= 80) return T.amber
  return T.red
}

export default function DeviceRow({ device, selected, onSelect, onNicknameUpdate, onKnownToggle, onDelete, onProbe, onGroupUpdate }) {
  const [editing,      setEditing]      = useState(false)
  const [nicknameInput, setNicknameInput] = useState(device.nickname || '')
  const [expanded,     setExpanded]     = useState(false)
  const [probing,      setProbing]      = useState(false)
  const [deepProbing,  setDeepProbing]  = useState(false)
  const [cveScanning,  setCveScanning]  = useState(false)
  const [cveData,      setCveData]      = useState(null)
  const [alertOffline, setAlertOffline] = useState(!!device.alert_on_offline)
  const [editingGroup, setEditingGroup] = useState(false)
  const [groupInput,   setGroupInput]   = useState(device.group_name || '')
  const [uptime,       setUptime]       = useState(null)
  const [ipHistory,    setIpHistory]    = useState([])

  // Fetch uptime + IP history + CVEs when expanded
  useEffect(() => {
    if (!expanded) return
    Promise.all([
      fetchDeviceUptime(device.mac_address, 1),
      fetchDeviceUptime(device.mac_address, 7),
      fetchDeviceUptime(device.mac_address, 30),
    ]).then(([u1, u7, u30]) => setUptime({ d1: u1, d7: u7, d30: u30 }))
    fetchIpHistory(device.mac_address).then(setIpHistory)
    if (device.cve_scan_at) {
      fetchDeviceCves(device.mac_address).then(d => d && setCveData(d.cves))
    }
  }, [expanded, device.mac_address])

  function saveNickname() {
    setEditing(false)
    onNicknameUpdate(device.mac_address, nicknameInput)
  }

  async function saveGroup(val) {
    setEditingGroup(false)
    setGroupInput(val)
    await updateDeviceGroup(device.mac_address, val)
    if (onGroupUpdate) onGroupUpdate()
  }

  async function handleToggleAlert() {
    const next = !alertOffline
    const result = await setDeviceAlertOffline(device.mac_address, next)
    if (result) setAlertOffline(!!result.alert_on_offline)
  }

  async function handleProbe() {
    setProbing(true)
    setExpanded(true)
    await onProbe(device.mac_address)
    setProbing(false)
  }

  async function handleDeepProbe() {
    setDeepProbing(true)
    setExpanded(true)
    await deepProbeDevice(device.mac_address)
    setDeepProbing(false)
  }

  async function handleCveScan() {
    setCveScanning(true)
    setExpanded(true)
    const result = await triggerCveScan(device.mac_address)
    if (result) setCveData(result.cves)
    setCveScanning(false)
  }

  const isKnown = device.is_known === 1
  const isOnline = device.last_status === 'online'

  // CVE badge from stored scan results
  let storedCves = []
  try { storedCves = JSON.parse(device.cve_data || '[]') } catch {}
  const cveBadge = cveBadgeProps(storedCves)

  let openPorts = []
  try { openPorts = device.open_ports ? JSON.parse(device.open_ports) : [] } catch {}

  const hasProbeData = openPorts.length > 0 || device.os_guess || device.device_type || device.ttl_os_hint || device.netbios_name || device.vendor || device.mdns_name || device.http_title || device.ssdp_server
  const COL_COUNT = 10

  const rowBg = selected ? T.accentDim : T.surface

  return (
    <>
      <tr style={{ background: rowBg, borderBottom: `1px solid ${T.border}` }}>
        <td style={{ ...cellStyle, width: 36 }}>
          <input
            type="checkbox"
            checked={selected}
            onChange={e => onSelect(device.mac_address, e.target.checked)}
            style={{ accentColor: T.accent }}
          />
        </td>

        <td style={{ ...cellStyle, fontFamily: 'monospace', fontSize: '0.8rem', color: T.textMid }}>
          {device.mac_address}
        </td>

        <td style={{ ...cellStyle, fontFamily: 'monospace', fontSize: '0.85rem' }}>
          {device.ip_address || '\u2014'}
        </td>

        <td style={cellStyle}>
          {editing ? (
            <input
              autoFocus
              value={nicknameInput}
              onChange={e => setNicknameInput(e.target.value)}
              onBlur={saveNickname}
              onKeyDown={e => e.key === 'Enter' && saveNickname()}
              style={{ padding: '3px 7px', background: T.surface2, border: `1px solid ${T.accent}`, borderRadius: 4, color: T.text, fontSize: '0.875rem', width: '100%' }}
            />
          ) : (
            <span
              onClick={() => setEditing(true)}
              title="Click to edit nickname"
              style={{ cursor: 'text', borderBottom: `1px dashed ${T.border2}`, paddingBottom: 1 }}
            >
              {device.nickname
                ? <span style={{ color: T.accent }}>{device.nickname}</span>
                : <span style={{ color: T.textMid }}>{device.hostname || '\u2014'}</span>
              }
            </span>
          )}
        </td>

        {/* Group */}
        <td style={{ ...cellStyle, fontSize: '0.82rem' }}>
          {editingGroup ? (
            <div style={{ position: 'relative' }}>
              <input
                autoFocus
                list="group-presets"
                value={groupInput}
                onChange={e => setGroupInput(e.target.value)}
                onBlur={() => saveGroup(groupInput)}
                onKeyDown={e => e.key === 'Enter' && saveGroup(groupInput)}
                style={{ padding: '3px 7px', background: T.surface2, border: `1px solid ${T.accent}`, borderRadius: 4, color: T.text, fontSize: '0.82rem', width: 100 }}
              />
              <datalist id="group-presets">
                {GROUP_PRESETS.map(g => <option key={g} value={g} />)}
              </datalist>
            </div>
          ) : (
            <span
              onClick={() => { setEditingGroup(true); setGroupInput(device.group_name || '') }}
              title="Click to set group"
              style={{ cursor: 'text', borderBottom: `1px dashed ${T.border2}`, paddingBottom: 1, color: device.group_name ? T.textMid : T.textDim }}
            >
              {device.group_name || '\u2014'}
            </span>
          )}
        </td>

        <td style={{ ...cellStyle, color: T.textMid, fontSize: '0.85rem' }}>
          {device.vendor || '\u2014'}
        </td>

        <td style={{ ...cellStyle, color: T.textDim, fontSize: '0.8rem', whiteSpace: 'nowrap' }} title={fullDate(device.first_seen)}>
          {timeAgo(device.first_seen)}
        </td>

        <td style={{ ...cellStyle, color: T.textDim, fontSize: '0.8rem', whiteSpace: 'nowrap' }} title={fullDate(device.last_seen)}>
          {timeAgo(device.last_seen)}
        </td>

        {/* Online/Offline status badge + CVE badge */}
        <td style={{ ...cellStyle, whiteSpace: 'nowrap' }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: '0.4rem', flexWrap: 'nowrap' }}>
            <span style={{
              display: 'inline-block',
              padding: '3px 10px',
              borderRadius: 20,
              fontSize: '0.75rem',
              fontWeight: 600,
              background: isOnline ? T.greenDim : T.redDim,
              color: isOnline ? T.green : T.red,
            }}>
              {isOnline ? '\u25CF Online' : '\u25CB Offline'}
            </span>
            {cveBadge && (
              <span
                title={`${storedCves.length} CVE(s) found — click to expand`}
                onClick={() => setExpanded(true)}
                style={{
                  display: 'inline-block',
                  padding: '2px 7px',
                  borderRadius: 10,
                  fontSize: '0.7rem',
                  fontWeight: 700,
                  background: cveBadge.bg,
                  color: cveBadge.color,
                  border: `1px solid ${cveBadge.border}`,
                  cursor: 'pointer',
                }}
              >
                ⚠ {cveBadge.label}
              </span>
            )}
          </div>
        </td>

        <td style={{ ...cellStyle, whiteSpace: 'nowrap' }}>
          <div style={{ display: 'flex', gap: '0.4rem', alignItems: 'center' }}>
            <button
              onClick={() => setExpanded(v => !v)}
              style={smallBtn({ color: expanded ? T.accent : T.textMid, borderColor: expanded ? T.accent + '44' : T.border2 })}
              title="Device details & probe"
            >
              {expanded ? '\u25BC' : '\u25B6'}
            </button>
            <button
              onClick={() => onKnownToggle(device.mac_address, isKnown ? 0 : 1)}
              style={smallBtn({
                color: isKnown ? T.green : T.textMid,
                borderColor: isKnown ? T.green + '44' : T.border2,
                background: isKnown ? T.greenDim : 'transparent',
              })}
              title={isKnown ? 'Known device \u2014 click to unmark' : 'Unknown device \u2014 click to mark known'}
            >
              {isKnown ? '\u2713 Known' : 'Known'}
            </button>
          </div>
        </td>
      </tr>

      {/* Expandable probe detail panel */}
      {expanded && (
        <tr style={{ background: T.bg, borderBottom: `1px solid ${T.border}` }}>
          <td colSpan={COL_COUNT} style={{ padding: '1rem 1.5rem' }}>
            <div style={{ display: 'flex', gap: '2rem', flexWrap: 'wrap', alignItems: 'flex-start' }}>

              {/* Info fields */}
              <div style={{ minWidth: 200 }}>
                {[
                  ['Device Type', device.device_type],
                  ['OS',          device.os_detail || device.os_guess],
                  ['TTL Hint',    device.os_detail ? null : device.ttl_os_hint],
                  ['NetBIOS',     device.netbios_name],
                  ['mDNS Name',   device.mdns_name],
                  ['HTTP',        device.http_title],
                  ['SSDP',        device.ssdp_server],
                  ['Vendor',      device.vendor],
                ].map(([label, val]) => !val ? null : (
                  <div key={label} style={{ marginBottom: 10 }}>
                    <div style={{ fontSize: '0.7rem', fontWeight: 600, textTransform: 'uppercase', letterSpacing: '0.07em', color: T.textDim, marginBottom: 2 }}>
                      {label}
                    </div>
                    <div style={{ fontSize: '0.9rem', color: T.text }}>{val}</div>
                  </div>
                ))}

                {/* Ping RTT */}
                {device.last_ping_ms != null && (
                  <div style={{ marginBottom: 10 }}>
                    <div style={{ fontSize: '0.7rem', fontWeight: 600, textTransform: 'uppercase', letterSpacing: '0.07em', color: T.textDim, marginBottom: 2 }}>
                      Ping
                    </div>
                    <div style={{ fontSize: '0.9rem', color: pingColor(device.last_ping_ms), fontWeight: 600 }}>
                      {device.last_ping_ms.toFixed(1)} ms
                    </div>
                  </div>
                )}

                {!hasProbeData && device.last_ping_ms == null && (
                  <div style={{ color: T.textDim, fontSize: '0.875rem' }}>No probe data yet</div>
                )}
              </div>

              {/* Uptime */}
              {uptime && (
                <div style={{ minWidth: 140 }}>
                  <div style={{ fontSize: '0.7rem', fontWeight: 600, textTransform: 'uppercase', letterSpacing: '0.07em', color: T.textDim, marginBottom: 8 }}>
                    Uptime
                  </div>
                  {[
                    ['24h', uptime.d1],
                    ['7d',  uptime.d7],
                    ['30d', uptime.d30],
                  ].map(([label, data]) => data ? (
                    <div key={label} style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', marginBottom: 6 }}>
                      <span style={{ fontSize: '0.78rem', color: T.textDim, minWidth: 28 }}>{label}</span>
                      <div style={{ flex: 1, height: 6, background: T.surface2, borderRadius: 3, overflow: 'hidden', minWidth: 60 }}>
                        <div style={{ width: `${data.uptime_pct}%`, height: '100%', background: uptimeColor(data.uptime_pct), borderRadius: 3 }} />
                      </div>
                      <span style={{ fontSize: '0.82rem', fontWeight: 600, color: uptimeColor(data.uptime_pct), minWidth: 42, textAlign: 'right' }}>
                        {data.uptime_pct}%
                      </span>
                    </div>
                  ) : null)}
                </div>
              )}

              {/* IP History */}
              {ipHistory.length > 0 && (
                <div style={{ minWidth: 220 }}>
                  <div style={{ fontSize: '0.7rem', fontWeight: 600, textTransform: 'uppercase', letterSpacing: '0.07em', color: T.textDim, marginBottom: 6, display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
                    IP History
                    {ipHistory.length >= 3 && (
                      <span style={{ fontSize: '0.65rem', padding: '1px 6px', borderRadius: 10, background: T.amberDim, color: T.amber, fontWeight: 700 }}>
                        IP Hopper
                      </span>
                    )}
                  </div>
                  <div style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
                    {ipHistory.slice(0, 8).map((entry, i) => (
                      <div key={i} style={{ display: 'flex', alignItems: 'center', gap: '0.4rem', fontSize: '0.8rem' }}>
                        <span style={{ fontFamily: 'monospace', color: T.textDim, textDecoration: 'line-through' }}>{entry.old_ip}</span>
                        <span style={{ color: T.textDim }}>→</span>
                        <span style={{ fontFamily: 'monospace', color: T.accent }}>{entry.new_ip}</span>
                        <span style={{ color: T.textDim, fontSize: '0.72rem', marginLeft: 'auto' }} title={fullDate(entry.timestamp)}>{timeAgo(entry.timestamp)}</span>
                      </div>
                    ))}
                  </div>
                </div>
              )}

              {/* CVE results */}
              {(cveScanning || cveData !== null) && (
                <div style={{ minWidth: 360, flex: '1 1 360px' }}>
                  <div style={{ fontSize: '0.7rem', fontWeight: 600, textTransform: 'uppercase', letterSpacing: '0.07em', color: T.textDim, marginBottom: 8, display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
                    CVE Findings
                    {cveScanning && <span style={{ fontSize: '0.68rem', color: '#a78bfa' }}>querying NVD…</span>}
                    {!cveScanning && cveData !== null && (
                      <span style={{ fontSize: '0.68rem', color: T.textDim }}>
                        {cveData.length === 0 ? 'none found' : `${cveData.length} found`}
                      </span>
                    )}
                  </div>
                  {!cveScanning && cveData !== null && cveData.length === 0 && (
                    <div style={{ color: T.green, fontSize: '0.85rem' }}>✓ No CVEs found for detected service versions</div>
                  )}
                  {!cveScanning && cveData && cveData.length > 0 && (
                    <table style={{ borderCollapse: 'collapse', fontSize: '0.8rem', width: '100%' }}>
                      <thead>
                        <tr>
                          {['Severity', 'Score', 'CVE ID', 'Service', 'Description'].map(h => (
                            <th key={h} style={{ padding: '4px 8px', textAlign: 'left', color: T.textDim, fontWeight: 600, borderBottom: `1px solid ${T.border}`, fontSize: '0.68rem', textTransform: 'uppercase', letterSpacing: '0.05em', whiteSpace: 'nowrap' }}>
                              {h}
                            </th>
                          ))}
                        </tr>
                      </thead>
                      <tbody>
                        {cveData.map(cve => {
                          const sevColor = { CRITICAL: '#f87171', HIGH: T.red, MEDIUM: T.amber, LOW: T.green }[cve.severity] || T.textDim
                          return (
                            <tr key={cve.cve_id} style={{ borderBottom: `1px solid ${T.border}` }}>
                              <td style={{ padding: '5px 8px', fontWeight: 700, color: sevColor, whiteSpace: 'nowrap' }}>{cve.severity}</td>
                              <td style={{ padding: '5px 8px', fontFamily: 'monospace', color: sevColor, whiteSpace: 'nowrap' }}>{cve.score ?? '—'}</td>
                              <td style={{ padding: '5px 8px', whiteSpace: 'nowrap' }}>
                                <a href={cve.url} target="_blank" rel="noreferrer" style={{ color: '#a78bfa', textDecoration: 'none', fontFamily: 'monospace', fontSize: '0.78rem' }}>
                                  {cve.cve_id}
                                </a>
                              </td>
                              <td style={{ padding: '5px 8px', color: T.textMid, whiteSpace: 'nowrap', fontSize: '0.75rem' }}>{cve.service}</td>
                              <td style={{ padding: '5px 8px', color: T.textMid, maxWidth: 280 }} title={cve.description}>
                                {cve.description.slice(0, 100)}{cve.description.length > 100 ? '…' : ''}
                              </td>
                            </tr>
                          )
                        })}
                      </tbody>
                    </table>
                  )}
                  {!cveScanning && cveData && cveData.length > 0 && (
                    <div style={{ marginTop: 6, fontSize: '0.68rem', color: T.textDim }}>
                      Results from NVD keyword search — may include CVEs for other versions. Verify before acting.
                    </div>
                  )}
                </div>
              )}

              {/* Open ports */}
              <div style={{ flex: 1, minWidth: 280 }}>
                <div style={{ fontSize: '0.7rem', fontWeight: 600, textTransform: 'uppercase', letterSpacing: '0.07em', color: T.textDim, marginBottom: 8 }}>
                  Open Ports {openPorts.length > 0 && `(${openPorts.length})`}
                </div>
                {openPorts.length === 0 ? (
                  <div style={{ color: T.textDim, fontSize: '0.875rem' }}>
                    {hasProbeData ? 'No open ports found on scanned ports' : 'Run a probe to discover open ports'}
                  </div>
                ) : (
                  <table style={{ borderCollapse: 'collapse', fontSize: '0.82rem', width: '100%' }}>
                    <thead>
                      <tr>
                        {['Port', 'Protocol', 'Service', 'Version'].map(h => (
                          <th key={h} style={{ padding: '4px 10px', textAlign: 'left', color: T.textDim, fontWeight: 600, borderBottom: `1px solid ${T.border}`, fontSize: '0.72rem', textTransform: 'uppercase', letterSpacing: '0.05em' }}>
                            {h}
                          </th>
                        ))}
                      </tr>
                    </thead>
                    <tbody>
                      {openPorts.map(p => (
                        <tr key={p.port}>
                          <td style={{ padding: '4px 10px', fontFamily: 'monospace', color: T.accent }}>{p.port}</td>
                          <td style={{ padding: '4px 10px', color: T.textMid }}>{p.protocol}</td>
                          <td style={{ padding: '4px 10px', color: T.text }}>{p.service || '\u2014'}</td>
                          <td style={{ padding: '4px 10px', color: T.textDim }}>{p.version || '\u2014'}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                )}
              </div>

              {/* Actions */}
              <div style={{ alignSelf: 'flex-start', paddingTop: 2, display: 'flex', flexDirection: 'column', gap: '0.5rem' }}>
                <button
                  onClick={handleProbe}
                  disabled={probing || deepProbing}
                  style={{
                    padding: '7px 16px',
                    borderRadius: 6,
                    border: `1px solid ${probing ? T.border : T.accent + '88'}`,
                    background: probing ? T.surface : T.accentDim,
                    color: probing || deepProbing ? T.textDim : T.accent,
                    cursor: probing || deepProbing ? 'not-allowed' : 'pointer',
                    fontSize: '0.875rem',
                    fontWeight: 500,
                  }}
                >
                  {probing ? 'Probing\u2026' : hasProbeData ? 'Re-probe' : 'Probe Now'}
                </button>
                <button
                  onClick={handleDeepProbe}
                  disabled={probing || deepProbing || cveScanning}
                  title="Full nmap -sV -O scan + NSE scripts. Takes 2-5 minutes."
                  style={{
                    padding: '7px 16px',
                    borderRadius: 6,
                    border: `1px solid ${deepProbing ? T.border : T.amber + '66'}`,
                    background: deepProbing ? T.surface : T.amberDim,
                    color: probing || deepProbing || cveScanning ? T.textDim : T.amber,
                    cursor: probing || deepProbing || cveScanning ? 'not-allowed' : 'pointer',
                    fontSize: '0.875rem',
                    fontWeight: 500,
                  }}
                >
                  {deepProbing ? 'Deep probing\u2026' : 'Deep Probe'}
                </button>
                {device.deep_scan_at && !deepProbing && (
                  <div style={{ fontSize: '0.7rem', color: T.textDim, textAlign: 'center' }} title={fullDate(device.deep_scan_at)}>
                    Deep: {timeAgo(device.deep_scan_at)}
                  </div>
                )}
                <button
                  onClick={handleCveScan}
                  disabled={probing || deepProbing || cveScanning || !device.open_ports}
                  title={!device.open_ports ? 'Run a probe first to get service data' : 'Query NVD for known CVEs based on detected service versions'}
                  style={{
                    padding: '7px 16px',
                    borderRadius: 6,
                    border: `1px solid ${cveScanning ? T.border : '#7c3aed44'}`,
                    background: cveScanning ? T.surface : '#1a0a2e',
                    color: probing || deepProbing || cveScanning || !device.open_ports ? T.textDim : '#a78bfa',
                    cursor: probing || deepProbing || cveScanning || !device.open_ports ? 'not-allowed' : 'pointer',
                    fontSize: '0.875rem',
                    fontWeight: 500,
                  }}
                >
                  {cveScanning ? 'Scanning CVEs\u2026' : 'CVE Scan'}
                </button>
                {device.cve_scan_at && !cveScanning && (
                  <div style={{ fontSize: '0.7rem', color: T.textDim, textAlign: 'center' }} title={fullDate(device.cve_scan_at)}>
                    CVE: {timeAgo(device.cve_scan_at)}
                  </div>
                )}
                <button
                  onClick={handleToggleAlert}
                  title={alertOffline ? 'Offline alerts ON \u2014 click to disable' : 'Offline alerts OFF \u2014 click to enable'}
                  style={{
                    padding: '7px 16px',
                    borderRadius: 6,
                    border: `1px solid ${alertOffline ? T.amber + '55' : T.border2}`,
                    background: alertOffline ? T.amberDim : 'transparent',
                    color: alertOffline ? T.amber : T.textMid,
                    cursor: 'pointer',
                    fontSize: '0.875rem',
                    fontWeight: 500,
                  }}
                >
                  {alertOffline ? '\uD83D\uDD14 Alert ON' : '\uD83D\uDD15 Alert OFF'}
                </button>
                <button
                  onClick={() => onDelete(device.mac_address)}
                  style={{
                    padding: '7px 16px',
                    borderRadius: 6,
                    border: `1px solid ${T.redDim}`,
                    background: 'transparent',
                    color: T.red,
                    cursor: 'pointer',
                    fontSize: '0.875rem',
                    fontWeight: 500,
                  }}
                >
                  \u2715 Delete
                </button>
              </div>

            </div>
          </td>
        </tr>
      )}
    </>
  )
}
