from database import init_database, add_device, get_all_devices

init_database()

add_device("aa:bb:cc:dd:ee:ff", "192.168.1.100", "test-device")

devices = get_all_devices()
for d in devices:
    print(d)

print("Database test successful!")
