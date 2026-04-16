/**
 * ais.js — Live AIS vessel streaming via AISstream.io WebSocket
 * Streams real vessels in Strait of Hormuz bounding box [[23,52],[28,60]]
 */

const AISModule = (() => {

  const WS_URL    = 'wss://stream.aisstream.io/v0/stream';
  const API_KEY   = 'd247a5f1a5af035638dfcb8531170ce0866ea1a6';
  const BBOX      = [[[23, 52], [28, 60]]]; // SW→NE corners of Hormuz region

  const SLOW_KNOTS   = 1;    // threshold: below this = red (anchored/drifting)
  const MAX_VESSELS  = 300;  // cap to keep map performant

  let ws          = null;
  let aisLayer    = null;
  let vesselMap   = {};      // mmsi → { marker, data }
  let isConnected = false;
  let reconnectTimer = null;
  let vesselCount = 0;

  // ── Init ───────────────────────────────────────────────────
  function init(leafletMap) {
    aisLayer = L.layerGroup().addTo(leafletMap);
    connect();
  }

  // ── WebSocket Connection ───────────────────────────────────
  function connect() {
    setStatus('connecting');

    ws = new WebSocket(WS_URL);

    ws.onopen = () => {
      isConnected = true;
      setStatus('connected');

      ws.send(JSON.stringify({
        APIKey: API_KEY,
        BoundingBoxes: BBOX,
      }));
    };

    ws.onmessage = (event) => {
      try {
        const msg = JSON.parse(event.data);
        handleMessage(msg);
      } catch (_) {}
    };

    ws.onerror = () => {
      setStatus('error');
    };

    ws.onclose = () => {
      isConnected = false;
      setStatus('disconnected');
      // Auto-reconnect after 5s
      reconnectTimer = setTimeout(connect, 5000);
    };
  }

  // ── Message Handler ────────────────────────────────────────
  function handleMessage(msg) {
    const type = msg.MessageType;
    if (!type) return;

    // Only handle position reports
    if (type !== 'PositionReport' && type !== 'StandardClassBPositionReport') return;

    const meta   = msg.MetaData   || {};
    const report = msg.Message?.[type] || {};

    const mmsi  = String(meta.MMSI || report.UserID || '');
    const name  = (meta.ShipName || 'UNKNOWN').trim().replace(/\s+/g, ' ');
    const lat   = meta.latitude  ?? report.Latitude;
    const lng   = meta.longitude ?? report.Longitude;
    const sog   = report.Sog     ?? 0;   // Speed Over Ground in knots
    const cog   = report.Cog     ?? 0;   // Course Over Ground
    const hdg   = report.TrueHeading ?? cog;

    if (!mmsi || lat == null || lng == null) return;
    if (lat === 0 && lng === 0) return; // invalid position

    if (vesselMap[mmsi]) {
      updateVessel(mmsi, lat, lng, sog, cog, name);
    } else {
      if (vesselCount >= MAX_VESSELS) return;
      addVessel(mmsi, name, lat, lng, sog, cog);
    }

    updateAISCounter();
  }

  // ── Add New Vessel ─────────────────────────────────────────
  function addVessel(mmsi, name, lat, lng, sog, cog) {
    const color  = vesselColor(sog);
    const marker = L.circleMarker([lat, lng], markerStyle(color));

    marker.bindPopup(buildPopup(mmsi, name, sog, lat, lng), {
      maxWidth: 220,
      className: 'vessel-popup-container',
    });

    marker.bindTooltip(
      `<b>${name}</b><br>${sog.toFixed(1)} kts`,
      { direction: 'top', offset: [0, -6], className: 'vessel-tooltip' }
    );

    marker.addTo(aisLayer);

    vesselMap[mmsi] = { marker, name, sog, lat, lng, cog, lastUpdate: Date.now() };
    vesselCount++;
  }

  // ── Update Existing Vessel ─────────────────────────────────
  function updateVessel(mmsi, lat, lng, sog, cog, name) {
    const v = vesselMap[mmsi];
    v.marker.setLatLng([lat, lng]);
    v.marker.setStyle(markerStyle(vesselColor(sog)));

    // Refresh popup if already open
    if (v.marker.isPopupOpen()) {
      v.marker.setPopupContent(buildPopup(mmsi, name || v.name, sog, lat, lng));
    }

    v.sog = sog;
    v.lat = lat;
    v.lng = lng;
    v.cog = cog;
    if (name) v.name = name;
    v.lastUpdate = Date.now();
  }

  // ── Popup HTML ─────────────────────────────────────────────
  function buildPopup(mmsi, name, sog, lat, lng) {
    const speedColor = sog < SLOW_KNOTS ? '#ff3b3b' : '#00e676';
    const statusText = sog < SLOW_KNOTS ? 'SLOW / ANCHORED' : 'UNDERWAY';
    const coordStr   = `${lat.toFixed(4)}°N, ${lng.toFixed(4)}°E`;

    return `
      <div class="vessel-popup">
        <div class="vessel-popup-header">
          <div class="vessel-popup-flag flag-emoji">🛳</div>
          <div class="vessel-popup-title">
            <h3>${name}</h3>
            <div class="flag-name">MMSI: ${mmsi}</div>
          </div>
          <div class="risk-badge">
            <div class="risk-score-num" style="color:${speedColor}">${sog.toFixed(1)}</div>
            <div class="risk-score-label">Knots</div>
          </div>
        </div>
        <div class="vessel-popup-body">
          <div class="popup-status-bar">
            <span class="status-pill" style="
              background:${sog < SLOW_KNOTS ? 'rgba(255,59,59,0.15)' : 'rgba(0,230,118,0.1)'};
              border:1px solid ${sog < SLOW_KNOTS ? 'rgba(255,59,59,0.4)' : 'rgba(0,230,118,0.3)'};
              color:${speedColor};">
              ⬤ ${statusText}
            </span>
          </div>
          <div class="popup-row">
            <span class="label">Speed</span>
            <span class="value" style="color:${speedColor}">${sog.toFixed(1)} kts</span>
          </div>
          <div class="popup-row">
            <span class="label">Position</span>
            <span class="value">${coordStr}</span>
          </div>
          <div class="popup-row">
            <span class="label">Source</span>
            <span class="value" style="color:#3b9eff">AISstream.io LIVE</span>
          </div>
        </div>
      </div>
    `;
  }

  // ── Helpers ────────────────────────────────────────────────
  function vesselColor(sog) {
    return sog < SLOW_KNOTS ? '#ff3b3b' : '#00e676';
  }

  function markerStyle(color) {
    return {
      radius: 5,
      color: color,
      weight: 1.5,
      fillColor: color,
      fillOpacity: 0.75,
    };
  }

  function updateAISCounter() {
    const el = document.getElementById('ais-count');
    if (el) el.textContent = vesselCount;
  }

  // ── Status indicator ───────────────────────────────────────
  function setStatus(state) {
    const dot   = document.getElementById('ais-dot');
    const label = document.getElementById('ais-label');
    if (!dot || !label) return;

    const states = {
      connecting:   { color: '#ffd700', text: 'AIS CONNECTING…' },
      connected:    { color: '#00e676', text: 'AIS LIVE' },
      disconnected: { color: '#ff3b3b', text: 'AIS OFFLINE' },
      error:        { color: '#ff3b3b', text: 'AIS ERROR' },
    };

    const s = states[state] || states.disconnected;
    dot.style.background  = s.color;
    dot.style.boxShadow   = `0 0 6px ${s.color}`;
    label.textContent     = s.text;
    label.style.color     = s.color;
  }

  // ── Public API ─────────────────────────────────────────────
  return { init };

})();
