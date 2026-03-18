import re
import socket
import struct
import subprocess
import time
import xml.etree.ElementTree as ET

import requests
import urllib3
urllib3.disable_warnings(urllib3.exceptions.InsecureRequestWarning)
from logger import get_logger

log = get_logger("probe")

PORTS = "21,22,23,25,53,80,110,143,443,445,548,631,3306,3389,5900,8080,8443,9100"
DEEP_SCRIPTS = "banner,http-title,smb-os-discovery,ssh-hostkey,ssl-cert"


def probe_device(ip: str, mac: str = None, online_lookup: bool = False) -> dict:
    """Run all local probes + optional online MAC vendor lookup."""
    log.info(f"Probing {ip} (online_lookup={online_lookup})")
    result = {}

    # --- Local: ping TTL OS hint + RTT ---
    ping_data = _ping_ttl(ip)
    if ping_data.get("ttl_os_hint"):
        result["ttl_os_hint"] = ping_data["ttl_os_hint"]
        log.info(f"TTL hint for {ip}: {ping_data['ttl_os_hint']}")
    if ping_data.get("ping_ms") is not None:
        result["ping_ms"] = ping_data["ping_ms"]
        log.info(f"Ping RTT for {ip}: {ping_data['ping_ms']}ms")

    # --- Local: NetBIOS name ---
    netbios = _netbios_lookup(ip)
    if netbios:
        result["netbios_name"] = netbios
        log.info(f"NetBIOS name for {ip}: {netbios}")

    # --- Local: nmap port + OS scan ---
    nmap_data = _nmap_scan(ip)
    result.update(nmap_data)

    # --- Online: MAC vendor lookup ---
    if online_lookup and mac:
        vendor = _lookup_vendor(mac)
        if vendor:
            result["vendor"] = vendor
            log.info(f"Vendor for {mac}: {vendor}")

    # --- Local: HTTP banner ---
    http_data = _http_banner(ip)
    if http_data.get("http_title"):
        result["http_title"] = http_data["http_title"]
        log.info(f"HTTP title for {ip}: {http_data['http_title']}")

    # --- Local: SSDP ---
    ssdp_data = _ssdp_probe(ip)
    if ssdp_data.get("ssdp_server"):
        result["ssdp_server"] = ssdp_data["ssdp_server"]
        log.info(f"SSDP server for {ip}: {ssdp_data['ssdp_server']}")

    # --- Local: mDNS reverse lookup ---
    mdns_name = _mdns_lookup(ip)
    if mdns_name:
        result["mdns_name"] = mdns_name
        log.info(f"mDNS name for {ip}: {mdns_name}")

    # Final inference: combine all signals, may override port-only guess
    result["device_type"] = _infer_type_from_all(result)

    log.info(f"Probe complete for {ip}: ports={len(result.get('open_ports', []))}, "
             f"os='{result.get('os_guess', '')}', type='{result.get('device_type', '')}'")
    return result


# --- Deep probe (slow, manual only) ---

def deep_probe_device(ip: str, mac: str = None, online_lookup: bool = False) -> dict:
    """Full nmap -sV -O scan + NSE scripts + all fast probes. Takes 2-5 minutes."""
    from datetime import datetime as _dt
    log.info(f"Deep probing {ip}")
    result = {}

    # Run everything from the fast probe first
    ping_data = _ping_ttl(ip)
    if ping_data.get("ttl_os_hint"):
        result["ttl_os_hint"] = ping_data["ttl_os_hint"]
    if ping_data.get("ping_ms") is not None:
        result["ping_ms"] = ping_data["ping_ms"]

    netbios = _netbios_lookup(ip)
    if netbios:
        result["netbios_name"] = netbios

    # Deep nmap: service versions + OS fingerprint + NSE scripts, top 1024 ports
    nmap_data = _nmap_deep_scan(ip)
    result.update(nmap_data)

    http_data = _http_banner(ip)
    if http_data.get("http_title"):
        result["http_title"] = http_data["http_title"]

    ssdp_data = _ssdp_probe(ip)
    if ssdp_data.get("ssdp_server"):
        result["ssdp_server"] = ssdp_data["ssdp_server"]

    mdns_name = _mdns_lookup(ip)
    if mdns_name:
        result["mdns_name"] = mdns_name

    if online_lookup and mac:
        vendor = _lookup_vendor(mac)
        if vendor:
            result["vendor"] = vendor

    result["device_type"] = _infer_type_from_all(result)
    result["deep_scan_at"] = _dt.utcnow().isoformat()

    log.info(f"Deep probe complete for {ip}: ports={len(result.get('open_ports', []))}, "
             f"os='{result.get('os_guess', '')}', os_detail='{result.get('os_detail', '')}', "
             f"type='{result.get('device_type', '')}'")
    return result


def _nmap_deep_scan(ip: str) -> dict:
    """nmap with service detection, OS fingerprinting and NSE scripts over top 1024 ports."""
    try:
        result = subprocess.run(
            [
                "nmap", "-sT", "-sV", "-O", "--osscan-guess",
                "-Pn", "--open", "-T3",
                "--host-timeout", "300s",
                "--version-intensity", "5",
                "-p", "1-1024",
                "--script", DEEP_SCRIPTS,
                ip, "-oX", "-",
            ],
            capture_output=True, text=True, timeout=360,
        )
        if result.returncode != 0:
            log.warning(f"nmap deep exited {result.returncode} for {ip}: {result.stderr.strip()}")
            return {}
        return _parse_nmap_deep_xml(result.stdout)
    except FileNotFoundError:
        log.error("nmap not found")
        return {}
    except subprocess.TimeoutExpired:
        log.warning(f"nmap deep scan timed out for {ip}")
        return {}
    except Exception as e:
        log.error(f"nmap deep scan failed for {ip}: {e}")
        return {}


def _parse_nmap_deep_xml(xml_str: str) -> dict:
    """Parse nmap XML with service versions, OS matches, and script output."""
    try:
        root = ET.fromstring(xml_str)
        host = root.find("host")
        if host is None:
            return {}

        # --- Open ports with service versions ---
        open_ports = []
        script_notes = []
        ports_elem = host.find("ports")
        if ports_elem:
            for port in ports_elem.findall("port"):
                state = port.find("state")
                if state is None or state.get("state") != "open":
                    continue
                svc = port.find("service")
                name = svc.get("name", "") if svc is not None else ""
                product = svc.get("product", "") if svc is not None else ""
                version = svc.get("version", "") if svc is not None else ""
                extrainfo = svc.get("extrainfo", "") if svc is not None else ""
                ver_str = " ".join(filter(None, [product, version, extrainfo])).strip()
                open_ports.append({
                    "port": int(port.get("portid")),
                    "protocol": port.get("protocol", "tcp"),
                    "service": name,
                    "version": ver_str[:80] if ver_str else "",
                })
                # Collect interesting script output
                for script in port.findall("script"):
                    sid = script.get("id", "")
                    output = script.get("output", "").strip()
                    if output and sid in ("banner", "ssh-hostkey", "ssl-cert", "http-title"):
                        # Grab first line only
                        first = output.splitlines()[0].strip()
                        if first:
                            script_notes.append(f"{sid}: {first[:80]}")

        # --- OS detection ---
        os_detail = ""
        os_guess_str = ""
        os_elem = host.find("os")
        if os_elem is not None:
            matches = os_elem.findall("osmatch")
            if matches:
                best = max(matches, key=lambda m: int(m.get("accuracy", "0")))
                accuracy = best.get("accuracy", "")
                name = best.get("name", "")
                os_detail = f"{name} ({accuracy}% confidence)" if accuracy else name
                # Short version for os_guess field
                os_guess_str = name[:60] if name else ""

        # --- SMB OS info from script ---
        smb_info = ""
        hostscripts = host.find("hostscript")
        if hostscripts:
            for script in hostscripts.findall("script"):
                if script.get("id") == "smb-os-discovery":
                    output = script.get("output", "")
                    m = re.search(r"OS:\s*(.+)", output)
                    if m:
                        smb_info = m.group(1).strip()[:80]
                    # Prefer SMB OS over nmap guess for Windows
                    if smb_info and not os_detail:
                        os_detail = smb_info
                        os_guess_str = smb_info[:60]

        result = {
            "open_ports": open_ports,
            "os_guess": os_guess_str,
            "os_detail": os_detail,
            "device_type": "",
        }
        if script_notes:
            result["script_notes"] = script_notes[:6]
        return result

    except Exception as e:
        log.error(f"Failed to parse nmap deep XML: {e}")
        return {}


# --- Local probes ---

def _ping_ttl(ip: str) -> dict:
    """Ping device and guess OS family from TTL value. Also captures RTT."""
    try:
        result = subprocess.run(
            ["ping", "-c", "1", "-W", "1", ip],
            capture_output=True, text=True, timeout=5,
        )
        out = {"ttl_os_hint": "", "ping_ms": None}

        # Parse RTT
        rtt_match = re.search(r"time[=<]([\d.]+)\s*ms", result.stdout)
        if rtt_match:
            out["ping_ms"] = float(rtt_match.group(1))

        # Parse TTL
        match = re.search(r"ttl=(\d+)", result.stdout, re.IGNORECASE)
        if match:
            ttl = int(match.group(1))
            if ttl <= 64:
                out["ttl_os_hint"] = "Linux / Android"
            elif ttl <= 128:
                out["ttl_os_hint"] = "Windows"
            elif ttl <= 255:
                out["ttl_os_hint"] = "Cisco / Network device"

        return out
    except Exception as e:
        log.debug(f"ping TTL failed for {ip}: {e}")
    return {"ttl_os_hint": "", "ping_ms": None}


def _netbios_lookup(ip: str) -> str:
    """Query NetBIOS name using nmblookup (samba). Returns name or empty string."""
    try:
        result = subprocess.run(
            ["nmblookup", "-A", ip],
            capture_output=True, text=True, timeout=6,
        )
        for line in result.stdout.splitlines():
            # Lines look like: "    HOSTNAME         <00> -         B <ACTIVE>"
            match = re.match(r"^\s+(\S+)\s+<00>\s+-\s+[BM]\s+<ACTIVE>", line)
            if match:
                return match.group(1)
    except FileNotFoundError:
        log.debug("nmblookup not found — skipping NetBIOS lookup")
    except Exception as e:
        log.debug(f"NetBIOS lookup failed for {ip}: {e}")
    return ""


def _nmap_scan(ip: str) -> dict:
    """Run nmap TCP connect scan. Uses -sT (no service probing) for reliability with IoT/embedded devices."""
    try:
        result = subprocess.run(
            ["nmap", "-sT", "-Pn", "--open", "-T4", "--host-timeout", "30s", "-p", PORTS, ip, "-oX", "-"],
            capture_output=True, text=True, timeout=60,
        )
        if result.returncode != 0:
            log.warning(f"nmap exited {result.returncode} for {ip}: {result.stderr.strip()}")
            return {}
        return _parse_nmap_xml(result.stdout)
    except FileNotFoundError:
        log.error("nmap not found")
        return {}
    except subprocess.TimeoutExpired:
        log.warning(f"nmap timed out for {ip}")
        return {}
    except Exception as e:
        log.error(f"nmap failed for {ip}: {e}")
        return {}


def _parse_nmap_xml(xml_str: str) -> dict:
    try:
        root = ET.fromstring(xml_str)
        host = root.find("host")
        if host is None:
            return {}

        open_ports = []
        ports_elem = host.find("ports")
        if ports_elem:
            for port in ports_elem.findall("port"):
                state = port.find("state")
                if state is None or state.get("state") != "open":
                    continue
                svc = port.find("service")
                name = svc.get("name", "") if svc is not None else ""
                product = svc.get("product", "") if svc is not None else ""
                version = svc.get("version", "") if svc is not None else ""
                ver_str = " ".join(filter(None, [product, version])).strip()
                open_ports.append({
                    "port": int(port.get("portid")),
                    "protocol": port.get("protocol", "tcp"),
                    "service": name,
                    "version": ver_str,
                })

        device_type = _infer_type_from_ports(open_ports)

        return {"open_ports": open_ports, "os_guess": "", "device_type": device_type}
    except Exception as e:
        log.error(f"Failed to parse nmap XML: {e}")
        return {}


# --- Phase 3: Enhanced fingerprinting ---

def _http_banner(ip: str) -> dict:
    """Try HTTP/HTTPS on common ports, return page title or Server header."""
    for port in [80, 8080, 443, 8443]:
        scheme = "https" if port in (443, 8443) else "http"
        try:
            resp = requests.get(
                f"{scheme}://{ip}:{port}/",
                timeout=3,
                verify=False,
                headers={"User-Agent": "HomeScan/1.0"},
                allow_redirects=True,
            )
            title_m = re.search(r"<title[^>]*>([^<]{1,100})</title>", resp.text, re.IGNORECASE)
            title = title_m.group(1).strip() if title_m else ""
            server = resp.headers.get("Server", "")
            banner = title or server
            if banner:
                return {"http_title": banner[:100]}
        except Exception:
            pass
    return {}


def _ssdp_probe(ip: str) -> dict:
    """Send SSDP M-SEARCH multicast and collect any response from this specific IP."""
    MCAST = ("239.255.255.250", 1900)
    msg = (
        "M-SEARCH * HTTP/1.1\r\n"
        f"HOST: 239.255.255.250:1900\r\n"
        'MAN: "ssdp:discover"\r\n'
        "MX: 2\r\n"
        "ST: ssdp:all\r\n\r\n"
    ).encode()
    try:
        sock = socket.socket(socket.AF_INET, socket.SOCK_DGRAM, socket.IPPROTO_UDP)
        sock.settimeout(2)
        sock.sendto(msg, MCAST)
        deadline = time.time() + 2.5
        while time.time() < deadline:
            try:
                data, addr = sock.recvfrom(2048)
                if addr[0] == ip:
                    text = data.decode("utf-8", errors="ignore")
                    m = re.search(r"SERVER:\s*(.+)", text, re.IGNORECASE)
                    if m:
                        return {"ssdp_server": m.group(1).strip()[:120]}
            except socket.timeout:
                break
        sock.close()
    except Exception as e:
        log.debug(f"SSDP probe failed for {ip}: {e}")
    return {}


def _mdns_lookup(ip: str) -> str:
    """Send mDNS PTR query for reverse IP and extract .local hostname from response."""
    parts = ip.split(".")
    if len(parts) != 4:
        return ""
    rev_name = ".".join(reversed(parts)) + ".in-addr.arpa"

    def encode_name(name):
        out = b""
        for label in name.rstrip(".").split("."):
            out += bytes([len(label)]) + label.encode("ascii")
        return out + b"\x00"

    header = struct.pack(">HHHHHH", 0x1234, 0x0100, 1, 0, 0, 0)
    question = encode_name(rev_name) + struct.pack(">HH", 12, 1)  # PTR, IN
    query = header + question
    try:
        sock = socket.socket(socket.AF_INET, socket.SOCK_DGRAM)
        sock.settimeout(1.0)
        sock.sendto(query, ("224.0.0.251", 5353))
        data, _ = sock.recvfrom(512)
        # Extract .local name from raw response bytes
        text = data.decode("latin-1")
        m = re.search(r"([a-zA-Z0-9][a-zA-Z0-9\-]*)\.local", text, re.IGNORECASE)
        if m:
            return m.group(0).lower()
    except Exception:
        pass
    return ""


# --- Online probes ---

def _lookup_vendor(mac: str) -> str:
    """Look up MAC vendor via api.macvendors.com (requires internet)."""
    try:
        response = requests.get(
            f"https://api.macvendors.com/{mac}",
            timeout=5,
            headers={"Accept": "text/plain"},
        )
        if response.status_code == 200:
            return response.text.strip()
    except Exception as e:
        log.warning(f"Vendor lookup failed for {mac}: {e}")
    return ""


# --- Inference helpers ---

def _infer_type_from_all(result: dict) -> str:
    """Combine all probe signals to guess device type, richest signals first."""
    # 1. HTTP title — most descriptive
    title = (result.get("http_title") or "").lower()
    if any(k in title for k in ["router", "gateway", "openwrt", "dd-wrt", "luci", "linksys", "netgear", "tp-link", "asus router", "draytek", "mikrotik", "ubiquiti"]):
        return "Router / Gateway"
    if any(k in title for k in ["camera", "cam", "nvr", "dvr", "ipcam"]):
        return "IP Camera"
    if any(k in title for k in ["nas", "synology", "qnap", "diskstation", "freenas", "truenas"]):
        return "NAS"
    if any(k in title for k in ["printer", "laserjet", "pixma", "epson", "workcentre"]):
        return "Printer"
    if any(k in title for k in ["esphome", "tasmota", "wled", "shelly", "home assistant"]):
        return "Smart Home / IoT"
    if any(k in title for k in ["plex", "kodi", "emby", "jellyfin"]):
        return "Media Server"
    # 2. SSDP server string
    ssdp = (result.get("ssdp_server") or "").lower()
    if any(k in ssdp for k in ["plex", "kodi", "emby", "jellyfin", "dlna"]):
        return "Media Server"
    if any(k in ssdp for k in ["upnp", "igd"]):
        return "Network device"
    # 3. MAC vendor
    vendor_type = _infer_type_from_vendor(result.get("vendor", ""))
    if vendor_type:
        return vendor_type
    # 4. Port-based (least specific)
    return _infer_type_from_ports(result.get("open_ports", []))


def _infer_type_from_ports(open_ports: list) -> str:
    ports = {p["port"] for p in open_ports}
    if 3389 in ports:
        return "Windows PC"
    if 548 in ports:
        return "Apple device"
    if 9100 in ports or 631 in ports:
        return "Printer"
    if 23 in ports:
        return "Network device"
    if 80 in ports or 443 in ports or 8080 in ports or 8443 in ports:
        return "Web server"
    if 22 in ports:
        return "Linux / Unix"
    return ""


def _infer_type_from_vendor(vendor: str) -> str:
    v = vendor.lower()
    if any(k in v for k in ["apple"]):
        return "Apple device"
    if any(k in v for k in ["samsung", "sony", "lg electronics", "huawei", "xiaomi", "oneplus"]):
        return "Mobile / TV"
    if any(k in v for k in ["raspberry", "arduino"]):
        return "Raspberry Pi / IoT"
    if any(k in v for k in ["cisco", "ubiquiti", "netgear", "tp-link", "asus", "d-link", "zyxel", "mikrotik"]):
        return "Network device"
    if any(k in v for k in ["hewlett", "canon", "epson", "brother", "xerox", "lexmark"]):
        return "Printer"
    if any(k in v for k in ["intel", "dell", "lenovo", "hp", "acer", "asus", "gigabyte", "microsoft"]):
        return "PC / Laptop"
    return ""
