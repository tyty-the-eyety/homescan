import sqlite3
import threading
from datetime import datetime, date, timedelta

import os
DB_PATH = os.environ.get("DB_PATH", "homescan.db")

conn = None
_lock = threading.Lock()


# --- INCREMENT 2: Database initialisation ---

def init_database():
    global conn
    conn = sqlite3.connect(DB_PATH, check_same_thread=False)
    conn.row_factory = sqlite3.Row
    # Core schema — INCREMENT 2
    conn.execute("""
        CREATE TABLE IF NOT EXISTS devices (
            id           INTEGER PRIMARY KEY AUTOINCREMENT,
            mac_address  TEXT UNIQUE NOT NULL,
            ip_address   TEXT,
            hostname     TEXT,
            vendor       TEXT,
            nickname     TEXT,
            is_known     INTEGER DEFAULT 0,
            first_seen   TEXT,
            last_seen    TEXT,
            created_at   TEXT DEFAULT CURRENT_TIMESTAMP
        )
    """)
    conn.commit()
    # INCREMENT 10: Probe columns — migration safe
    for col, coldef in [
        ("open_ports", "TEXT"), ("os_guess", "TEXT"), ("device_type", "TEXT"),
        ("netbios_name", "TEXT"), ("ttl_os_hint", "TEXT"),
    ]:
        try:
            conn.execute(f"ALTER TABLE devices ADD COLUMN {col} {coldef}")
            conn.commit()
        except sqlite3.OperationalError:
            pass  # column already exists

    # INCREMENT 10: Presence tracking — last known status per device
    for col, coldef in [
        ("last_status",      "TEXT DEFAULT 'online'"),
        ("alert_on_offline", "INTEGER DEFAULT 0"),
    ]:
        try:
            conn.execute(f"ALTER TABLE devices ADD COLUMN {col} {coldef}")
            conn.commit()
        except sqlite3.OperationalError:
            pass

    # Phase 3: Enhanced fingerprint columns
    for col, coldef in [
        ("mdns_name",    "TEXT"),
        ("ssdp_server",  "TEXT"),
        ("http_title",   "TEXT"),
        ("os_detail",    "TEXT"),
        ("deep_scan_at", "TEXT"),
        ("cve_data",     "TEXT"),
        ("cve_scan_at",  "TEXT"),
    ]:
        try:
            conn.execute(f"ALTER TABLE devices ADD COLUMN {col} {coldef}")
            conn.commit()
        except sqlite3.OperationalError:
            pass

    # v3: Group name + ping RTT columns
    for col, coldef in [
        ("group_name",   "TEXT DEFAULT ''"),
        ("last_ping_ms", "REAL"),
    ]:
        try:
            conn.execute(f"ALTER TABLE devices ADD COLUMN {col} {coldef}")
            conn.commit()
        except sqlite3.OperationalError:
            pass

    # INCREMENT 10: Device presence log — one row per status change
    conn.execute("""
        CREATE TABLE IF NOT EXISTS device_logs (
            id          INTEGER PRIMARY KEY AUTOINCREMENT,
            mac_address TEXT NOT NULL,
            status      TEXT NOT NULL,
            timestamp   TEXT NOT NULL,
            ip_address  TEXT
        )
    """)
    conn.execute("CREATE INDEX IF NOT EXISTS idx_device_logs_mac ON device_logs (mac_address)")
    conn.execute("CREATE INDEX IF NOT EXISTS idx_device_logs_ts  ON device_logs (timestamp)")
    conn.commit()

    # v2: Persistent settings table (key-value)
    conn.execute("""
        CREATE TABLE IF NOT EXISTS settings (
            key   TEXT PRIMARY KEY,
            value TEXT NOT NULL
        )
    """)
    conn.commit()

    # v4: IP history table
    conn.execute("""
        CREATE TABLE IF NOT EXISTS ip_history (
            id          INTEGER PRIMARY KEY AUTOINCREMENT,
            mac_address TEXT NOT NULL,
            old_ip      TEXT,
            new_ip      TEXT NOT NULL,
            timestamp   TEXT NOT NULL
        )
    """)
    conn.execute("CREATE INDEX IF NOT EXISTS idx_ip_history_mac ON ip_history (mac_address)")
    conn.commit()

    # v3: Ping history table
    conn.execute("""
        CREATE TABLE IF NOT EXISTS ping_history (
            id          INTEGER PRIMARY KEY AUTOINCREMENT,
            mac_address TEXT NOT NULL,
            ping_ms     REAL NOT NULL,
            timestamp   TEXT NOT NULL
        )
    """)
    conn.execute("CREATE INDEX IF NOT EXISTS idx_ping_history_mac ON ping_history (mac_address)")
    conn.execute("CREATE INDEX IF NOT EXISTS idx_ping_history_ts  ON ping_history (timestamp)")
    conn.commit()

    return conn


# --- v2: Persistent settings ---

def get_setting(key, default=None):
    with _lock:
        cursor = conn.execute("SELECT value FROM settings WHERE key = ?", (key,))
        row = cursor.fetchone()
        return row[0] if row else default


def set_setting(key, value):
    with _lock:
        conn.execute(
            "INSERT INTO settings (key, value) VALUES (?, ?) ON CONFLICT(key) DO UPDATE SET value = ?",
            (key, str(value), str(value)),
        )
        conn.commit()


def _row_to_dict(row):
    return dict(row) if row else None


# --- INCREMENT 2: Core CRUD ---

def add_device(mac, ip, hostname):
    now = datetime.utcnow().isoformat()
    with _lock:
        conn.execute("""
            INSERT OR IGNORE INTO devices (mac_address, ip_address, hostname, first_seen, last_seen)
            VALUES (?, ?, ?, ?, ?)
        """, (mac, ip, hostname, now, now))
        conn.commit()
        return _get_device_by_mac_unlocked(mac)


def update_last_seen(mac, ip, hostname):
    now = datetime.utcnow().isoformat()
    with _lock:
        conn.execute("""
            UPDATE devices
            SET ip_address = ?, hostname = ?, last_seen = ?
            WHERE mac_address = ?
        """, (ip, hostname, now, mac))
        conn.commit()


def get_all_devices():
    with _lock:
        cursor = conn.execute("SELECT * FROM devices ORDER BY last_seen DESC")
        return [_row_to_dict(row) for row in cursor.fetchall()]


def _get_device_by_mac_unlocked(mac):
    """Internal: caller must hold _lock."""
    cursor = conn.execute("SELECT * FROM devices WHERE mac_address = ?", (mac,))
    return _row_to_dict(cursor.fetchone())


def get_device_by_mac(mac):
    with _lock:
        return _get_device_by_mac_unlocked(mac)


# --- INCREMENT 7: Nickname + known status ---

def update_device_nickname(mac, nickname):
    with _lock:
        conn.execute("UPDATE devices SET nickname = ? WHERE mac_address = ?", (nickname, mac))
        conn.commit()
        return _get_device_by_mac_unlocked(mac)


def mark_device_known(mac, is_known):
    with _lock:
        conn.execute("UPDATE devices SET is_known = ? WHERE mac_address = ?", (is_known, mac))
        conn.commit()
        return _get_device_by_mac_unlocked(mac)


# --- INCREMENT 10: Probe results ---

def update_device_probe(mac, open_ports_json, os_guess, device_type, vendor=None, netbios_name=None, ttl_os_hint=None, ping_ms=None, mdns_name=None, ssdp_server=None, http_title=None, os_detail=None, deep_scan_at=None):
    fields = "open_ports = ?, os_guess = ?, device_type = ?, netbios_name = ?, ttl_os_hint = ?"
    params = [open_ports_json, os_guess, device_type, netbios_name, ttl_os_hint]
    if vendor:
        fields += ", vendor = ?"
        params.append(vendor)
    if ping_ms is not None:
        fields += ", last_ping_ms = ?"
        params.append(ping_ms)
    if mdns_name is not None:
        fields += ", mdns_name = ?"
        params.append(mdns_name)
    if ssdp_server is not None:
        fields += ", ssdp_server = ?"
        params.append(ssdp_server)
    if http_title is not None:
        fields += ", http_title = ?"
        params.append(http_title)
    if os_detail is not None:
        fields += ", os_detail = ?"
        params.append(os_detail)
    if deep_scan_at is not None:
        fields += ", deep_scan_at = ?"
        params.append(deep_scan_at)
    params.append(mac)
    with _lock:
        conn.execute(f"UPDATE devices SET {fields} WHERE mac_address = ?", params)
        conn.commit()
        return _get_device_by_mac_unlocked(mac)


# --- INCREMENT 10: Presence tracking ---

def update_device_alert_setting(mac, alert_on_offline):
    with _lock:
        conn.execute("UPDATE devices SET alert_on_offline = ? WHERE mac_address = ?", (alert_on_offline, mac))
        conn.commit()
        return _get_device_by_mac_unlocked(mac)


def update_device_status(mac, status):
    """Update the current online/offline status on the device row."""
    with _lock:
        conn.execute("UPDATE devices SET last_status = ? WHERE mac_address = ?", (status, mac))
        conn.commit()


def log_device_status(mac, status, ip=None):
    """Append a status-change event to device_logs."""
    with _lock:
        conn.execute(
            "INSERT INTO device_logs (mac_address, status, timestamp, ip_address) VALUES (?, ?, ?, ?)",
            (mac, status, datetime.utcnow().isoformat(), ip),
        )
        conn.commit()


def get_device_history(mac, days=7):
    """Return log entries for a device over the last N days, oldest first."""
    since = (datetime.utcnow() - timedelta(days=days)).isoformat()
    with _lock:
        cursor = conn.execute(
            "SELECT * FROM device_logs WHERE mac_address = ? AND timestamp >= ? ORDER BY timestamp ASC",
            (mac, since),
        )
        return [_row_to_dict(r) for r in cursor.fetchall()]


# --- INCREMENT 8: Delete device ---

def delete_device(mac):
    with _lock:
        conn.execute("DELETE FROM devices WHERE mac_address = ?", (mac,))
        conn.execute("DELETE FROM device_logs WHERE mac_address = ?", (mac,))
        conn.execute("DELETE FROM ping_history WHERE mac_address = ?", (mac,))
        conn.execute("DELETE FROM ip_history WHERE mac_address = ?", (mac,))
        conn.commit()


# --- INCREMENT 7: Stats summary ---

def get_stats():
    today = date.today().isoformat()
    with _lock:
        total   = conn.execute("SELECT COUNT(*) FROM devices").fetchone()[0]
        known   = conn.execute("SELECT COUNT(*) FROM devices WHERE is_known = 1").fetchone()[0]
        unknown = conn.execute("SELECT COUNT(*) FROM devices WHERE is_known = 0").fetchone()[0]
        new_today = conn.execute(
            "SELECT COUNT(*) FROM devices WHERE first_seen LIKE ?", (f"{today}%",)
        ).fetchone()[0]
        online  = conn.execute("SELECT COUNT(*) FROM devices WHERE last_status = 'online'").fetchone()[0]
        offline = conn.execute("SELECT COUNT(*) FROM devices WHERE last_status = 'offline'").fetchone()[0]
    return {
        "total": total, "known": known, "unknown": unknown,
        "new_today": new_today, "online": online, "offline": offline,
    }


# --- v4: IP history ---

def log_ip_change(mac, old_ip, new_ip):
    with _lock:
        conn.execute(
            "INSERT INTO ip_history (mac_address, old_ip, new_ip, timestamp) VALUES (?, ?, ?, ?)",
            (mac, old_ip, new_ip, datetime.utcnow().isoformat()),
        )
        conn.commit()


def get_ip_history(mac):
    with _lock:
        cursor = conn.execute(
            "SELECT old_ip, new_ip, timestamp FROM ip_history WHERE mac_address = ? ORDER BY timestamp DESC LIMIT 20",
            (mac,),
        )
        return [_row_to_dict(r) for r in cursor.fetchall()]


# --- v3: Device grouping ---

def update_device_group(mac, group_name):
    with _lock:
        conn.execute("UPDATE devices SET group_name = ? WHERE mac_address = ?", (group_name, mac))
        conn.commit()
        return _get_device_by_mac_unlocked(mac)


def get_groups():
    with _lock:
        cursor = conn.execute("SELECT DISTINCT group_name FROM devices WHERE group_name != '' ORDER BY group_name")
        return [row[0] for row in cursor.fetchall()]


# --- v3: Ping RTT tracking ---

def log_ping(mac, ping_ms):
    with _lock:
        conn.execute(
            "INSERT INTO ping_history (mac_address, ping_ms, timestamp) VALUES (?, ?, ?)",
            (mac, ping_ms, datetime.utcnow().isoformat()),
        )
        conn.commit()


def get_ping_history(mac, days=7):
    since = (datetime.utcnow() - timedelta(days=days)).isoformat()
    with _lock:
        cursor = conn.execute(
            "SELECT ping_ms, timestamp FROM ping_history WHERE mac_address = ? AND timestamp >= ? ORDER BY timestamp ASC",
            (mac, since),
        )
        return [_row_to_dict(r) for r in cursor.fetchall()]


def cleanup_ping_history(retention_days=90):
    cutoff = (datetime.utcnow() - timedelta(days=retention_days)).isoformat()
    with _lock:
        conn.execute("DELETE FROM ping_history WHERE timestamp < ?", (cutoff,))
        conn.commit()


# --- v3: Uptime calculation ---

def get_device_uptime(mac, days=7):
    """Calculate uptime percentage from device_logs over the given period."""
    now = datetime.utcnow()
    window_ms = days * 86400 * 1000
    window_start = now - timedelta(days=days)

    events = get_device_history(mac, days)
    if not events:
        # No events — check current status
        device = get_device_by_mac(mac)
        if device and device.get('last_status') == 'online':
            return {"uptime_pct": 100.0, "outages": 0}
        return {"uptime_pct": 0.0, "outages": 0}

    online_ms = 0
    prev_ts = window_start.timestamp() * 1000
    # Before first event, infer opposite status
    prev_status = 'offline' if events[0]['status'] == 'online' else 'online'

    for e in events:
        ts = datetime.fromisoformat(e['timestamp']).timestamp() * 1000
        if prev_status == 'online':
            online_ms += max(0, ts - prev_ts)
        prev_ts = ts
        prev_status = e['status']

    # From last event to now
    now_ms = now.timestamp() * 1000
    if prev_status == 'online':
        online_ms += max(0, now_ms - prev_ts)

    uptime_pct = round((online_ms / window_ms) * 100, 1) if window_ms > 0 else 0
    outages = sum(1 for e in events if e['status'] == 'offline')

    return {"uptime_pct": min(uptime_pct, 100.0), "outages": outages}


# --- CVE scan results ---

def update_device_cve(mac, cve_data_json, cve_scan_at):
    with _lock:
        conn.execute(
            "UPDATE devices SET cve_data = ?, cve_scan_at = ? WHERE mac_address = ?",
            (cve_data_json, cve_scan_at, mac),
        )
        conn.commit()
        return _get_device_by_mac_unlocked(mac)
