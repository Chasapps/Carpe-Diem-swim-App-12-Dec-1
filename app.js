// app.js
// ======
// Main logic for the Harbour Pools "passport" app.
// This page shows ONE pool at a time with:
//   • big up/down arrows to move between pools
//   • a map that pans to the selected pool
//   • stamps + optional visit date stored in localStorage

import { loadPools } from './data.js';
import {
  readVisited,
  writeVisited,
  countVisited,
  readSelection,
  writeSelection,
  readStampsPage,
  writeStampsPage
} from './storage.js';

// ---------- Application state (kept in memory while the page is open) -----

let pools = [];                       // list of all pools loaded from pools.json
let visited = readVisited();          // { [poolName]: { done, date } }
let selectedIndex = readSelection();  // which pool is currently selected
let currentStampsPage = readStampsPage();
let onStampsView = false;

// Leaflet map pieces
let map;
let marker;

// ---------- Useful DOM references ----------------------------------------

const listView        = document.getElementById('listView');
const stampsView      = document.getElementById('passportView');
const toggleBtn       = document.getElementById('toggleBtn');
const resetBtn        = document.getElementById('resetBtn');
const countBadge      = document.getElementById('countBadge');
const mapToggle       = document.getElementById('mapToggle');
const prevStampsPageBtn = document.getElementById('prevPassportPage');
const nextStampsPageBtn = document.getElementById('nextPassportPage');

const openNativeMapBtn = document.getElementById('openNativeMap');

// Arrow buttons (big + small)
const btnUp        = document.getElementById('btnUp');
const btnDown      = document.getElementById('btnDown');
const btnPrevPool  = document.getElementById('btnPrevPool');
const btnNextPool  = document.getElementById('btnNextPool');

// ---------- Small helper functions ---------------------------------------

/** Update the badge in the app header, e.g. "4 / 15". */
function updateCount() {
  const done = countVisited(visited);
  countBadge.textContent = `${done} / ${pools.length}`;
}

/**
 * Switch between:
 *   • list view (map + single pool) and
 *   • stamps view (passport-style grid)
 */
function setView(showStamps) {
  onStampsView = showStamps;

  document.body.classList.remove('full-map');
  listView.classList.toggle('active', !showStamps);
  stampsView.classList.toggle('active', showStamps);

  toggleBtn.textContent = showStamps ? 'Back to List' : 'Stamps';

  if (showStamps) {
    renderStamps();
  }

  // When layout changes we ask Leaflet to re-check its map size.
  if (map) {
    setTimeout(() => map.invalidateSize(), 150);
  }
}

/** Open the currently-selected pool in the device's native maps app. */
function openInNativeMaps() {
  const p = pools[selectedIndex] || pools[0];
  if (!p) return;

  const lat = p.lat;
  const lng = p.lng;

  // Default to Google Maps in a browser.
  let url = `https://www.google.com/maps/search/?api=1&query=${lat},${lng}`;

  // On iOS we prefer Apple Maps. The userAgent check is a simple heuristic.
  try {
    const ua = navigator.userAgent || '';
    if (/iPad|iPhone|iPod/.test(ua)) {
      url = `https://maps.apple.com/?q=${lat},${lng}`;
    }
  } catch (e) { /* ignore */ }

  window.open(url, '_blank');
}

/**
 * Render the header row for the currently selected pool:
 *   Pool name  |  "Not yet" / "Stamped • YYYY-MM-DD"
 */
function renderList() {
  const list = document.getElementById('poolList');

  if (!pools.length) {
    list.innerHTML = '<div class="pool-name">No pools loaded.</div>';
    return;
  }

  list.innerHTML = '';

  const p = pools[selectedIndex];
  const v = visited[p.name];
  const stamped   = v && v.done;
  const stampDate = stamped && v.date ? v.date : null;

  const row = document.createElement('div');
  row.className = 'pool-item row-selected';

  row.innerHTML = `
    <div>
      <div class="pool-name">${p.name}</div>
    </div>
    <button class="stamp-chip ${stamped ? 'stamped' : ''}" data-name="${p.name}">
      ${stamped ? (stampDate ? `Stamped • ${stampDate}` : 'Stamped') : 'Not yet'}
    </button>
  `;

  // Clicking the row (but not the chip) recentres the map.
  row.addEventListener('click', (e) => {
    if (e.target instanceof HTMLElement &&
        e.target.classList.contains('stamp-chip')) {
      return;
    }
    panToSelected();
  });

  // Clicking the chip toggles the stamp for this pool.
  row.querySelector('.stamp-chip')?.addEventListener('click', (e) => {
    e.stopPropagation();
    const name = e.currentTarget.getAttribute('data-name');
    toggleStamp(name, true);
  });

  list.appendChild(row);
  updateCount();
}

/**
 * Toggle the visit status of a pool.
 * - If it was stamped, clear it.
 * - If it was not stamped, mark it as stamped today.
 */
function toggleStamp(name, animate = false) {
  const existing = visited[name];
  const today = new Date().toISOString().split('T')[0];

  if (existing && existing.done) {
    visited[name] = { done: false, date: null };
  } else {
    visited[name] = { done: true, date: today };
  }

  writeVisited(visited);
  renderList();
  renderStamps(animate ? name : null);
}

/** Manually set the visit date for a pool (used from the passport view). */
function setStampDate(name, date) {
  if (!date) return;
  const trimmed = date.trim();
  if (!trimmed) return;

  visited[name] = { done: true, date: trimmed };

  writeVisited(visited);
  renderList();
  renderStamps(name);
}

/**
 * Update the selected pool index and keep it in range.
 * We use modulo (%) so the selection "wraps around":
 *   last -> first, first -> last.
 */
function selectIndex(idx) {
  if (!pools.length) return;

  selectedIndex = (idx + pools.length) % pools.length;
  writeSelection(selectedIndex);

  renderList();
  panToSelected();
}

/** Helper: move selection up/down by some number of steps. */
function moveSelection(step) {
  selectIndex(selectedIndex + step);
}

/** Create the Leaflet map and marker after pools have loaded. */
function setupMap() {
  if (!pools.length) return;

  map = L.map('map').setView([pools[0].lat, pools[0].lng], 14);

  L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png', {
    maxZoom: 19,
    attribution: '&copy; OpenStreetMap'
  }).addTo(map);

  marker = L.marker([pools[0].lat, pools[0].lng]).addTo(map);
}

/** Pan the map to the currently selected pool and show its popup. */
function panToSelected() {
  if (!map || !marker || !pools.length) return;

  const p = pools[selectedIndex];
  marker.setLatLng([p.lat, p.lng]).bindPopup(p.name);
  map.setView([p.lat, p.lng], 15, { animate: true });
}

/** Adjust the stamps page and re-render the passport view. */
function changeStampsPage(delta) {
  currentStampsPage += delta;
  renderStamps();
}

/**
 * Render the passport-style grid of stamps.
 * - 3 stamps per page
 * - Date is tappable to edit
 */
function renderStamps(popName = null) {
  const grid = document.getElementById('passportGrid');
  if (!grid) return;

  const pageLabel = document.getElementById('passportPageLabel');
  const stampsPerPage = 3;
  const totalPages = Math.max(1, Math.ceil(pools.length / stampsPerPage));

  // Keep currentStampsPage within range.
  if (currentStampsPage < 0) currentStampsPage = 0;
  if (currentStampsPage > totalPages - 1) currentStampsPage = totalPages - 1;

  writeStampsPage(currentStampsPage);

  const start = currentStampsPage * stampsPerPage;
  const pagePools = pools.slice(start, start + stampsPerPage);

  grid.innerHTML = '';

  pagePools.forEach(p => {
    const v = visited[p.name];
    const stamped   = v && v.done;
    const stampDate = stamped && v.date ? v.date : null;

    const card = document.createElement('div');
    card.className = 'passport';
    card.innerHTML = `
      <div class="title">${p.name}</div>
      <div class="stamp ${popName === p.name ? 'pop' : ''}"
           style="${stamped ? 'opacity:.98' : 'opacity:.45; filter:grayscale(1)'}">
        <img src="stamp.svg" alt="stamp">
        <div class="label">${stamped ? p.name.split(' ')[0].toUpperCase() : 'NOT STAMPED'}</div>
      </div>
      <div class="stamp-date">${stampDate || ''}</div>
    `;

    // Make the date text clickable so the user can edit it.
    const dateEl = card.querySelector('.stamp-date');
    if (dateEl) {
      dateEl.addEventListener('click', (e) => {
        e.stopPropagation();
        if (!stamped) return;

        const current = stampDate || '';
        const next = prompt('Edit visit date (YYYY-MM-DD):', current);
        if (!next) return;

        const trimmed = next.trim();
        if (!/^\\d{4}-\\d{2}-\\d{2}$/.test(trimmed)) {
          alert('Please use YYYY-MM-DD format (e.g. 2025-12-05).');
          return;
        }
        setStampDate(p.name, trimmed);
      });
    }

    grid.appendChild(card);
  });

  if (pageLabel) {
    pageLabel.textContent = `Page ${currentStampsPage + 1} of ${totalPages}`;
  }

  if (prevStampsPageBtn) {
    prevStampsPageBtn.disabled = (currentStampsPage === 0);
  }
  if (nextStampsPageBtn) {
    nextStampsPageBtn.disabled = (currentStampsPage === totalPages - 1);
  }
}

// ---------- Wire up event listeners --------------------------------------

// Toggle between List and Stamps views.
toggleBtn?.addEventListener('click', () => setView(!onStampsView));

// Reset all stamps.
resetBtn?.addEventListener('click', () => {
  if (!confirm('Clear all stamps?')) return;
  visited = {};
  writeVisited(visited);
  renderList();
  renderStamps();
  updateCount();
});

// Make the map full-screen (or split).
mapToggle?.addEventListener('click', () => {
  const fm = document.body.classList.toggle('full-map');
  mapToggle.textContent = fm ? '📋 Back to Split' : '🗺️ Full Map';
  mapToggle.setAttribute('aria-pressed', fm ? 'true' : 'false');
  if (map) {
    setTimeout(() => { map.invalidateSize(); panToSelected(); }, 150);
  }
});

// Open native maps app.
openNativeMapBtn?.addEventListener('click', (e) => {
  e.preventDefault();
  openInNativeMaps();
});

// Big arrow buttons.
btnUp?.addEventListener('click', () => moveSelection(1));
btnDown?.addEventListener('click', () => moveSelection(-1));

// Small text buttons at the bottom.
btnPrevPool?.addEventListener('click', () => moveSelection(-1));
btnNextPool?.addEventListener('click', () => moveSelection(1));

// Stamps pagination buttons.
prevStampsPageBtn?.addEventListener('click', () => changeStampsPage(-1));
nextStampsPageBtn?.addEventListener('click', () => changeStampsPage(1));

// ---------- App entry point ----------------------------------------------

async function init() {
  try {
    pools = await loadPools();
  } catch (err) {
    console.error(err);
    const list = document.getElementById('poolList');
    if (list) list.textContent = 'Error loading pools list.';
    return;
  }

  if (!pools.length) {
    const list = document.getElementById('poolList');
    if (list) list.textContent = 'No pools configured.';
    return;
  }

  // Make sure our saved index is within bounds.
  if (selectedIndex < 0 || selectedIndex >= pools.length) {
    selectedIndex = 0;
  }

  setupMap();
  selectIndex(selectedIndex); // also renders list + pans map
  setView(false);             // ensure we start on list view
  updateCount();

  // Resize map once layout has fully settled.
  setTimeout(() => {
    if (map) {
      map.invalidateSize();
      panToSelected();
    }
  }, 150);
}

// Wait until DOM is ready, then kick everything off.
document.addEventListener('DOMContentLoaded', () => {
  init().catch(err => console.error('Error during app init', err));
});
