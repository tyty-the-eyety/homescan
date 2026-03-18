import json
import re
import time

import requests
from logger import get_logger

log = get_logger("cve")

NVD_URL = "https://services.nvd.nist.gov/rest/json/cves/2.0"
# 0.7s between requests stays safely under the 5 req/30s unauthenticated limit
_RATE_DELAY = 0.7


def _parse_search_term(version_str: str):
    """
    Extract a search-friendly (product, version) pair from an nmap version string.

    Examples:
      "lighttpd 1.4.39"              -> ("lighttpd", "1.4.39")
      "OpenSSH 8.9p1 Ubuntu 3u..."   -> ("openssh", "8.9p1")
      "dnsmasq 2.85"                 -> ("dnsmasq", "2.85")
      "nginx"                        -> None  (no version)
      "Microsoft Windows RPC"        -> None  (no digit-led version token)
    """
    if not version_str:
        return None
    parts = version_str.strip().split()
    if len(parts) < 2:
        return None
    product = parts[0].lower()
    version = parts[1]
    # Version token must start with a digit
    if not re.match(r"\d", version):
        return None
    return product, version


def _query_nvd(keyword: str, max_results: int = 8) -> list:
    """Query NVD CVE API v2 for a keyword. Returns list of CVE dicts."""
    try:
        resp = requests.get(
            NVD_URL,
            params={"keywordSearch": keyword, "resultsPerPage": max_results, "noRejected": ""},
            timeout=15,
            headers={"User-Agent": "HomeScan/1.0"},
        )
        if resp.status_code == 403:
            log.warning("NVD API rate limited")
            return []
        if resp.status_code != 200:
            log.warning(f"NVD API returned {resp.status_code} for '{keyword}'")
            return []

        results = []
        for item in resp.json().get("vulnerabilities", []):
            cve = item.get("cve", {})
            cve_id = cve.get("id", "")

            # English description
            description = next(
                (d["value"] for d in cve.get("descriptions", []) if d["lang"] == "en"),
                "",
            )

            # CVSS score — prefer v3.1 > v3.0 > v2
            metrics = cve.get("metrics", {})
            score = None
            severity = ""
            if "cvssMetricV31" in metrics:
                m = metrics["cvssMetricV31"][0]["cvssData"]
                score, severity = m.get("baseScore"), m.get("baseSeverity", "")
            elif "cvssMetricV30" in metrics:
                m = metrics["cvssMetricV30"][0]["cvssData"]
                score, severity = m.get("baseScore"), m.get("baseSeverity", "")
            elif "cvssMetricV2" in metrics:
                m = metrics["cvssMetricV2"][0]
                score = m["cvssData"].get("baseScore")
                severity = m.get("baseSeverity", "")

            results.append({
                "cve_id": cve_id,
                "severity": severity.upper() if severity else "UNKNOWN",
                "score": score,
                "description": description[:200],
                "published": cve.get("published", "")[:10],
                "url": f"https://nvd.nist.gov/vuln/detail/{cve_id}",
            })

        # Sort highest score first
        results.sort(key=lambda c: c.get("score") or 0, reverse=True)
        return results

    except requests.Timeout:
        log.warning(f"NVD API timed out for '{keyword}'")
    except Exception as e:
        log.warning(f"NVD query failed for '{keyword}': {e}")
    return []


def scan_device_cves(device: dict) -> list:
    """
    Extract service versions from a device's open_ports + os_detail,
    query NVD for each, and return a deduplicated list of CVE findings.
    Each finding includes the source service it came from.
    """
    open_ports = []
    try:
        open_ports = json.loads(device.get("open_ports") or "[]")
    except Exception:
        pass

    # Build list of (search_keyword, label) pairs, deduplicated by keyword
    queries = {}
    for p in open_ports:
        version_str = (p.get("version") or "").strip()
        parsed = _parse_search_term(version_str)
        if not parsed:
            continue
        product, version = parsed
        keyword = f"{product} {version}"
        if keyword not in queries:
            label = version_str.split()
            queries[keyword] = " ".join(label[:2])  # "lighttpd 1.4.39"

    if not queries:
        log.info(f"No versioned services to scan CVEs for {device.get('mac_address')}")
        return []

    log.info(f"CVE scan for {device.get('ip_address')}: querying {len(queries)} services")

    all_cves = []
    seen_ids = set()

    for keyword, label in queries.items():
        log.debug(f"NVD query: '{keyword}'")
        cves = _query_nvd(keyword)
        for cve in cves:
            if cve["cve_id"] not in seen_ids:
                seen_ids.add(cve["cve_id"])
                cve["service"] = label
                all_cves.append(cve)
        time.sleep(_RATE_DELAY)  # respect rate limit

    # Sort: critical first, then by score
    severity_order = {"CRITICAL": 0, "HIGH": 1, "MEDIUM": 2, "LOW": 3, "UNKNOWN": 4}
    all_cves.sort(key=lambda c: (severity_order.get(c["severity"], 4), -(c.get("score") or 0)))

    log.info(f"CVE scan complete for {device.get('ip_address')}: {len(all_cves)} CVEs found")
    return all_cves
