import { useEffect, useState } from 'react'
import { fetchAlertsEnabled, setAlertsEnabled, fetchOnlineLookupEnabled, setOnlineLookupEnabled, fetchScanInterval, setScanInterval, fetchPublicIp } from '../api'
import { T } from '../theme'
import { toast } from './Toast'

function Toggle({ enabled, onToggle }) {
  return (
    <button
      onClick={onToggle}
      style={{
        width: 52,
        height: 28,
        borderRadius: 14,
        border: 'none',
        cursor: 'pointer',
        background: enabled ? T.green : T.border2,
        position: 'relative',
        transition: 'background 0.2s',
        flexShrink: 0,
      }}
    >
      <span style={{
        position: 'absolute',
        top: 3,
        left: enabled ? 27 : 3,
        width: 22,
        height: 22,
        borderRadius: '50%',
        background: '#fff',
        transition: 'left 0.2s',
        display: 'block',
      }} />
    </button>
  )
}

function SettingRow({ title, description, warning, enabled, onToggle }) {
  return (
    <div style={{
      background: T.surface,
      border: `1px solid ${T.border}`,
      borderRadius: 10,
      padding: '1.25rem 1.5rem',
      display: 'flex',
      justifyContent: 'space-between',
      alignItems: 'center',
      gap: '2rem',
    }}>
      <div>
        <div style={{ fontWeight: 600, color: T.text, marginBottom: 4 }}>{title}</div>
        <div style={{ color: T.textMid, fontSize: '0.875rem', lineHeight: 1.5 }}>{description}</div>
        {warning && (
          <div style={{ color: T.amber, fontSize: '0.8rem', marginTop: 6 }}>{'\u26A0'} {warning}</div>
        )}
      </div>
      <div style={{ display: 'flex', alignItems: 'center', gap: '0.75rem', flexShrink: 0 }}>
        <span style={{ fontSize: '0.85rem', color: enabled ? T.green : T.textDim, fontWeight: 500 }}>
          {enabled ? 'ON' : 'OFF'}
        </span>
        <Toggle enabled={enabled} onToggle={onToggle} />
      </div>
    </div>
  )
}

const INTERVAL_OPTIONS = [1, 2, 3, 5, 10, 15, 30, 60]

export default function Settings() {
  const [alerts, setAlertsState] = useState(false)
  const [onlineLookup, setOnlineLookupState] = useState(false)
  const [interval, setIntervalState] = useState(5)
  const [publicIpData, setPublicIpData] = useState(null)

  useEffect(() => {
    fetchAlertsEnabled().then(setAlertsState)
    fetchOnlineLookupEnabled().then(setOnlineLookupState)
    fetchScanInterval().then(setIntervalState)
    fetchPublicIp().then(setPublicIpData)
  }, [])

  async function handleToggleAlerts() {
    const result = await setAlertsEnabled(!alerts)
    if (result !== undefined) {
      setAlertsState(result)
      toast(result ? 'Alerts enabled' : 'Alerts disabled', result ? 'success' : 'info')
    }
  }

  async function handleToggleOnlineLookup() {
    const result = await setOnlineLookupEnabled(!onlineLookup)
    if (result !== undefined) {
      setOnlineLookupState(result)
      toast(result ? 'Online lookup enabled' : 'Online lookup disabled', result ? 'success' : 'info')
    }
  }

  async function handleIntervalChange(e) {
    const minutes = parseInt(e.target.value)
    const result = await setScanInterval(minutes)
    if (result !== undefined) {
      setIntervalState(result)
      toast(`Scan interval set to ${result} minutes`, 'success')
    }
  }

  return (
    <div style={{ maxWidth: 640 }}>
      <h2 style={{ color: T.text, fontSize: '1.1rem', fontWeight: 600, marginBottom: '1.5rem', marginTop: 0 }}>
        Settings
      </h2>

      <div style={{ display: 'flex', flexDirection: 'column', gap: '0.75rem' }}>

        <div style={{ color: T.textDim, fontSize: '0.75rem', fontWeight: 600, textTransform: 'uppercase', letterSpacing: '0.08em', padding: '0 0.25rem', marginBottom: '0.25rem' }}>
          Scanning
        </div>

        {/* Scan interval selector */}
        <div style={{
          background: T.surface,
          border: `1px solid ${T.border}`,
          borderRadius: 10,
          padding: '1.25rem 1.5rem',
          display: 'flex',
          justifyContent: 'space-between',
          alignItems: 'center',
          gap: '2rem',
        }}>
          <div>
            <div style={{ fontWeight: 600, color: T.text, marginBottom: 4 }}>Scan Interval</div>
            <div style={{ color: T.textMid, fontSize: '0.875rem', lineHeight: 1.5 }}>
              How often HomeScan automatically scans the network for devices.
            </div>
          </div>
          <select
            value={interval}
            onChange={handleIntervalChange}
            style={{
              padding: '7px 12px',
              background: T.surface2,
              border: `1px solid ${T.border2}`,
              borderRadius: 6,
              color: T.text,
              fontSize: '0.875rem',
              cursor: 'pointer',
              flexShrink: 0,
            }}
          >
            {INTERVAL_OPTIONS.map(m => (
              <option key={m} value={m}>
                {m < 60 ? `${m} min` : `${m / 60} hour`}
              </option>
            ))}
          </select>
        </div>

        <div style={{ color: T.textDim, fontSize: '0.75rem', fontWeight: 600, textTransform: 'uppercase', letterSpacing: '0.08em', padding: '0.75rem 0.25rem 0.25rem' }}>
          Notifications
        </div>

        <SettingRow
          title="Telegram Alerts"
          description="Send a Telegram message when a new device is discovered or a watched device goes offline."
          enabled={alerts}
          onToggle={handleToggleAlerts}
        />

        <div style={{ color: T.textDim, fontSize: '0.75rem', fontWeight: 600, textTransform: 'uppercase', letterSpacing: '0.08em', padding: '0.75rem 0.25rem 0.25rem' }}>
          Device Probing
        </div>

        <SettingRow
          title="Online Vendor Lookup"
          description="During a device probe, look up the MAC address vendor using api.macvendors.com to help identify unknown devices."
          warning="Requires internet access. MAC addresses are sent to api.macvendors.com."
          enabled={onlineLookup}
          onToggle={handleToggleOnlineLookup}
        />

        {/* Public IP info card */}
        <div style={{ color: T.textDim, fontSize: '0.75rem', fontWeight: 600, textTransform: 'uppercase', letterSpacing: '0.08em', padding: '0.75rem 0.25rem 0.25rem' }}>
          Network
        </div>
        <div style={{ background: T.surface, border: `1px solid ${T.border}`, borderRadius: 10, padding: '1.25rem 1.5rem' }}>
          <div style={{ fontWeight: 600, color: T.text, marginBottom: 4 }}>Public IP Address</div>
          <div style={{ color: T.textMid, fontSize: '0.875rem', lineHeight: 1.5, marginBottom: '0.75rem' }}>
            Your current external IP address. Checked each scan cycle when Online Lookup is enabled.
          </div>
          {!publicIpData?.enabled ? (
            <span style={{ fontSize: '0.85rem', color: T.textDim }}>Enable Online Lookup to track public IP.</span>
          ) : publicIpData?.ip ? (
            <div style={{ display: 'flex', alignItems: 'center', gap: '1rem', flexWrap: 'wrap' }}>
              <span style={{ fontFamily: 'monospace', fontSize: '1.1rem', fontWeight: 700, color: T.accent }}>{publicIpData.ip}</span>
              {publicIpData.last_check && (
                <span style={{ fontSize: '0.8rem', color: T.textDim }}>
                  Last checked: {new Date(publicIpData.last_check + 'Z').toLocaleString()}
                </span>
              )}
            </div>
          ) : (
            <span style={{ fontSize: '0.85rem', color: T.textDim }}>Not yet checked — run a scan to fetch.</span>
          )}
        </div>

        <div style={{ marginTop: '0.75rem', padding: '1rem 1.25rem', background: T.surface, border: `1px solid ${T.border}`, borderRadius: 10, fontSize: '0.85rem', color: T.textMid, lineHeight: 1.6 }}>
          <strong style={{ color: T.green }}>{'✓'}</strong>{' '}
          Settings are persisted in the database and survive restarts.
        </div>

      </div>
    </div>
  )
}
