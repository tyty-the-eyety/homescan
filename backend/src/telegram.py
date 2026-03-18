import os
from datetime import datetime

import requests
from dotenv import load_dotenv

load_dotenv()


def send_alert(message: str) -> bool:
    token = os.environ.get("TELEGRAM_BOT_TOKEN")
    chat_id = os.environ.get("TELEGRAM_CHAT_ID")
    if not token or not chat_id:
        print("Telegram not configured (missing BOT_TOKEN or CHAT_ID)")
        return False
    try:
        response = requests.post(
            f"https://api.telegram.org/bot{token}/sendMessage",
            json={"chat_id": chat_id, "text": message, "parse_mode": "HTML"},
            timeout=10,
        )
        return response.status_code == 200
    except Exception as e:
        print(f"Telegram error: {e}")
        return False


def format_offline_alert(device: dict) -> str:
    mac      = device.get("mac_address") or device.get("mac", "unknown")
    ip       = device.get("ip_address") or device.get("ip", "unknown")
    name     = device.get("nickname") or device.get("hostname") or mac
    now      = datetime.now().strftime("%Y-%m-%d %H:%M:%S")
    return (
        "&#x1F534; <b>Device Offline!</b>\n\n"
        f"Name: <b>{name}</b>\n"
        f"MAC: <code>{mac}</code>\n"
        f"Last IP: {ip}\n"
        f"Time: {now}"
    )


def format_public_ip_alert(old_ip: str, new_ip: str) -> str:
    now = datetime.now().strftime("%Y-%m-%d %H:%M:%S")
    return (
        "&#x1F310; <b>Public IP Changed!</b>\n\n"
        f"Old IP: <code>{old_ip}</code>\n"
        f"New IP: <code>{new_ip}</code>\n"
        f"Time: {now}"
    )


def format_new_device_alert(device: dict) -> str:
    mac = device.get("mac_address") or device.get("mac", "unknown")
    ip = device.get("ip_address") or device.get("ip", "unknown")
    hostname = device.get("hostname", "unknown")
    now = datetime.now().strftime("%Y-%m-%d %H:%M:%S")
    return (
        "&#x1F6A8; <b>New Device Detected!</b>\n\n"
        f"MAC: <code>{mac}</code>\n"
        f"IP: {ip}\n"
        f"Hostname: {hostname}\n"
        f"Time: {now}"
    )
