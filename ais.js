/**
 * ais.js — Live AIS via AISstream.io, rendered as MapLibre GeoJSON layer
 */

const AISModule = (() => {

  const WS_URL   = 'wss://stream.aisstream.io/v0/stream';
  const API_KEY  = 'd247a5f1a5af035638dfcb8531170ce0866ea1a6';
  const BBOX     = [[[23, 52], [28, 60]]];
  const MAX_VESSELS = 400;

  let aisMap    = null;
  let ws        = null;
  let vesselMap = {};   // mmsi → properties
  let geojson   = { type:'FeatureCollection', features:[] };
  let updateTimer = null;
  let dirty     = false;

  // ── Init ───────────────────────────────────────────────────
  function init(mapInstance) {
    aisMap = mapInstance;
    setupSources();
    connect();
  }

  // ── GeoJSON Sources & Layers ───────────────────────────────
  function setupSources() {
    aisMap.addSource('ais', { type:'geojson', data: geojson });

    // Glow halo
    aisMap.addLayer({ id:'ais-halo', type:'circle', source:'ais',
      paint:{
        'circle-radius':  ['interpolate',['linear'],['zoom'], 5,6, 10,12, 14,18],
        'circle-color':   ['get','color'],
        'circle-opacity': 0.12,
        'circle-blur': 1,
      }
    });

    // Main dot
    aisMap.addLayer({ id:'ais-dots', type:'circle', source:'ais',
      paint:{
        'circle-radius':  ['interpolate',['linear'],['zoom'], 5,3, 10,5, 14,8],
        'circle-color':   ['get','color'],
        'circle-opacity': 0.9,
        'circle-stroke-width': 1,
        'circle-stroke-color': ['get','color'],
        'circle-stroke-opacity': 0.4,
      }
    });

    // Click popup
    aisMap.on('click', 'ais-dots', (e) => {
      const p = e.features[0].properties;
      new maplibregl.Popup({ maxWidth:'240px', className:'ml-popup', offset:10 })
        .setLngLat(e.lngLat)
        .setHTML(buildPopup(p))
        .addTo(aisMap);
    });

    aisMap.on('mouseenter','ais-dots', () => aisMap.getCanvas().style.cursor = 'pointer');
    aisMap.on('mouseleave','ais-dots', () => aisMap.getCanvas().style.cursor = '');

    // Throttled update loop — max 4 refreshes/sec
    setInterval(flushUpdate, 250);
  }

  // ── WebSocket ──────────────────────────────────────────────
  function connect() {
    setStatus('connecting');
    ws = new WebSocket(WS_URL);

    ws.onopen = () => {
      setStatus('connected');
      ws.send(JSON.stringify({ APIKey: API_KEY, BoundingBoxes: BBOX }));
    };

    ws.onmessage = (e) => {
      try { handleMessage(JSON.parse(e.data)); } catch(_) {}
    };

    ws.onerror = () => setStatus('error');
    ws.onclose = () => { setStatus('disconnected'); setTimeout(connect, 5000); };
  }

  // ── Message Handler ────────────────────────────────────────
  function handleMessage(msg) {
    const type   = msg.MessageType;
    if (type !== 'PositionReport' && type !== 'StandardClassBPositionReport') return;

    const meta   = msg.MetaData   || {};
    const report = msg.Message?.[type] || {};

    const mmsi   = String(meta.MMSI || report.UserID || '');
    const name   = (meta.ShipName || 'UNKNOWN').trim().replace(/\s+/g,'') || 'UNKNOWN';
    const lat    = meta.latitude  ?? report.Latitude;
    const lng    = meta.longitude ?? report.Longitude;
    const sog    = report.Sog ?? 0;
    const cog    = report.Cog ?? 0;

    if (!mmsi || lat == null || lng == null) return;
    if (lat === 0 && lng === 0) return;
    if (Object.keys(vesselMap).length >= MAX_VESSELS && !vesselMap[mmsi]) return;

    vesselMap[mmsi] = { mmsi, name, lat, lng, sog, cog,
                        color: sog < 1 ? '#ff3b3b' : '#00e676',
                        ts: Date.now() };
    dirty = true;
    updateAISCounter();
  }

  // ── Flush GeoJSON to map ───────────────────────────────────
  function flushUpdate() {
    if (!dirty || !aisMap.getSource('ais')) return;
    dirty = false;

    geojson.features = Object.values(vesselMap).map(v => ({
      type: 'Feature',
      geometry: { type:'Point', coordinates:[v.lng, v.lat] },
      properties: { mmsi:v.mmsi, name:v.name, sog:v.sog, color:v.color, lat:v.lat, lng:v.lng }
    }));

    aisMap.getSource('ais').setData(geojson);
  }

  // ── Popup ──────────────────────────────────────────────────
  function buildPopup(p) {
    const speedColor = p.sog < 1 ? '#ff3b3b' : '#00e676';
    const status     = p.sog < 1 ? 'SLOW / ANCHORED' : 'UNDERWAY';
    return `
      <div class="vessel-popup">
        <div class="vessel-popup-header">
          <div class="vessel-popup-flag">🛳</div>
          <div class="vessel-popup-title">
            <h3>${p.name}</h3>
            <div class="flag-name">MMSI: ${p.mmsi}</div>
          </div>
          <div class="risk-badge">
            <div class="risk-score-num" style="color:${speedColor}">${Number(p.sog).toFixed(1)}</div>
            <div class="risk-score-label">Knots</div>
          </div>
        </div>
        <div class="vessel-popup-body">
          <div class="popup-row">
            <span class="label">Status</span>
            <span class="value" style="color:${speedColor}">${status}</span>
          </div>
          <div class="popup-row">
            <span class="label">Position</span>
            <span class="value">${Number(p.lat).toFixed(4)}°N, ${Number(p.lng).toFixed(4)}°E</span>
          </div>
          <div class="popup-row">
            <span class="label">Source</span>
            <span class="value" style="color:#3b9eff">AISstream.io · LIVE</span>
          </div>
        </div>
      </div>`;
  }

  // ── Helpers ────────────────────────────────────────────────
  function updateAISCounter() {
    const el = document.getElementById('ais-count');
    if (el) el.textContent = Object.keys(vesselMap).length;
  }

  function setStatus(state) {
    const dot   = document.getElementById('ais-dot');
    const label = document.getElementById('ais-label');
    if (!dot || !label) return;
    const s = {
      connecting:   ['#ffd700','AIS CONNECTING…'],
      connected:    ['#00e676','AIS LIVE'],
      disconnected: ['#ff3b3b','AIS OFFLINE'],
      error:        ['#ff3b3b','AIS ERROR'],
    }[state] || ['#ff3b3b','AIS OFFLINE'];
    dot.style.background = s[0];
    dot.style.boxShadow  = `0 0 6px ${s[0]}`;
    label.textContent    = s[1];
    label.style.color    = s[0];
  }

  return { init };
})();
