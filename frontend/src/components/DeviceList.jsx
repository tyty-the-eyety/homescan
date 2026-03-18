// v3: Groups, SSE-driven updates, relative timestamps, online/offline badges, toasts

import { useEffect, useState, useRef } from 'react'
import { fetchDevices, fetchStats, fetchGroups, updateNickname, markKnown, triggerScan, deleteDevice, bulkMarkKnown, bulkRename, bulkUpdateGroup, probeDevice } from '../api'
import { T } from '../theme'
import { toast } from './Toast'
import Stats from './Stats'
import DeviceRow from './DeviceRow'

const COLUMNS = [
  { key: 'mac_address', label: 'MAC' },
  { key: 'ip_address',  label: 'IP' },
  { key: 'name',        label: 'Name' },
  { key: 'group_name',  label: 'Group' },
  { key: 'vendor',      label: 'Vendor' },
  { key: 'first_seen',  label: 'First Seen' },
  { key: 'last_seen',   label: 'Last Seen' },
  { key: 'last_status', label: 'Status' },
]

const btn = (extra = {}) => ({
  padding: '7px 16px',
  borderRadius: 6,
  border: `1px solid ${T.border2}`,
  background: T.surface2,
  color: T.text,
  cursor: 'pointer',
  fontSize: '0.875rem',
  fontWeight: 500,
  ...extra,
})

function deviceName(d) {
  return d.nickname || d.hostname || ''
}

export default function DeviceList({ sseRevision, sseDataRef, scanning }) {
  const [devices,  setDevices]  = useState([])
  const [stats,    setStats]    = useState({})
  const [groups,   setGroups]   = useState([])
  const [loading,  setLoading]  = useState(true)
  const [search,   setSearch]   = useState('')
  const [groupFilter, setGroupFilter] = useState('')
  const [sortKey,  setSortKey]  = useState('last_seen')
  const [sortAsc,  setSortAsc]  = useState(false)
  const [selected, setSelected] = useState(new Set())
  const [bulkNickname,   setBulkNickname]   = useState('')
  const [showBulkRename, setShowBulkRename] = useState(false)
  const [showBulkGroup,  setShowBulkGroup]  = useState(false)
  const [bulkGroupInput, setBulkGroupInput] = useState('')
  const initRef = useRef(false)

  async function refresh() {
    const [devs, st, grps] = await Promise.all([fetchDevices(), fetchStats(), fetchGroups()])
    setDevices(devs)
    setStats(st)
    setGroups(grps)
  }

  // Initial load
  useEffect(() => {
    refresh().finally(() => setLoading(false))
    // Fallback polling every 60s (SSE is primary)
    const interval = setInterval(refresh, 60000)
    return () => clearInterval(interval)
  }, [])

  // SSE-driven refresh: use data directly from SSE if available
  useEffect(() => {
    if (sseRevision === 0) return
    const data = sseDataRef?.current
    if (data?.devices && data?.stats) {
      setDevices(data.devices)
      setStats(data.stats)
      sseDataRef.current = null
    } else {
      refresh()
    }
  }, [sseRevision])

  async function handleNicknameUpdate(mac, nickname) {
    await updateNickname(mac, nickname)
    toast('Nickname saved', 'success')
    await refresh()
  }

  async function handleKnownToggle(mac, isKnown) {
    await markKnown(mac, isKnown)
    toast(isKnown ? 'Marked as known' : 'Marked as unknown', 'info')
    await refresh()
  }

  async function handleDelete(mac) {
    if (!confirm('Delete this device?')) return
    await deleteDevice(mac)
    setSelected(prev => { const s = new Set(prev); s.delete(mac); return s })
    toast('Device deleted', 'warning')
    await refresh()
  }

  async function handleScan() {
    // SSE will handle the scanning state and result via App.jsx
    await triggerScan()
  }

  function handleSelect(mac, checked) {
    setSelected(prev => {
      const s = new Set(prev)
      checked ? s.add(mac) : s.delete(mac)
      return s
    })
  }

  function handleSelectAll(checked) {
    setSelected(checked ? new Set(filtered.map(d => d.mac_address)) : new Set())
  }

  async function handleProbe(mac) {
    toast('Probing device...', 'info')
    await probeDevice(mac)
    await refresh()
  }

  async function handleBulkKnown(isKnown) {
    await bulkMarkKnown([...selected], isKnown)
    toast(`${selected.size} devices updated`, 'success')
    setSelected(new Set())
    await refresh()
  }

  async function handleBulkRename() {
    if (!bulkNickname.trim()) return
    await bulkRename([...selected], bulkNickname.trim())
    toast(`${selected.size} devices renamed`, 'success')
    setBulkNickname('')
    setShowBulkRename(false)
    setSelected(new Set())
    await refresh()
  }

  async function handleBulkGroup() {
    await bulkUpdateGroup([...selected], bulkGroupInput.trim())
    toast(`${selected.size} devices grouped`, 'success')
    setBulkGroupInput('')
    setShowBulkGroup(false)
    setSelected(new Set())
    await refresh()
  }

  function handleExportCSV() {
    const headers = ['MAC', 'IP', 'Name', 'Group', 'Vendor', 'Status', 'Known', 'First Seen', 'Last Seen']
    const rows = sorted.map(d => [
      d.mac_address, d.ip_address || '', deviceName(d), d.group_name || '', d.vendor || '',
      d.last_status || '', d.is_known ? 'Known' : 'Unknown', d.first_seen || '', d.last_seen || '',
    ])
    const csv = [headers, ...rows]
      .map(row => row.map(v => `"${String(v).replace(/"/g, '""')}"`).join(','))
      .join('\n')
    const blob = new Blob([csv], { type: 'text/csv' })
    const url = URL.createObjectURL(blob)
    const a = document.createElement('a')
    a.href = url
    a.download = 'homescan-devices.csv'
    a.click()
    URL.revokeObjectURL(url)
    toast('CSV exported', 'success')
  }

  function handleSort(key) {
    if (sortKey === key) setSortAsc(a => !a)
    else { setSortKey(key); setSortAsc(true) }
  }

  const filtered = devices.filter(d => {
    // Group filter
    if (groupFilter && (d.group_name || '') !== groupFilter) return false
    // Text search
    const q = search.toLowerCase()
    return (
      d.mac_address.toLowerCase().includes(q) ||
      d.ip_address?.toLowerCase().includes(q) ||
      deviceName(d).toLowerCase().includes(q) ||
      (d.vendor || '').toLowerCase().includes(q) ||
      (d.group_name || '').toLowerCase().includes(q)
    )
  })

  const sorted = [...filtered].sort((a, b) => {
    let av = sortKey === 'name' ? deviceName(a) : (a[sortKey] ?? '')
    let bv = sortKey === 'name' ? deviceName(b) : (b[sortKey] ?? '')
    if (av < bv) return sortAsc ? -1 : 1
    if (av > bv) return sortAsc ? 1 : -1
    return 0
  })

  const allSelected = filtered.length > 0 && filtered.every(d => selected.has(d.mac_address))

  function SortHeader({ col }) {
    const active = sortKey === col.key
    return (
      <th
        onClick={() => handleSort(col.key)}
        style={{
          padding: '10px 14px',
          borderBottom: `1px solid ${T.border}`,
          fontSize: '0.78rem',
          fontWeight: 600,
          textTransform: 'uppercase',
          letterSpacing: '0.06em',
          color: active ? T.accent : T.textDim,
          cursor: 'pointer',
          userSelect: 'none',
          whiteSpace: 'nowrap',
          background: T.surface,
        }}
      >
        {col.label} {active ? (sortAsc ? '\u2191' : '\u2193') : ''}
      </th>
    )
  }

  return (
    <div>
      <Stats stats={stats} />

      {/* Toolbar */}
      <div style={{ display: 'flex', gap: '0.5rem', marginBottom: '1rem', flexWrap: 'wrap', alignItems: 'center' }}>
        <button
          onClick={handleScan}
          disabled={scanning}
          style={btn({ background: scanning ? T.surface : T.accentDim, color: scanning ? T.textDim : T.accent, border: `1px solid ${scanning ? T.border : T.accent}`, cursor: scanning ? 'not-allowed' : 'pointer' })}
        >
          {scanning ? 'Scanning\u2026' : '\u27F3 Scan Now'}
        </button>
        <button
          onClick={handleExportCSV}
          disabled={sorted.length === 0}
          style={btn({ cursor: sorted.length === 0 ? 'not-allowed' : 'pointer', opacity: sorted.length === 0 ? 0.4 : 1 })}
        >
          \u2193 Export CSV
        </button>

        {/* Group filter */}
        {groups.length > 0 && (
          <select
            value={groupFilter}
            onChange={e => setGroupFilter(e.target.value)}
            style={{
              padding: '7px 12px',
              border: `1px solid ${T.border2}`,
              borderRadius: 6,
              background: T.surface2,
              color: groupFilter ? T.accent : T.textMid,
              fontSize: '0.875rem',
            }}
          >
            <option value="">All Groups</option>
            {groups.map(g => <option key={g} value={g}>{g}</option>)}
          </select>
        )}

        <input
          type="text"
          placeholder="Search MAC, IP, name, vendor\u2026"
          value={search}
          onChange={e => setSearch(e.target.value)}
          style={{
            padding: '7px 12px',
            flex: 1,
            minWidth: 200,
            border: `1px solid ${T.border2}`,
            borderRadius: 6,
            background: T.surface2,
            color: T.text,
            fontSize: '0.875rem',
            outline: 'none',
          }}
        />
        <span style={{ color: T.textDim, fontSize: '0.8rem', whiteSpace: 'nowrap' }}>
          {filtered.length} device{filtered.length !== 1 ? 's' : ''}
        </span>
      </div>

      {/* Bulk action bar */}
      {selected.size > 0 && (
        <div style={{
          background: T.accentDim,
          border: `1px solid ${T.accent}44`,
          borderRadius: 8,
          padding: '10px 14px',
          marginBottom: '1rem',
          display: 'flex',
          gap: '0.5rem',
          alignItems: 'center',
          flexWrap: 'wrap',
        }}>
          <span style={{ color: T.accent, fontWeight: 600, fontSize: '0.875rem' }}>{selected.size} selected</span>
          <button onClick={() => handleBulkKnown(1)} style={btn()}>Mark Known</button>
          <button onClick={() => handleBulkKnown(0)} style={btn()}>Mark Unknown</button>
          <button onClick={() => setShowBulkRename(v => !v)} style={btn()}>Rename</button>
          <button onClick={() => setShowBulkGroup(v => !v)} style={btn()}>Set Group</button>
          <button onClick={() => setSelected(new Set())} style={btn({ marginLeft: 'auto' })}>Clear</button>
          {showBulkRename && (
            <>
              <input
                type="text"
                placeholder="New nickname\u2026"
                value={bulkNickname}
                onChange={e => setBulkNickname(e.target.value)}
                onKeyDown={e => e.key === 'Enter' && handleBulkRename()}
                style={{ padding: '6px 10px', border: `1px solid ${T.border2}`, borderRadius: 6, background: T.surface, color: T.text, fontSize: '0.875rem' }}
              />
              <button onClick={handleBulkRename} style={btn({ background: T.accentDim, color: T.accent })}>Apply</button>
            </>
          )}
          {showBulkGroup && (
            <>
              <input
                type="text"
                list="bulk-group-presets"
                placeholder="Group name\u2026"
                value={bulkGroupInput}
                onChange={e => setBulkGroupInput(e.target.value)}
                onKeyDown={e => e.key === 'Enter' && handleBulkGroup()}
                style={{ padding: '6px 10px', border: `1px solid ${T.border2}`, borderRadius: 6, background: T.surface, color: T.text, fontSize: '0.875rem' }}
              />
              <datalist id="bulk-group-presets">
                {['IoT', 'Media', 'Work', 'Infrastructure', 'Mobile', 'Network', 'Servers'].map(g => <option key={g} value={g} />)}
              </datalist>
              <button onClick={handleBulkGroup} style={btn({ background: T.accentDim, color: T.accent })}>Apply</button>
            </>
          )}
        </div>
      )}

      {/* Table */}
      {loading ? (
        <p style={{ color: T.textDim }}>Loading\u2026</p>
      ) : sorted.length === 0 ? (
        <p style={{ color: T.textDim }}>{search ? 'No devices match your search.' : 'No devices found. Run a scan to discover devices.'}</p>
      ) : (
        <div style={{ border: `1px solid ${T.border}`, borderRadius: 10, overflow: 'hidden' }}>
          <table style={{ width: '100%', borderCollapse: 'collapse' }}>
            <thead>
              <tr>
                <th style={{ padding: '10px 14px', borderBottom: `1px solid ${T.border}`, background: T.surface, width: 36 }}>
                  <input
                    type="checkbox"
                    checked={allSelected}
                    onChange={e => handleSelectAll(e.target.checked)}
                    style={{ accentColor: T.accent }}
                  />
                </th>
                {COLUMNS.map(col => <SortHeader key={col.key} col={col} />)}
                <th style={{ padding: '10px 14px', borderBottom: `1px solid ${T.border}`, background: T.surface }} />
              </tr>
            </thead>
            <tbody>
              {sorted.map(device => (
                <DeviceRow
                  key={device.mac_address}
                  device={device}
                  selected={selected.has(device.mac_address)}
                  onSelect={handleSelect}
                  onNicknameUpdate={handleNicknameUpdate}
                  onKnownToggle={handleKnownToggle}
                  onDelete={handleDelete}
                  onProbe={handleProbe}
                  onGroupUpdate={refresh}
                />
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  )
}
