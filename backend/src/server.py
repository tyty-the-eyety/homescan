import atexit
import os

from dotenv import load_dotenv
load_dotenv()

from flask import Flask
from flask_cors import CORS
from apscheduler.schedulers.background import BackgroundScheduler

from api import api
from database import init_database
from scan_service import perform_scan, get_scan_interval
from logger import get_logger

log = get_logger("server")

app = Flask(__name__)
CORS(app)
app.register_blueprint(api)

log.info("Initialising database")
init_database()
log.info("Database ready")

# Use persistent scan interval (DB) with env var as fallback
interval = get_scan_interval()
scheduler = BackgroundScheduler()
scheduler.add_job(perform_scan, "interval", minutes=interval, id="scan_job", replace_existing=True)

try:
    scheduler.start()
    log.info(f"Scheduler started - scanning every {interval} minutes")
except Exception as e:
    log.error(f"Scheduler error: {e}")

atexit.register(lambda: scheduler.shutdown(wait=False))


def reschedule_scan(minutes: int):
    """Called from API when user changes scan interval."""
    scheduler.reschedule_job("scan_job", trigger="interval", minutes=minutes)
    log.info(f"Scan rescheduled to every {minutes} minutes")


if __name__ == "__main__":
    port = int(os.environ.get("PORT", "3001"))
    log.info(f"HomeScan starting on port {port}")
    app.run(host="0.0.0.0", port=port, debug=False, threaded=True)
