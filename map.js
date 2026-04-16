/**
 * map.js — MapLibre GL JS map (WebGL, 3D pitch, CartoDB Dark tiles)
 */

const MapModule = (() => {

  const HORMUZ_CENTER  = [56.5, 26.5]; // [lng, lat] — MapLibre order
  const INITIAL_ZOOM   = 6;
  const INITIAL_PITCH  = 45;
  const INITIAL_BEARING = -10;

  const STATUS_COLORS = {
    suspicious: '#ff3b3b',
    watch:      '#ffd700',
    normal:     '#00e676',
  };

  const RISK_COLORS = s => s >= 75 ? '#ff3b3b' : s >= 40 ? '#ffd700' : '#00e676';

  const FLAG_MAP = {
    IR:'🇮🇷', AE:'🇦🇪', GR:'🇬🇷', SA:'🇸🇦',
    XX:'🏴',  CN:'🇨🇳', OM:'🇴🇲', PA:'🇵🇦',
    RU:'🇷🇺', IN:'🇮🇳',
  };

  let map            = null;
  let markers        = {};   // vesselId → { marker, el }
  let deviceMarker   = null;
  let activeHighlight = null;
  let vessels        = [];

  // ── Init ───────────────────────────────────────────────────
  function init(vesselData) {
    vessels = vesselData;

    map = new maplibregl.Map({
      container: 'map',
      style: buildStyle(),
      center: HORMUZ_CENTER,
      zoom: INITIAL_ZOOM,
      pitch: INITIAL_PITCH,
      bearing: INITIAL_BEARING,
      antialias: true,
    });

    map.addControl(new maplibregl.NavigationControl({ visualizePitch: true }), 'top-left');
    map.addControl(new maplibregl.ScaleControl({ unit: 'nautical' }), 'bottom-left');

    map.on('load', () => {
      drawStraitCorridor();
      vessels.forEach(addVesselMarker);
      AISModule.init(map);
    });
  }

  // ── Style ──────────────────────────────────────────────────
  function buildStyle() {
    return {
      version: 8,
      sources: {
        'carto': {
          type: 'raster',
          tiles: [
            'https://a.basemaps.cartocdn.com/dark_all/{z}/{x}/{y}@2x.png',
            'https://b.basemaps.cartocdn.com/dark_all/{z}/{x}/{y}@2x.png',
            'https://c.basemaps.cartocdn.com/dark_all/{z}/{x}/{y}@2x.png',
            'https://d.basemaps.cartocdn.com/dark_all/{z}/{x}/{y}@2x.png',
          ],
          tileSize: 256,
          attribution: '© <a href="https://www.openstreetmap.org/copyright">OSM</a> © <a href="https://carto.com/">CARTO</a>',
          maxzoom: 19,
        }
      },
      layers: [
        { id: 'bg',    type: 'background', paint: { 'background-color': '#060d1a' } },
        { id: 'tiles', type: 'raster',     source: 'carto' },
      ]
    };
  }

  // ── Strait Corridor ────────────────────────────────────────
  function drawStraitCorridor() {
    const coords = [
      [55.10,27.05],[55.50,26.80],[55.90,26.60],
      [56.30,26.50],[56.70,26.45],[57.10,26.40],[57.50,26.35],
    ];

    map.addSource('strait', {
      type: 'geojson',
      data: { type:'Feature', geometry:{ type:'LineString', coordinates: coords } }
    });

    map.addLayer({ id:'strait-glow', type:'line', source:'strait',
      paint:{ 'line-color':'rgba(59,158,255,0.12)', 'line-width':32, 'line-blur':12 } });

    map.addLayer({ id:'strait-dash', type:'line', source:'strait',
      paint:{ 'line-color':'rgba(59,158,255,0.55)', 'line-width':1.5,
              'line-dasharray':[6,4] } });
  }

  // ── Mock Vessel Markers ────────────────────────────────────
  function addVesselMarker(vessel) {
    const color = STATUS_COLORS[vessel.status];

    const el = document.createElement('div');
    el.className = `v-marker v-${vessel.status}`;
    el.innerHTML = `
      <div class="v-core" style="background:${color};box-shadow:0 0 8px ${color}88"></div>
      <div class="v-ring"  style="border-color:${color}"></div>`;

    const popup = new maplibregl.Popup({
      maxWidth: '300px', offset: 14, className: 'ml-popup'
    }).setHTML(buildPopupHTML(vessel));

    const marker = new maplibregl.Marker({ element: el })
      .setLngLat([vessel.lng, vessel.lat])
      .setPopup(popup)
      .addTo(map);

    el.addEventListener('click', () => DashboardModule.highlightVesselInList(vessel.id));

    // Heading line
    const rad  = ((vessel.heading - 90) * Math.PI) / 180;
    const len  = 0.045;
    const eLat = vessel.lat + len * Math.cos(rad);
    const eLng = vessel.lng + len * Math.sin(rad);

    map.addSource(`hdg-${vessel.id}`, {
      type:'geojson',
      data:{ type:'Feature', geometry:{ type:'LineString',
             coordinates:[[vessel.lng, vessel.lat],[eLng, eLat]] } }
    });
    map.addLayer({ id:`hdg-${vessel.id}`, type:'line', source:`hdg-${vessel.id}`,
      paint:{ 'line-color': color, 'line-width':1.5, 'line-opacity':0.7 } });

    markers[vessel.id] = { marker, el, color };
  }

  // ── Popup HTML ─────────────────────────────────────────────
  function buildPopupHTML(v) {
    const flag  = FLAG_MAP[v.flag] || '🏳';
    const rc    = RISK_COLORS(v.riskScore);
    const coord = `${v.lat.toFixed(4)}°N, ${v.lng.toFixed(4)}°E`;
    const time  = new Date(v.lastSeen).toISOString().replace('T',' ').slice(0,16)+'Z';

    return `
      <div class="vessel-popup">
        <div class="vessel-popup-header">
          <div class="vessel-popup-flag flag-emoji">${flag}</div>
          <div class="vessel-popup-title">
            <h3>${v.name}</h3>
            <div class="flag-name">${v.flagName} · IMO: ${v.imo}</div>
          </div>
          <div class="risk-badge">
            <div class="risk-score-num" style="color:${rc}">${v.riskScore}</div>
            <div class="risk-score-label">Risk</div>
          </div>
        </div>
        <div class="vessel-popup-body">
          <div class="popup-status-bar">
            <span class="status-pill ${v.status}">⬤ ${v.status.toUpperCase()}</span>
            <span style="font-size:10px;color:#4a6280">MMSI: ${v.mmsi}</span>
          </div>
          <div class="popup-row"><span class="label">Cargo</span><span class="value">${v.cargo}</span></div>
          <div class="popup-row"><span class="label">Speed</span><span class="value">${v.speed} kts / HDG ${v.heading}°</span></div>
          <div class="popup-row"><span class="label">Position</span><span class="value">${coord}</span></div>
          <div class="popup-row"><span class="label">Last Seen</span><span class="value">${time}</span></div>
          <div class="popup-row"><span class="label">ADID</span><span class="value" style="color:#3b9eff">${v.adid}</span></div>
        </div>
        <div class="vessel-popup-footer"><div class="popup-notes">${v.notes}</div></div>
      </div>`;
  }

  // ── Highlight ──────────────────────────────────────────────
  function highlightVessel(vesselId, panTo = true) {
    clearHighlight();
    const vessel = vessels.find(v => v.id === vesselId);
    if (!vessel) return;
    const m = markers[vesselId];
    if (!m) return;

    m.el.classList.add('highlighted');
    m.marker.togglePopup();

    if (panTo) {
      map.flyTo({ center:[vessel.lng, vessel.lat],
                  zoom: Math.max(map.getZoom(), 10),
                  duration: 1400, essential: true });
    }

    showDevicePin(vessel);
    activeHighlight = vesselId;
  }

  function clearHighlight() {
    if (activeHighlight && markers[activeHighlight])
      markers[activeHighlight].el.classList.remove('highlighted');
    if (deviceMarker) { deviceMarker.remove(); deviceMarker = null; }
    if (map && map.getSource('dev-line')) {
      map.removeLayer('dev-line-layer');
      map.removeSource('dev-line');
    }
    activeHighlight = null;
  }

  function showDevicePin(vessel) {
    if (map.getSource('dev-line')) {
      map.removeLayer('dev-line-layer');
      map.removeSource('dev-line');
    }
    map.addSource('dev-line', {
      type:'geojson',
      data:{ type:'Feature', geometry:{ type:'LineString',
             coordinates:[[vessel.lng,vessel.lat],[vessel.deviceLng,vessel.deviceLat]] } }
    });
    map.addLayer({ id:'dev-line-layer', type:'line', source:'dev-line',
      paint:{ 'line-color':'#00d4ff','line-width':1,'line-dasharray':[4,4],'line-opacity':0.7 } });

    const el = document.createElement('div');
    el.className = 'device-pin';
    el.title = `${vessel.adid} · ${vessel.deviceLat.toFixed(5)}°N, ${vessel.deviceLng.toFixed(5)}°E`;

    deviceMarker = new maplibregl.Marker({ element: el })
      .setLngLat([vessel.deviceLng, vessel.deviceLat])
      .setPopup(new maplibregl.Popup({ offset:10, className:'ml-popup' }).setHTML(
        `<div style="padding:8px;font-family:monospace;font-size:11px;color:#00d4ff">
          <b>${vessel.adid}</b><br>
          ${vessel.deviceLat.toFixed(5)}°N, ${vessel.deviceLng.toFixed(5)}°E
        </div>`))
      .addTo(map);
  }

  function getVesselById(id) { return vessels.find(v => v.id === id) || null; }
  function flyTo(lat, lng, zoom = 11) {
    map.flyTo({ center:[lng, lat], zoom, duration:1400, essential:true });
  }
  function getMap() { return map; }

  return { init, highlightVessel, clearHighlight, getVesselById, flyTo, getMap, FLAG_MAP, STATUS_COLORS };
})();
