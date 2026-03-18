import subprocess
import re

from logger import get_logger

log = get_logger("scanner")


def parse_arp_output(output):
    devices = []
    for line in output.splitlines():
        match = re.match(r'^(\d+\.\d+\.\d+\.\d+)\s+([\da-fA-F:]{17})\s*(.*)', line)
        if match:
            ip, mac, hostname = match.groups()
            devices.append({
                "ip": ip.strip(),
                "mac": mac.strip().lower(),
                "hostname": hostname.strip() or "unknown"
            })
    log.debug(f"Parsed {len(devices)} devices from arp output")
    return devices


def scan_network(network_range):
    log.info(f"Starting arp-scan on {network_range}")
    try:
        result = subprocess.run(
            ["arp-scan", "--localnet"],
            capture_output=True,
            text=True,
            timeout=30
        )
        log.debug(f"arp-scan exit code: {result.returncode}")
        if result.stderr:
            log.debug(f"arp-scan stderr: {result.stderr.strip()}")
        devices = parse_arp_output(result.stdout)
        log.info(f"arp-scan complete: {len(devices)} devices found")
        return devices
    except subprocess.TimeoutExpired:
        log.error("arp-scan timed out after 30s")
        return []
    except FileNotFoundError:
        log.error("arp-scan not found — install with: sudo apt install arp-scan")
        return []
    except Exception as e:
        log.error(f"Scan error: {e}")
        return []
