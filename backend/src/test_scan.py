from database import init_database
from scan_service import perform_scan, get_unknown_devices

init_database()

print("Running scan...")
result = perform_scan()
print(f"Scan result: {result}")

print(f"\nUnknown devices ({result['new'] + (len(get_unknown_devices()) - result['new'])} total):")
for d in get_unknown_devices():
    print(f"  {d['mac_address']}  {d['ip_address']}  {d['hostname']}")
