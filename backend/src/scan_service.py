import json
import os
import threading
from dotenv import load_dotenv

load_dotenv()

from scanner import scan_network
from database import (
    add_device, update_last_seen, get_device_by_mac, get_all_devices,
    update_device_probe, log_device_status, update_device_status,
    get_setting, set_setting, get_stats, log_ping, cleanup_ping_history,
    log_ip_change,
)
from telegram import send_alert, format_new_device_alert, format_offline_alert, format_public_ip_alert
from probe import probe_device, deep_probe_device
from logger import get_logger

log = get_logger("scan_service")


# --- SSE event broadcast ---

_sse_listeners = []
_sse_lock = threading.Lock()


def sse_subscribe():
    """Return a new queue for an SSE client."""
    import queue
    q = queue.Queue(maxsize=50)
    with _sse_lock:
        _sse_listeners.append(q)
    return q


def sse_unsubscribe(q):
    with _sse_lock:
        try:
            _sse_listeners.remove(q)
        except ValueError:
            pass


def _broadcast(event_type, data):
    """Send an SSE event to all connected clients."""
    payload = json.dumps(data)
    with _sse_lock:
        dead = []
        for q in _sse_listeners:
            try:
                q.put_nowait((event_type, payload))
            except Exception:
                dead.append(q)
        for q in dead:
            try:
                _sse_listeners.remove(q)
            except ValueError:
                pass


# --- Persistent settings (stored in DB, loaded on first access) ---

def get_alerts_enabled() -> bool:
    return get_setting("alerts_enabled", "false") == "true"


def set_alerts_enabled(enabled: bool):
    set_setting("alerts_enabled", "true" if enabled else "false")
    log.info(f"Alerts {'enabled' if enabled else 'disabled'}")


def get_online_lookup_enabled() -> bool:
    return get_setting("online_lookup_enabled", "false") == "true"


def set_online_lookup_enabled(enabled: bool):
    set_setting("online_lookup_enabled", "true" if enabled else "false")
    log.info(f"Online lookup {'enabled' if enabled else 'disabled'}")


def get_scan_interval() -> int:
    return int(get_setting("scan_interval_minutes", os.environ.get("SCAN_INTERVAL_MINUTES", "5")))


def set_scan_interval(minutes: int):
    set_setting("scan_interval_minutes", str(minutes))
    log.info(f"Scan interval set to {minutes} minutes")


# --- Core scan loop ---

def perform_scan():
    network_interface = os.environ.get("NETWORK_INTERFACE", "192.168.1.0/24")
    log.info(f"Performing scan on {network_interface}")

    _broadcast("scan_start", {"status": "scanning"})

    discovered = scan_network(network_interface)
    log.info(f"Discovered {len(discovered)} devices")

    new_devices = []
    updated = 0
    alerts_on = get_alerts_enabled()

    for device in discovered:
        mac = device["mac"]
        ip = device["ip"]
        hostname = device["hostname"]

        existing = get_device_by_mac(mac)
        if existing is None:
            added = add_device(mac, ip, hostname)
            new_devices.append(added)
            log.info(f"New device: {mac} ({ip}) [{hostname}]")
            log_device_status(mac, 'online', ip)
            update_device_status(mac, 'online')
            if alerts_on:
                send_alert(format_new_device_alert(added))
                log.debug(f"Telegram alert sent for: {mac}")
            else:
                log.debug(f"Alert suppressed (alerts disabled) for: {mac}")
            # Background probe for new devices
            threading.Thread(target=_run_probe, args=(mac, ip), daemon=True).start()
        else:
            # Detect IP change
            old_ip = existing.get('ip_address')
            if old_ip and old_ip != ip:
                log.info(f"IP change: {mac} {old_ip} -> {ip}")
                log_ip_change(mac, old_ip, ip)
            update_last_seen(mac, ip, hostname)
            updated += 1
            if existing.get('last_status') != 'online':
                log.info(f"Device back online: {mac} ({ip})")
                log_device_status(mac, 'online', ip)
                update_device_status(mac, 'online')
            log.debug(f"Updated last_seen: {mac} ({ip})")

    # Detect devices that didn't appear in this scan -> mark offline
    found_macs = {d['mac'] for d in discovered}
    for device in get_all_devices():
        if device['mac_address'] not in found_macs and device.get('last_status') != 'offline':
            log.info(f"Device went offline: {device['mac_address']}")
            log_device_status(device['mac_address'], 'offline')
            update_device_status(device['mac_address'], 'offline')
            if alerts_on and device.get('alert_on_offline'):
                send_alert(format_offline_alert(device))
                log.info(f"Offline alert sent for: {device['mac_address']}")

    result = {
        "scanned": len(discovered),
        "new": len(new_devices),
        "updated": updated,
        "new_devices": new_devices,
    }
    log.info(f"Scan complete: {result['scanned']} scanned, {result['new']} new, {result['updated']} updated")

    # Check public IP (only if online lookup enabled)
    if get_online_lookup_enabled():
        try:
            check_public_ip(alerts_on)
        except Exception as e:
            log.warning(f"Public IP check failed: {e}")

    # Cleanup old ping history (retain 90 days)
    try:
        cleanup_ping_history(90)
    except Exception:
        pass

    # Broadcast scan complete with fresh stats + devices
    _broadcast("scan_complete", {
        "result": result,
        "stats": get_stats(),
        "devices": get_all_devices(),
    })

    return result


# --- Public IP check ---

def check_public_ip(alerts_on: bool = False):
    """Fetch public IP, store in settings, alert if changed."""
    import requests as _requests
    ip = None
    for url in ["https://api.ipify.org", "https://ifconfig.me"]:
        try:
            resp = _requests.get(url, timeout=5, headers={"Accept": "text/plain"})
            if resp.status_code == 200:
                ip = resp.text.strip()
                break
        except Exception:
            continue
    if not ip:
        return

    from datetime import datetime as _dt
    now = _dt.utcnow().isoformat()
    old_ip = get_setting("last_public_ip")
    set_setting("last_public_ip", ip)
    set_setting("last_public_ip_check", now)

    if old_ip and old_ip != ip:
        log.info(f"Public IP changed: {old_ip} -> {ip}")
        _broadcast("public_ip_changed", {"old_ip": old_ip, "new_ip": ip})
        if alerts_on:
            send_alert(format_public_ip_alert(old_ip, ip))
    else:
        log.debug(f"Public IP: {ip}")


# --- Device fingerprinting (probe) ---

def run_probe_for_device(mac: str, ip: str) -> dict:
    """Run probe synchronously and persist results. Returns updated device."""
    data = probe_device(ip, mac=mac, online_lookup=get_online_lookup_enabled())
    if data:
        open_ports_json = json.dumps(data.get("open_ports", []))
        ping_ms = data.get("ping_ms")
        update_device_probe(
            mac,
            open_ports_json,
            data.get("os_guess", ""),
            data.get("device_type", ""),
            data.get("vendor"),
            data.get("netbios_name"),
            data.get("ttl_os_hint"),
            ping_ms=ping_ms,
            mdns_name=data.get("mdns_name"),
            ssdp_server=data.get("ssdp_server"),
            http_title=data.get("http_title"),
        )
        if ping_ms is not None:
            log_ping(mac, ping_ms)
    device = get_device_by_mac(mac)
    _broadcast("probe_complete", {"mac": mac, "device": device})
    return device


def _run_probe(mac: str, ip: str):
    """Background thread target -- called automatically for new devices."""
    try:
        run_probe_for_device(mac, ip)
        log.info(f"Background probe complete for {mac}")
    except Exception as e:
        log.error(f"Background probe failed for {mac}: {e}")


def run_deep_probe_for_device(mac: str, ip: str) -> dict:
    """Run deep probe (slow) synchronously and persist results. Returns updated device."""
    data = deep_probe_device(ip, mac=mac, online_lookup=get_online_lookup_enabled())
    if data:
        open_ports_json = json.dumps(data.get("open_ports", []))
        ping_ms = data.get("ping_ms")
        update_device_probe(
            mac,
            open_ports_json,
            data.get("os_guess", ""),
            data.get("device_type", ""),
            data.get("vendor"),
            data.get("netbios_name"),
            data.get("ttl_os_hint"),
            ping_ms=ping_ms,
            mdns_name=data.get("mdns_name"),
            ssdp_server=data.get("ssdp_server"),
            http_title=data.get("http_title"),
            os_detail=data.get("os_detail"),
            deep_scan_at=data.get("deep_scan_at"),
        )
        if ping_ms is not None:
            log_ping(mac, ping_ms)
    device = get_device_by_mac(mac)
    _broadcast("probe_complete", {"mac": mac, "device": device, "deep": True})
    return device


# --- Unknown device helper ---

def get_unknown_devices():
    return [d for d in get_all_devices() if d["is_known"] == 0]
