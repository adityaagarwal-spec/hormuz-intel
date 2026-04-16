# Hormuz Intel — Maritime Intelligence Dashboard

A browser-based maritime intelligence dashboard for monitoring vessel activity in the Strait of Hormuz. Built as a Phase 1 prototype combining AIS vessel tracking with ADINT (Advertising Intelligence) and SOCINT (Social Intelligence) signal feeds.

---

## Features

| Feature | Description |
|---|---|
| **Live Map** | Leaflet.js dark map centered on the Strait of Hormuz (26.5°N, 56.5°E) |
| **Vessel Markers** | 10 mock vessels color-coded by risk status (red/yellow/green) |
| **Vessel Popups** | Click any vessel for name, flag, cargo, speed, heading, last seen, risk score, ADID |
| **ADID Search** | Type an Ad ID to locate the linked vessel and show its device location pin |
| **Situation Summary** | Live counters for total vessels, high-risk vessels, and active alerts |
| **Signal Feed** | Last 5 ADINT/SOCINT signals with severity badges and vessel links |
| **Vessel List** | Sortable sidebar list of all tracked vessels by risk score |

---

## Project Structure

```
hormuz-intel/
├── index.html          # Main dashboard layout
├── map.js              # Leaflet map logic (markers, popups, highlighting)
├── dashboard.js        # Data loading, UI logic, search, counters, signal feed
├── styles.css          # Dark intelligence UI theme
├── data/
│   ├── vessels.json    # 10 mock vessels with position, cargo, risk metadata
│   └── signals.json    # 12 mock ADINT/SOCINT intelligence signals
└── README.md
```

---

## How to Run

**Option A — Python (no install required)**

```bash
cd hormuz-intel
python3 -m http.server 8080
```
Open `http://localhost:8080` in your browser.

**Option B — Node.js**

```bash
cd hormuz-intel
npx serve .
```

**Option C — VS Code Live Server**

Install the [Live Server](https://marketplace.visualstudio.com/items?itemName=ritwickdey.LiveServer) extension and click "Go Live" from `index.html`.

> The dashboard **cannot** be opened as a local `file://` URL due to browser CORS restrictions on `fetch()` calls loading the JSON data files.

---

## ADID Search — Quick Reference

Type any of the following ADID values into the search bar to highlight the linked vessel and show its device location:

| ADID | Vessel | Status |
|---|---|---|
| `ADID-8821-IR` | IRAN MELODY | Suspicious |
| `ADID-0091-XX` | SHADOW RUNNER | Suspicious |
| `ADID-6643-PA` | DARK TIDE | Suspicious |
| `ADID-5509-CN` | OCEAN DAWN | Watch |
| `ADID-3317-GR` | PROMETHEUS | Watch |
| `ADID-1182-RU` | CASPIAN WIND | Watch |
| `ADID-4402-AE` | GULF STAR | Normal |
| `ADID-7790-SA` | AL RASHID | Normal |
| `ADID-2231-OM` | STRAIT EAGLE | Normal |
| `ADID-9920-IN` | EASTERN PROMISE | Normal |

---

## Data Sources (Mock)

All data in this prototype is **fictional and for demonstration only**. In a real deployment:

| Data Type | Real-World Source |
|---|---|
| **AIS positions** | MarineTraffic API, exactEarth, Spire Maritime |
| **ADINT signals** | Mobile advertising data brokers (Babel Street, Anomaly 6, etc.) |
| **SOCINT signals** | Open-source monitoring platforms (Recorded Future, Maltego, manual OSINT) |
| **Risk scores** | ML pipeline integrating AIS anomalies, sanctions lists, cargo manifests |
| **Vessel registry** | IMO GISIS, Lloyd's Register, Equasis |

---

## Risk Score Logic (Mock)

| Score Range | Status | Map Color |
|---|---|---|
| 75–100 | Suspicious | Red `#ff3b3b` |
| 40–74 | Watch | Yellow `#ffd700` |
| 0–39 | Normal | Green `#00e676` |

Risk indicators include: AIS spoofing/dark gaps, sanctions exposure, ownership opacity, route deviations, STS transfer proximity, and correlated ADINT/SOCINT signals.

---

## Tech Stack

- **Leaflet.js 1.9.4** — Map rendering
- **CartoDB Dark Matter** — Dark basemap tiles
- **Vanilla JS (ES6 modules pattern)** — No framework dependencies
- **CSS custom properties** — Theming system

---

## Disclaimer

> This project is a **prototype for demonstration purposes only**. All vessel names, positions, ADID values, risk scores, and intelligence signals are entirely fictional. No real vessels, persons, or entities are represented. Not for operational, law enforcement, or intelligence use.
