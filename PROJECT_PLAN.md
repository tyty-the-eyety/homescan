# HomeScan - Network Device Monitor
**Modern, lightweight alternative to piAlert**

---

## Project Goal
Simple network device monitor that:
- Scans local network for devices
- Logs devices with MAC, IP, hostname, first/last seen
- Sends Telegram alerts for new devices
- Simple web dashboard for viewing devices

---

## Tech Stack
- **Backend:** Python + Flask
- **Scanner:** arp-scan (system command via subprocess)
- **Database:** SQLite (built-in sqlite3, no setup)
- **Frontend:** React + Vite
- **Notifications:** Telegram Bot API (via requests)
- **Deployment:** Docker on Swarm

---

## Project Structure
```
homescan/
├── backend/
│   ├── src/
│   │   ├── scanner.py       # ARP scanning logic
│   │   ├── database.py      # SQLite operations
│   │   ├── telegram.py      # Alert sending
│   │   ├── api.py           # Flask routes (Blueprint)
│   │   └── server.py        # Main entry point
│   ├── requirements.txt
│   └── .env.example
├── frontend/
│   ├── src/
│   │   ├── components/
│   │   │   ├── DeviceList.jsx
│   │   │   ├── DeviceRow.jsx
│   │   │   └── Stats.jsx
│   │   ├── App.jsx
│   │   └── main.jsx
│   ├── package.json
│   └── index.html
├── docker/
│   ├── Dockerfile.backend
│   ├── Dockerfile.frontend
│   └── docker-compose.yml
└── README.md
```

---

## Development Increments

### **INCREMENT 1: Project Setup**
**Goal:** Get basic project structure and dependencies ready
**Time:** 15 minutes

### **INCREMENT 2: Database Layer**
**Goal:** SQLite database with devices table
**Time:** 30 minutes

### **INCREMENT 3: Network Scanner**
**Goal:** ARP scan working, parsing results
**Time:** 1 hour

### **INCREMENT 4: Database Integration**
**Goal:** Scanner saves results to database
**Time:** 30 minutes

### **INCREMENT 5: Telegram Alerts**
**Goal:** Send notification when new device found
**Time:** 30 minutes

### **INCREMENT 6: REST API**
**Goal:** Flask API to serve device data
**Time:** 45 minutes

### **INCREMENT 7: Basic Frontend**
**Goal:** React app displaying device list
**Time:** 1.5 hours

### **INCREMENT 8: Device Management**
**Goal:** Mark devices as known, add nicknames
**Time:** 1 hour

### **INCREMENT 9: Dockerization**
**Goal:** Docker containers + Swarm deployment
**Time:** 1 hour

### **INCREMENT 10: Polish & Features**
**Goal:** Stats, vendor lookup, UI improvements
**Time:** 1-2 hours

---

## Total Time Estimate
**MVP (Increments 1-7):** ~5-6 hours (one solid session)
**Full Featured (1-10):** ~8-10 hours (comfortable weekend)

---

## Success Criteria

**After Increment 5 (Core Scanner):**
- Scanner runs on schedule
- Finds devices on network
- Stores in database
- Sends Telegram alert for new devices

**After Increment 7 (MVP):**
- Web UI shows all devices
- Can see when devices were first/last seen
- Telegram alerts working

**After Increment 10 (Full):**
- Can nickname devices
- Mark devices as known/unknown
- Running in Docker on Swarm
- Stats dashboard

---

## Notes
- Each increment is atomic (can stop/start anytime)
- Test each increment before moving to next
- Use git commits after each increment
- AI prompts provided in INCREMENTS.md

See `INCREMENTS.md` for detailed step-by-step instructions!
