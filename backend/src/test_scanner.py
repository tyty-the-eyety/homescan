import os
from dotenv import load_dotenv
from scanner import scan_network

load_dotenv("../.env")

network_interface = os.environ.get("NETWORK_INTERFACE", "192.168.1.0/24")

print(f"Scanning {network_interface}...")
devices = scan_network(network_interface)

for d in devices:
    print(f"  {d['ip']:<16} {d['mac']}  {d['hostname']}")

print(f"\nTotal devices found: {len(devices)}")
