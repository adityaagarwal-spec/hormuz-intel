/**
 * dashboard.js — Data loading, UI logic, search, sidebar for Hormuz Intel
 */

const DashboardModule = (() => {

  // ── State ──────────────────────────────────────────────────
  let vessels = [];
  let signals = [];
  let signalFeedLimit = 5;

  // ── Boot ───────────────────────────────────────────────────
  async function init() {
    try {
      [vessels, signals] = await Promise.all([
        fetchJSON('data/vessels.json'),
        fetchJSON('data/signals.json'),
      ]);
    } catch (e) {
      console.error('Failed to load data:', e);
      alert('Could not load data. Make sure you are on http://localhost:8080, not a file:// URL.');
      return;
    }

    try {
      MapModule.init(vessels);
    } catch (e) {
      console.error('Map init failed:', e);
    }

    renderCounters();
    renderVesselList();
    renderSignalFeed();
    startClock();
    setupSearch();
  }

  async function fetchJSON(path) {
    const res = await fetch(path);
    if (!res.ok) throw new Error(`Failed to load ${path}: ${res.status}`);
    return res.json();
  }

  // ── Clock ──────────────────────────────────────────────────
  function startClock() {
    const el = document.getElementById('clock');
    function tick() {
      el.textContent = new Date().toISOString().replace('T', ' ').slice(0, 19) + 'Z';
    }
    tick();
    setInterval(tick, 1000);
  }

  // ── Counters ───────────────────────────────────────────────
  function renderCounters() {
    const total    = vessels.length;
    const highRisk = vessels.filter(v => v.riskScore >= 75).length;
    const alerts   = signals.filter(s => s.severity === 'critical' || s.severity === 'high').length;

    animateCount('counter-total',    total);
    animateCount('counter-highrisk', highRisk);
    animateCount('counter-alerts',   alerts);
  }

  function animateCount(id, target) {
    const el = document.getElementById(id);
    let current = 0;
    const step = Math.ceil(target / 20);
    const timer = setInterval(() => {
      current = Math.min(current + step, target);
      el.textContent = current;
      if (current >= target) clearInterval(timer);
    }, 40);
  }

  // ── Vessel List ────────────────────────────────────────────
  function renderVesselList() {
    const container = document.getElementById('vessel-list-scroll');
    const sorted = [...vessels].sort((a, b) => b.riskScore - a.riskScore);

    container.innerHTML = sorted.map(v => `
      <div class="vessel-list-item" onclick="DashboardModule.focusVessel('${v.id}')">
        <div class="vessel-dot ${v.status}"></div>
        <span class="vessel-list-name">${v.name}</span>
        <span class="vessel-list-flag flag-emoji">${MapModule.FLAG_MAP[v.flag] || '🏳'}</span>
        <span class="vessel-list-risk ${v.status}">${v.riskScore}</span>
      </div>
    `).join('');
  }

  function highlightVesselInList(vesselId) {
    document.querySelectorAll('.vessel-list-item').forEach(el => {
      el.style.background = '';
    });
    const items = document.querySelectorAll('.vessel-list-item');
    const sorted = [...vessels].sort((a, b) => b.riskScore - a.riskScore);
    const idx = sorted.findIndex(v => v.id === vesselId);
    if (idx !== -1 && items[idx]) {
      items[idx].style.background = 'rgba(59, 158, 255, 0.12)';
      items[idx].scrollIntoView({ behavior: 'smooth', block: 'nearest' });
    }
  }

  // ── Signal Feed ────────────────────────────────────────────
  function renderSignalFeed(limit = signalFeedLimit) {
    const container = document.getElementById('signal-list');
    const latest = [...signals]
      .sort((a, b) => new Date(b.timestamp) - new Date(a.timestamp))
      .slice(0, limit);

    container.innerHTML = latest.map(sig => `
      <div class="signal-item sev-${sig.severity}" onclick="DashboardModule.focusSignal('${sig.id}')">
        <div class="signal-item-top">
          <span class="signal-type-badge ${sig.type}">${sig.type}</span>
          <span class="signal-sev-badge ${sig.severity}">${sig.severity.toUpperCase()}</span>
          <span class="signal-time">${formatRelativeTime(sig.timestamp)}</span>
        </div>
        <div class="signal-title">${sig.title}</div>
        <div class="signal-vessel">
          <span onclick="event.stopPropagation(); DashboardModule.focusVessel('${sig.linkedVessel}')">${sig.vesselName}</span>
          ${sig.adid ? `· <span style="color:#4a6280">${sig.adid}</span>` : ''}
        </div>
      </div>
    `).join('');
  }

  function focusSignal(sigId) {
    const sig = signals.find(s => s.id === sigId);
    if (!sig) return;
    focusVessel(sig.linkedVessel);
  }

  // ── Focus Vessel ───────────────────────────────────────────
  function focusVessel(vesselId) {
    MapModule.highlightVessel(vesselId, true);
    highlightVesselInList(vesselId);
    const v = vessels.find(x => x.id === vesselId);
    if (v) showToast(`Focused: ${v.name} — Risk ${v.riskScore}`);
  }

  // ── Search ─────────────────────────────────────────────────
  function setupSearch() {
    const input     = document.getElementById('search-input');
    const clearBtn  = document.getElementById('search-clear');
    const resultBox = document.getElementById('search-result');
    const closeBtn  = document.getElementById('search-result-close');

    input.addEventListener('input', () => {
      const q = input.value.trim().toUpperCase();
      clearBtn.style.display = q ? 'block' : 'none';

      if (!q) {
        hideSearchResult();
        MapModule.clearHighlight();
        return;
      }

      // Match ADID pattern
      const matched = vessels.find(v => v.adid.toUpperCase().includes(q));

      if (matched) {
        showSearchResult(matched);
        MapModule.highlightVessel(matched.id, true);
        highlightVesselInList(matched.id);
      } else {
        hideSearchResult();
      }
    });

    input.addEventListener('keydown', e => {
      if (e.key === 'Escape') clearSearch();
    });

    clearBtn.addEventListener('click', clearSearch);
    closeBtn.addEventListener('click', clearSearch);

    function clearSearch() {
      input.value = '';
      clearBtn.style.display = 'none';
      hideSearchResult();
      MapModule.clearHighlight();
    }
  }

  function showSearchResult(vessel) {
    const box      = document.getElementById('search-result');
    const adidEl   = box.querySelector('.search-result-adid');
    const vesselEl = box.querySelector('.search-result-vessel');
    const coordsEl = box.querySelector('.search-result-coords');
    const badgeEl  = box.querySelector('.search-result-badge');

    const statusColors = { suspicious: '#ff3b3b', watch: '#ffd700', normal: '#00e676' };
    const color = statusColors[vessel.status] || '#ffffff';

    adidEl.textContent   = vessel.adid;
    vesselEl.textContent = vessel.name;
    coordsEl.textContent = `Device @ ${vessel.deviceLat.toFixed(5)}°N, ${vessel.deviceLng.toFixed(5)}°E`;

    badgeEl.textContent      = vessel.status.toUpperCase();
    badgeEl.style.background = hexToRgba(color, 0.15);
    badgeEl.style.color      = color;
    badgeEl.style.border     = `1px solid ${hexToRgba(color, 0.4)}`;
    badgeEl.style.padding    = '2px 7px';
    badgeEl.style.borderRadius = '3px';
    badgeEl.style.fontSize   = '10px';
    badgeEl.style.fontWeight = '700';
    badgeEl.style.letterSpacing = '0.06em';

    box.classList.add('visible');
  }

  function hideSearchResult() {
    document.getElementById('search-result').classList.remove('visible');
  }

  // ── Utils ──────────────────────────────────────────────────
  function formatRelativeTime(isoString) {
    const diff = Date.now() - new Date(isoString).getTime();
    const m = Math.floor(diff / 60000);
    if (m < 1)  return 'just now';
    if (m < 60) return `${m}m ago`;
    const h = Math.floor(m / 60);
    if (h < 24) return `${h}h ago`;
    return `${Math.floor(h / 24)}d ago`;
  }

  function hexToRgba(hex, alpha) {
    const r = parseInt(hex.slice(1, 3), 16);
    const g = parseInt(hex.slice(3, 5), 16);
    const b = parseInt(hex.slice(5, 7), 16);
    return `rgba(${r},${g},${b},${alpha})`;
  }

  function showToast(msg) {
    const toast = document.getElementById('toast');
    toast.textContent = msg;
    toast.classList.add('show');
    setTimeout(() => toast.classList.remove('show'), 2800);
  }

  // ── Public API ─────────────────────────────────────────────
  return {
    init,
    focusVessel,
    focusSignal,
    highlightVesselInList,
    showToast,
  };

})();

// Boot
document.addEventListener('DOMContentLoaded', () => DashboardModule.init());
