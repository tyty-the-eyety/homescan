from flask import Blueprint, jsonify, request, Response

from database import (
    get_all_devices,
    get_device_by_mac,
    update_device_nickname,
    mark_device_known,
    delete_device,
    get_stats,
    get_device_history,
    update_device_alert_setting,
    update_device_group,
    get_groups,
    get_ping_history,
    get_device_uptime,
    get_ip_history,
    update_device_cve,
    get_setting,
)
from scan_service import (
    perform_scan, get_alerts_enabled, set_alerts_enabled,
    run_probe_for_device, run_deep_probe_for_device,
    get_online_lookup_enabled, set_online_lookup_enabled,
    get_scan_interval, set_scan_interval,
    sse_subscribe, sse_unsubscribe,
)
from logger import get_logger

log = get_logger("api")

api = Blueprint("api", __name__, url_prefix="/api")


# --- SSE: real-time event stream ---

@api.route("/events")
def events():
    def stream():
        q = sse_subscribe()
        try:
            # Send initial heartbeat
            yield "event: connected\ndata: {}\n\n"
            while True:
                try:
                    event_type, payload = q.get(timeout=30)
                    yield f"event: {event_type}\ndata: {payload}\n\n"
                except Exception:
                    # Send keepalive every 30s
                    yield ": keepalive\n\n"
        except GeneratorExit:
            pass
        finally:
            sse_unsubscribe(q)

    return Response(stream(), mimetype="text/event-stream", headers={
        "Cache-Control": "no-cache",
        "X-Accel-Buffering": "no",
    })


# --- Healthcheck ---

@api.route("/health")
def health():
    return jsonify({"status": "ok"})


# --- Device read endpoints ---

@api.route("/devices")
def devices():
    log.debug("GET /devices")
    return jsonify({"success": True, "data": get_all_devices()})


@api.route("/devices/<mac>")
def device(mac):
    log.debug(f"GET /devices/{mac}")
    d = get_device_by_mac(mac)
    if d is None:
        log.warning(f"Device not found: {mac}")
        return jsonify({"success": False, "error": "Not found"}), 404
    return jsonify({"success": True, "data": d})


@api.route("/devices/<mac>/nickname", methods=["PUT"])
def nickname(mac):
    new_nickname = request.json.get("nickname", "")
    log.info(f"Nickname update: {mac} -> '{new_nickname}'")
    return jsonify({"success": True, "data": update_device_nickname(mac, new_nickname)})


@api.route("/devices/<mac>/known", methods=["PUT"])
def known(mac):
    is_known = 1 if request.json.get("is_known") else 0
    log.info(f"Known toggle: {mac} -> {bool(is_known)}")
    return jsonify({"success": True, "data": mark_device_known(mac, is_known)})


# --- Device management ---

@api.route("/devices/<mac>", methods=["DELETE"])
def remove_device(mac):
    log.info(f"Delete device: {mac}")
    delete_device(mac)
    return jsonify({"success": True})


@api.route("/devices/bulk/known", methods=["PUT"])
def bulk_known():
    macs = request.json.get("macs", [])
    is_known = 1 if request.json.get("is_known") else 0
    log.info(f"Bulk known update: {len(macs)} devices -> {bool(is_known)}")
    for mac in macs:
        mark_device_known(mac, is_known)
    return jsonify({"success": True, "updated": len(macs)})


@api.route("/devices/bulk/nickname", methods=["PUT"])
def bulk_nickname():
    macs = request.json.get("macs", [])
    nickname = request.json.get("nickname", "")
    log.info(f"Bulk rename: {len(macs)} devices -> '{nickname}'")
    for mac in macs:
        update_device_nickname(mac, nickname)
    return jsonify({"success": True, "updated": len(macs)})


# --- Per-device offline alert toggle ---

@api.route("/devices/<mac>/alert-offline", methods=["PUT"])
def alert_offline(mac):
    enabled = 1 if request.json.get("enabled") else 0
    log.info(f"Offline alert {'enabled' if enabled else 'disabled'} for {mac}")
    return jsonify({"success": True, "data": update_device_alert_setting(mac, enabled)})


# --- Device presence history ---

@api.route("/devices/<mac>/history")
def device_history(mac):
    days = int(request.args.get("days", 7))
    return jsonify({"success": True, "data": get_device_history(mac, days)})


# --- Device fingerprinting ---

@api.route("/devices/<mac>/probe", methods=["POST"])
def probe(mac):
    d = get_device_by_mac(mac)
    if d is None:
        return jsonify({"success": False, "error": "Not found"}), 404
    ip = d.get("ip_address")
    if not ip:
        return jsonify({"success": False, "error": "No IP address for device"}), 400
    log.info(f"Manual probe triggered for {mac} ({ip})")
    updated = run_probe_for_device(mac, ip)
    return jsonify({"success": True, "data": updated})


# --- CVE scan ---

@api.route("/devices/<mac>/cve-scan", methods=["POST"])
def cve_scan(mac):
    import json as _json
    from datetime import datetime as _dt
    from cve import scan_device_cves
    d = get_device_by_mac(mac)
    if d is None:
        return jsonify({"success": False, "error": "Not found"}), 404
    if not d.get("open_ports"):
        return jsonify({"success": False, "error": "No probe data — run a probe first"}), 400
    log.info(f"CVE scan triggered for {mac}")
    findings = scan_device_cves(d)
    updated = update_device_cve(mac, _json.dumps(findings), _dt.utcnow().isoformat())
    return jsonify({"success": True, "data": {"cves": findings, "device": updated}})


@api.route("/devices/<mac>/cves")
def get_cves(mac):
    import json as _json
    d = get_device_by_mac(mac)
    if d is None:
        return jsonify({"success": False, "error": "Not found"}), 404
    cves = []
    try:
        cves = _json.loads(d.get("cve_data") or "[]")
    except Exception:
        pass
    return jsonify({"success": True, "data": {"cves": cves, "cve_scan_at": d.get("cve_scan_at")}})


# --- Deep probe ---

@api.route("/devices/<mac>/deep-probe", methods=["POST"])
def deep_probe(mac):
    d = get_device_by_mac(mac)
    if d is None:
        return jsonify({"success": False, "error": "Not found"}), 404
    ip = d.get("ip_address")
    if not ip:
        return jsonify({"success": False, "error": "No IP address for device"}), 400
    log.info(f"Deep probe triggered for {mac} ({ip})")
    updated = run_deep_probe_for_device(mac, ip)
    return jsonify({"success": True, "data": updated})


# --- v3: Device grouping ---

@api.route("/devices/<mac>/group", methods=["PUT"])
def device_group(mac):
    group_name = request.json.get("group_name", "")
    log.info(f"Group update: {mac} -> '{group_name}'")
    return jsonify({"success": True, "data": update_device_group(mac, group_name)})


@api.route("/devices/bulk/group", methods=["PUT"])
def bulk_group():
    macs = request.json.get("macs", [])
    group_name = request.json.get("group_name", "")
    log.info(f"Bulk group update: {len(macs)} devices -> '{group_name}'")
    for mac in macs:
        update_device_group(mac, group_name)
    return jsonify({"success": True, "updated": len(macs)})


@api.route("/groups")
def groups():
    return jsonify({"success": True, "data": get_groups()})


# --- v3: Ping RTT history ---

@api.route("/devices/<mac>/ping-history")
def ping_history(mac):
    days = int(request.args.get("days", 7))
    return jsonify({"success": True, "data": get_ping_history(mac, days)})


# --- v3: Uptime ---

@api.route("/devices/<mac>/uptime")
def device_uptime(mac):
    days = int(request.args.get("days", 7))
    return jsonify({"success": True, "data": get_device_uptime(mac, days)})


# --- Phase 4: Network topology ---

def _detect_gateway() -> str:
    """Parse /proc/net/route to find default gateway IP."""
    try:
        with open("/proc/net/route") as f:
            for line in f.readlines()[1:]:
                parts = line.strip().split()
                if len(parts) >= 3 and parts[1] == "00000000":  # destination 0.0.0.0
                    # Gateway is hex little-endian
                    gw_hex = parts[2]
                    gw_int = int(gw_hex, 16)
                    return ".".join(str((gw_int >> (i * 8)) & 0xFF) for i in range(4))
    except Exception:
        pass
    return ""


@api.route("/topology")
def topology():
    devices = get_all_devices()
    gateway_ip = _detect_gateway()
    return jsonify({"success": True, "data": {
        "gateway_ip": gateway_ip,
        "devices": devices,
    }})


# --- Phase 2: IP history ---

@api.route("/devices/<mac>/ip-history")
def ip_history(mac):
    return jsonify({"success": True, "data": get_ip_history(mac)})


# --- Public IP ---

@api.route("/public-ip")
def public_ip():
    return jsonify({"success": True, "data": {
        "ip": get_setting("last_public_ip"),
        "last_check": get_setting("last_public_ip_check"),
        "enabled": get_online_lookup_enabled(),
    }})


# --- Online lookup toggle ---

@api.route("/online-lookup", methods=["GET"])
def online_lookup_status():
    return jsonify({"success": True, "data": {"enabled": get_online_lookup_enabled()}})


@api.route("/online-lookup", methods=["PUT"])
def online_lookup_toggle():
    enabled = bool(request.json.get("enabled"))
    set_online_lookup_enabled(enabled)
    return jsonify({"success": True, "data": {"enabled": get_online_lookup_enabled()}})


# --- Telegram alert toggle ---

@api.route("/alerts", methods=["GET"])
def alerts_status():
    return jsonify({"success": True, "data": {"enabled": get_alerts_enabled()}})


@api.route("/alerts", methods=["PUT"])
def alerts_toggle():
    enabled = bool(request.json.get("enabled"))
    set_alerts_enabled(enabled)
    log.info(f"Alerts toggled: {enabled}")
    return jsonify({"success": True, "data": {"enabled": get_alerts_enabled()}})


# --- Scan interval ---

@api.route("/scan-interval", methods=["GET"])
def scan_interval_get():
    return jsonify({"success": True, "data": {"minutes": get_scan_interval()}})


@api.route("/scan-interval", methods=["PUT"])
def scan_interval_set():
    minutes = int(request.json.get("minutes", 5))
    if minutes < 1:
        minutes = 1
    if minutes > 1440:
        minutes = 1440
    set_scan_interval(minutes)
    # Reschedule the job
    from server import reschedule_scan
    reschedule_scan(minutes)
    return jsonify({"success": True, "data": {"minutes": get_scan_interval()}})


# --- Scan trigger + stats ---

@api.route("/scan", methods=["POST"])
def scan():
    log.info("Manual scan triggered via API")
    return jsonify({"success": True, "data": perform_scan()})


@api.route("/stats")
def stats():
    log.debug("GET /stats")
    return jsonify({"success": True, "data": get_stats()})
