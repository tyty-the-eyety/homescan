import axios from 'axios'
import logger from './logger'

const API_BASE = '/api'

export async function fetchDevices() {
  logger.debug('fetchDevices()')
  try {
    const res = await axios.get(`${API_BASE}/devices`)
    logger.debug(`fetchDevices: got ${res.data.data.length} devices`)
    return res.data.data
  } catch (e) {
    logger.error('fetchDevices failed:', e)
    return []
  }
}

export async function fetchStats() {
  logger.debug('fetchStats()')
  try {
    const res = await axios.get(`${API_BASE}/stats`)
    logger.debug('fetchStats:', res.data.data)
    return res.data.data
  } catch (e) {
    logger.error('fetchStats failed:', e)
    return {}
  }
}

export async function updateNickname(mac, nickname) {
  logger.info(`updateNickname: ${mac} -> "${nickname}"`)
  try {
    const res = await axios.put(`${API_BASE}/devices/${mac}/nickname`, { nickname })
    return res.data.data
  } catch (e) {
    logger.error('updateNickname failed:', e)
  }
}

export async function markKnown(mac, isKnown) {
  logger.info(`markKnown: ${mac} -> ${isKnown}`)
  try {
    const res = await axios.put(`${API_BASE}/devices/${mac}/known`, { is_known: isKnown })
    return res.data.data
  } catch (e) {
    logger.error('markKnown failed:', e)
  }
}

export async function deleteDevice(mac) {
  logger.info(`deleteDevice: ${mac}`)
  try {
    await axios.delete(`${API_BASE}/devices/${mac}`)
  } catch (e) {
    logger.error('deleteDevice failed:', e)
  }
}

export async function bulkMarkKnown(macs, isKnown) {
  logger.info(`bulkMarkKnown: ${macs.length} devices -> ${isKnown}`)
  try {
    await axios.put(`${API_BASE}/devices/bulk/known`, { macs, is_known: isKnown })
  } catch (e) {
    logger.error('bulkMarkKnown failed:', e)
  }
}

export async function bulkRename(macs, nickname) {
  logger.info(`bulkRename: ${macs.length} devices -> "${nickname}"`)
  try {
    await axios.put(`${API_BASE}/devices/bulk/nickname`, { macs, nickname })
  } catch (e) {
    logger.error('bulkRename failed:', e)
  }
}

export async function setDeviceAlertOffline(mac, enabled) {
  try {
    const res = await axios.put(`${API_BASE}/devices/${mac}/alert-offline`, { enabled })
    return res.data.data
  } catch (e) {
    logger.error('setDeviceAlertOffline failed:', e)
  }
}

export async function fetchDeviceHistory(mac, days = 7) {
  try {
    const res = await axios.get(`${API_BASE}/devices/${mac}/history`, { params: { days } })
    return res.data.data
  } catch (e) {
    logger.error('fetchDeviceHistory failed:', e)
    return []
  }
}

export async function probeDevice(mac) {
  logger.info(`probeDevice: ${mac}`)
  try {
    const res = await axios.post(`${API_BASE}/devices/${mac}/probe`)
    return res.data.data
  } catch (e) {
    logger.error('probeDevice failed:', e)
  }
}

export async function deepProbeDevice(mac) {
  logger.info(`deepProbeDevice: ${mac}`)
  try {
    const res = await axios.post(`${API_BASE}/devices/${mac}/deep-probe`)
    return res.data.data
  } catch (e) {
    logger.error('deepProbeDevice failed:', e)
  }
}

export async function fetchOnlineLookupEnabled() {
  try {
    const res = await axios.get(`${API_BASE}/online-lookup`)
    return res.data.data.enabled
  } catch (e) {
    logger.error('fetchOnlineLookupEnabled failed:', e)
    return false
  }
}

export async function setOnlineLookupEnabled(enabled) {
  try {
    const res = await axios.put(`${API_BASE}/online-lookup`, { enabled })
    return res.data.data.enabled
  } catch (e) {
    logger.error('setOnlineLookupEnabled failed:', e)
  }
}

export async function fetchAlertsEnabled() {
  try {
    const res = await axios.get(`${API_BASE}/alerts`)
    return res.data.data.enabled
  } catch (e) {
    logger.error('fetchAlertsEnabled failed:', e)
    return false
  }
}

export async function setAlertsEnabled(enabled) {
  try {
    const res = await axios.put(`${API_BASE}/alerts`, { enabled })
    return res.data.data.enabled
  } catch (e) {
    logger.error('setAlertsEnabled failed:', e)
  }
}

export async function triggerScan() {
  logger.info('triggerScan()')
  try {
    const res = await axios.post(`${API_BASE}/scan`)
    logger.info('triggerScan result:', res.data.data)
    return res.data
  } catch (e) {
    logger.error('triggerScan failed:', e)
  }
}

export async function fetchScanInterval() {
  try {
    const res = await axios.get(`${API_BASE}/scan-interval`)
    return res.data.data.minutes
  } catch (e) {
    logger.error('fetchScanInterval failed:', e)
    return 5
  }
}

export async function setScanInterval(minutes) {
  try {
    const res = await axios.put(`${API_BASE}/scan-interval`, { minutes })
    return res.data.data.minutes
  } catch (e) {
    logger.error('setScanInterval failed:', e)
  }
}

// v3: Device grouping

export async function updateDeviceGroup(mac, groupName) {
  try {
    const res = await axios.put(`${API_BASE}/devices/${mac}/group`, { group_name: groupName })
    return res.data.data
  } catch (e) {
    logger.error('updateDeviceGroup failed:', e)
  }
}

export async function bulkUpdateGroup(macs, groupName) {
  try {
    await axios.put(`${API_BASE}/devices/bulk/group`, { macs, group_name: groupName })
  } catch (e) {
    logger.error('bulkUpdateGroup failed:', e)
  }
}

export async function fetchGroups() {
  try {
    const res = await axios.get(`${API_BASE}/groups`)
    return res.data.data
  } catch (e) {
    logger.error('fetchGroups failed:', e)
    return []
  }
}

// v3: Ping history

export async function fetchPingHistory(mac, days = 7) {
  try {
    const res = await axios.get(`${API_BASE}/devices/${mac}/ping-history`, { params: { days } })
    return res.data.data
  } catch (e) {
    logger.error('fetchPingHistory failed:', e)
    return []
  }
}

// CVE scan

export async function triggerCveScan(mac) {
  logger.info(`triggerCveScan: ${mac}`)
  try {
    const res = await axios.post(`${API_BASE}/devices/${mac}/cve-scan`, {}, { timeout: 300000 })
    return res.data.data
  } catch (e) {
    logger.error('triggerCveScan failed:', e)
  }
}

export async function fetchDeviceCves(mac) {
  try {
    const res = await axios.get(`${API_BASE}/devices/${mac}/cves`)
    return res.data.data
  } catch (e) {
    logger.error('fetchDeviceCves failed:', e)
    return null
  }
}

// Phase 4: Topology

export async function fetchTopology() {
  try {
    const res = await axios.get(`${API_BASE}/topology`)
    return res.data.data
  } catch (e) {
    logger.error('fetchTopology failed:', e)
    return null
  }
}

// Phase 2: IP history

export async function fetchIpHistory(mac) {
  try {
    const res = await axios.get(`${API_BASE}/devices/${mac}/ip-history`)
    return res.data.data
  } catch (e) {
    logger.error('fetchIpHistory failed:', e)
    return []
  }
}

// Public IP

export async function fetchPublicIp() {
  try {
    const res = await axios.get(`${API_BASE}/public-ip`)
    return res.data.data
  } catch (e) {
    logger.error('fetchPublicIp failed:', e)
    return null
  }
}

// v3: Uptime

export async function fetchDeviceUptime(mac, days = 7) {
  try {
    const res = await axios.get(`${API_BASE}/devices/${mac}/uptime`, { params: { days } })
    return res.data.data
  } catch (e) {
    logger.error('fetchDeviceUptime failed:', e)
    return null
  }
}
