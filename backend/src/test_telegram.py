from telegram import send_alert

success = send_alert("&#x1F9EA; HomeScan Test Alert\n\nTelegram integration working!")
print("Alert sent!" if success else "Failed to send alert")
