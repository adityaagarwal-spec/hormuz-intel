/**
 * map.js — Leaflet map logic for Hormuz Intel Dashboard
 * Handles map init, vessel markers, popups, and highlighting
 */

const MapModule = (() => {

  // ── Constants ──────────────────────────────────────────────
  const HORMUZ_CENTER = [26.5, 56.5];
  const INITIAL_ZOOM  = 9;

  const STATUS_COLORS = {
    suspicious: '#ff3b3b',
    watch:      '#ffd700',
    normal:     '#00e676',
  };

  const RISK_COLORS = (score) => {
    if (score >= 75) return '#ff3b3b';
    if (score >= 40) return '#ffd700';
    return '#00e676';
  };

  // Country code → flag emoji
  const FLAG_MAP = {
    IR: '🇮🇷', AE: '🇦🇪', GR: '🇬🇷', SA: '🇸🇦',
    XX: '🏴', CN: '🇨🇳', OM: '🇴🇲', PA: '🇵🇦',
    RU: '🇷🇺', IN: '🇮🇳',
  };

  // ── State ──────────────────────────────────────────────────
  let map = null;
  let markerLayer = null;
  let deviceLayer = null;
  let markers = {};      // vesselId → { marker, circleMarker, ring }
  let activeHighlight = null;
  let vessels = [];

  // ── Init ───────────────────────────────────────────────────
  function init(vesselData) {
    vessels = vesselData;

    map = L.map('map', {
      center: HORMUZ_CENTER,
      zoom: INITIAL_ZOOM,
      zoomControl: true,
      attributionControl: true,
    });

    // Dark tile layer — CartoDB Dark Matter
    L.tileLayer('https://{s}.basemaps.cartocdn.com/dark_all/{z}/{x}/{y}{r}.png', {
      attribution: '&copy; <a href="https://www.openstreetmap.org/copyright">OSM</a> &copy; <a href="https://carto.com/">CARTO</a>',
      subdomains: 'abcd',
      maxZoom: 19,
    }).addTo(map);

    // Layer groups
    markerLayer = L.layerGroup().addTo(map);
    deviceLayer = L.layerGroup().addTo(map);

    // Add strait boundary (approximate corridor)
    drawStraitBoundary();

    // Plot vessels
    vessels.forEach(addVesselMarker);
  }

  // ── Strait Boundary ────────────────────────────────────────
  function drawStraitBoundary() {
    // Approximate navigable corridor through the Strait of Hormuz
    const corridor = [
      [27.05, 55.10], [26.80, 55.50], [26.60, 55.90],
      [26.50, 56.30], [26.45, 56.70], [26.40, 57.10],
      [26.35, 57.50],
    ];

    L.polyline(corridor, {
      color: 'rgba(59, 158, 255, 0.25)',
      weight: 18,
      lineCap: 'round',
      lineJoin: 'round',
    }).addTo(map);

    L.polyline(corridor, {
      color: 'rgba(59, 158, 255, 0.55)',
      weight: 1.5,
      dashArray: '6 4',
    }).addTo(map).bindTooltip('Strait of Hormuz — Navigable Channel', {
      permanent: false,
      className: 'strait-tooltip',
      direction: 'top',
    });
  }

  // ── Vessel Markers ─────────────────────────────────────────
  function addVesselMarker(vessel) {
    const color = STATUS_COLORS[vessel.status];

    // Outer pulse ring
    const ring = L.circleMarker([vessel.lat, vessel.lng], {
      radius: 14,
      color: color,
      weight: 1,
      fillColor: color,
      fillOpacity: 0,
      opacity: 0.3,
      className: 'vessel-ring',
    }).addTo(markerLayer);

    // Main vessel marker
    const marker = L.circleMarker([vessel.lat, vessel.lng], {
      radius: 7,
      color: color,
      weight: 2,
      fillColor: color,
      fillOpacity: 0.85,
      className: `vessel-marker vessel-${vessel.status}`,
    }).addTo(markerLayer);

    // Direction indicator (heading line)
    const headingRad = ((vessel.heading - 90) * Math.PI) / 180;
    const len = 0.04;
    const endLat = vessel.lat + len * Math.cos(headingRad);
    const endLng = vessel.lng + len * Math.sin(headingRad);

    L.polyline([[vessel.lat, vessel.lng], [endLat, endLng]], {
      color: color,
      weight: 1.5,
      opacity: 0.7,
    }).addTo(markerLayer);

    // Popup
    marker.bindPopup(buildPopupHTML(vessel), {
      maxWidth: 300,
      className: 'vessel-popup-container',
    });

    // Hover tooltip
    marker.bindTooltip(
      `<b>${vessel.name}</b><br>${vessel.flagName} · Risk: ${vessel.riskScore}`,
      { direction: 'top', offset: [0, -8], className: 'vessel-tooltip' }
    );

    // Click → also highlight in sidebar
    marker.on('click', () => {
      DashboardModule.highlightVesselInList(vessel.id);
    });

    markers[vessel.id] = { marker, ring };
  }

  // ── Popup HTML ─────────────────────────────────────────────
  function buildPopupHTML(v) {
    const flag  = FLAG_MAP[v.flag] || '🏳';
    const color = STATUS_COLORS[v.status];
    const riskColor = RISK_COLORS(v.riskScore);
    const timeStr   = formatTime(v.lastSeen);
    const coordStr  = `${v.lat.toFixed(4)}°N, ${v.lng.toFixed(4)}°E`;

    return `
      <div class="vessel-popup">
        <div class="vessel-popup-header">
          <div class="vessel-popup-flag flag-emoji">${flag}</div>
          <div class="vessel-popup-title">
            <h3>${v.name}</h3>
            <div class="flag-name">${v.flagName} &nbsp;·&nbsp; IMO: ${v.imo}</div>
          </div>
          <div class="risk-badge">
            <div class="risk-score-num" style="color:${riskColor}">${v.riskScore}</div>
            <div class="risk-score-label">Risk</div>
          </div>
        </div>
        <div class="vessel-popup-body">
          <div class="popup-status-bar">
            <span class="status-pill ${v.status}">⬤ ${v.status.toUpperCase()}</span>
            <span style="font-size:10px;color:#4a6280;">MMSI: ${v.mmsi}</span>
          </div>
          <div class="popup-row">
            <span class="label">Cargo</span>
            <span class="value">${v.cargo}</span>
          </div>
          <div class="popup-row">
            <span class="label">Speed</span>
            <span class="value">${v.speed} kts / HDG ${v.heading}°</span>
          </div>
          <div class="popup-row">
            <span class="label">Position</span>
            <span class="value">${coordStr}</span>
          </div>
          <div class="popup-row">
            <span class="label">Last Seen</span>
            <span class="value">${timeStr}</span>
          </div>
          <div class="popup-row">
            <span class="label">ADID</span>
            <span class="value" style="color:#3b9eff">${v.adid}</span>
          </div>
        </div>
        <div class="vessel-popup-footer">
          <div class="popup-notes">${v.notes}</div>
        </div>
      </div>
    `;
  }

  // ── Highlight Vessel ───────────────────────────────────────
  function highlightVessel(vesselId, panTo = true) {
    clearHighlight();

    const vessel = vessels.find(v => v.id === vesselId);
    if (!vessel) return;

    const m = markers[vesselId];
    if (!m) return;

    // Animate ring
    m.ring.setStyle({
      opacity: 0.9,
      fillOpacity: 0.15,
      weight: 2,
    });
    m.ring.setRadius(16);

    // Open popup
    m.marker.openPopup();

    // Pan to vessel
    if (panTo) {
      map.flyTo([vessel.lat, vessel.lng], Math.max(map.getZoom(), 10), {
        duration: 1.2,
        easeLinearity: 0.4,
      });
    }

    // Show device location pin
    showDevicePin(vessel);

    activeHighlight = vesselId;
  }

  function clearHighlight() {
    if (activeHighlight && markers[activeHighlight]) {
      const m = markers[activeHighlight];
      m.ring.setStyle({ opacity: 0.3, fillOpacity: 0, weight: 1 });
      m.ring.setRadius(14);
    }
    deviceLayer.clearLayers();
    activeHighlight = null;
  }

  // ── Device Location Pin ────────────────────────────────────
  function showDevicePin(vessel) {
    deviceLayer.clearLayers();

    // Dashed line from vessel to device
    L.polyline(
      [[vessel.lat, vessel.lng], [vessel.deviceLat, vessel.deviceLng]],
      { color: '#00d4ff', weight: 1, dashArray: '4 4', opacity: 0.7 }
    ).addTo(deviceLayer);

    // Device dot
    const devMarker = L.circleMarker([vessel.deviceLat, vessel.deviceLng], {
      radius: 5,
      color: '#00d4ff',
      weight: 2,
      fillColor: '#00d4ff',
      fillOpacity: 0.6,
    }).addTo(deviceLayer);

    devMarker.bindTooltip(
      `<b>Device: ${vessel.adid}</b><br>${vessel.deviceLat.toFixed(5)}°N, ${vessel.deviceLng.toFixed(5)}°E`,
      { direction: 'top', className: 'vessel-tooltip' }
    ).openTooltip();
  }

  // ── Utils ──────────────────────────────────────────────────
  function formatTime(isoString) {
    const d = new Date(isoString);
    return d.toISOString().replace('T', ' ').slice(0, 16) + 'Z';
  }

  function getVesselById(id) {
    return vessels.find(v => v.id === id) || null;
  }

  function flyTo(lat, lng, zoom = 11) {
    map.flyTo([lat, lng], zoom, { duration: 1.2, easeLinearity: 0.4 });
  }

  // ── Public API ─────────────────────────────────────────────
  return {
    init,
    highlightVessel,
    clearHighlight,
    getVesselById,
    flyTo,
    FLAG_MAP,
    STATUS_COLORS,
  };

})();
