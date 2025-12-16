// app.js (patched to use pool.id + pool.stamp from pools.json)
// ==========================================================
// Changes vs your current app.js:
// 1) visited storage key is pool.id (stable) instead of pool.name
// 2) stamp image uses pool.stamp (mapping lives in pools.json)
// 3) stamp chip uses data-id instead of data-name
//
// NOTE: storage.js does not need changes — it stores arbitrary keys.

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

let pools = [];
let visited = readVisited();          // { [poolId]: { done, date } }
let selectedIndex = readSelection();
let currentStampsPage = readStampsPage();
let onStampsView = false;

let map;
let marker;

const listView        = document.getElementById('listView');
const stampsView      = document.getElementById('passportView');
const toggleBtn       = document.getElementById('toggleBtn');
const resetBtn        = document.getElementById('resetBtn');
const countBadge      = document.getElementById('countBadge');
const mapToggle       = document.getElementById('mapToggle');
const prevStampsPageBtn = document.getElementById('prevPassportPage');
const nextStampsPageBtn = document.getElementById('nextPassportPage');

const openNativeMapBtn = document.getElementById('openNativeMap');

const btnUp        = document.getElementById('btnUp');
const btnDown      = document.getElementById('btnDown');
const btnPrevPool  = document.getElementById('btnPrevPool');
const btnNextPool  = document.getElementById('btnNextPool');

function formatDateAU(d) {
  if (!d) return '';
  // convert ISO YYYY-MM-DD to DD/MM/YYYY if needed
  if (/^\d{4}-\d{2}-\d{2}$/.test(d)) {
    const [y,m,day] = d.split('-');
    return `${day}/${m}/${y}`;
  }
  return d;
}

function updateCount() {
  const done = countVisited(visited);
  countBadge.textContent = `${done} / ${pools.length}`;
}

function setView(showStamps) {
  onStampsView = showStamps;

  document.body.classList.remove('full-map');
  listView.classList.toggle('active', !showStamps);
  stampsView.classList.toggle('active', showStamps);

  toggleBtn.textContent = showStamps ? 'Back to List' : 'Stamps';

  if (showStamps) renderStamps();

  if (map) setTimeout(() => map.invalidateSize(), 150);
}

function openInNativeMaps() {
  const p = pools[selectedIndex] || pools[0];
  if (!p) return;

  const lat = p.lat;
  const lng = p.lng;

  let url = `https://www.google.com/maps/search/?api=1&query=${lat},${lng}`;
  try {
    const ua = navigator.userAgent || '';
    if (/iPad|iPhone|iPod/.test(ua)) url = `https://maps.apple.com/?q=${lat},${lng}`;
  } catch (e) {}

  window.open(url, '_blank');
}

function renderList() {
  const list = document.getElementById('poolList');

  if (!pools.length) {
    list.innerHTML = '<div class="pool-name">No pools loaded.</div>';
    return;
  }

  list.innerHTML = '';

  const p = pools[selectedIndex];
  const v = visited[p.id];
  const stamped   = v && v.done === true;
  const stampDate = stamped && v.date ? v.date : null;

  const row = document.createElement('div');
  row.className = 'pool-item row-selected';

  row.innerHTML = `
    <div>
      <div class="pool-name">${p.name}</div>
    </div>
    <button class="stamp-chip ${stamped ? 'stamped' : 'cta'}" data-id="${p.id}">
      ${stamped ? (stampDate ? `✓ Visited • ${formatDateAU(stampDate)}` : '✓ Visited (tap to undo)') : '✅ Mark as visited'}
    </button>
  `;

  row.addEventListener('click', (e) => {
    if (e.target instanceof HTMLElement &&
        e.target.classList.contains('stamp-chip')) {
      return;
    }
    panToSelected();
  });

  row.querySelector('.stamp-chip')?.addEventListener('click', (e) => {
    e.stopPropagation();
    const id = e.currentTarget.getAttribute('data-id');
    toggleStamp(id, true);
  });

  list.appendChild(row);
  updateCount();
}

function toggleStamp(poolId, animate = false) {
  const existing = visited[poolId];
  const today = new Intl.DateTimeFormat('en-AU').format(new Date());

  if (existing && existing.done === true) {
    // Unstamp: remove the record entirely (keeps storage clean)
    delete visited[poolId];
  } else {
    visited[poolId] = { done: true, date: today };
  }
  writeVisited(visited);
  renderList();
  renderStamps(animate ? poolId : null);
}

function setStampDate(poolId, date) {
  if (!date) return;
  const trimmed = date.trim();
  if (!trimmed) return;

  visited[poolId] = { done: true, date: trimmed };

  writeVisited(visited);
  renderList();
  renderStamps(poolId);
}

function selectIndex(idx) {
  if (!pools.length) return;

  selectedIndex = (idx + pools.length) % pools.length;
  writeSelection(selectedIndex);

  renderList();
  panToSelected();
}

function moveSelection(step) {
  selectIndex(selectedIndex + step);
}

function setupMap() {
  if (!pools.length) return;

  map = L.map('map').setView([pools[0].lat, pools[0].lng], 14);

  L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png', {
    maxZoom: 19,
    attribution: '&copy; OpenStreetMap'
  }).addTo(map);

  marker = L.marker([pools[0].lat, pools[0].lng]).addTo(map);
}

function panToSelected() {
  if (!map || !marker || !pools.length) return;

  const p = pools[selectedIndex];
  marker.setLatLng([p.lat, p.lng]).bindPopup(p.name);
  map.setView([p.lat, p.lng], 15, { animate: true });
}

function changeStampsPage(delta) {
  currentStampsPage += delta;
  renderStamps();
}

function getStampSrc(p) {
  return p.stamp || (p.id ? `stamps/${p.id}.png` : null) || 'stamps/default.png';
}

function renderStamps(popId = null) {
  const grid = document.getElementById('passportGrid');
  if (!grid) return;

  const pageLabel = document.getElementById('passportPageLabel');

  // 15 pools => 4 pages when stampsPerPage = 4 (matches the UI copy in app.html).
  const stampsPerPage = 3;

  // Build list of visited pools in visit order
  const visitedPools = pools
    .filter(p => visited[p.id]?.done === true)
    .sort((a, b) => {
      const da = visited[a.id]?.date || '';
      const db = visited[b.id]?.date || '';
      return da.localeCompare(db);
    });

  const totalPages = Math.max(1, Math.ceil(visitedPools.length / stampsPerPage));

  if (currentStampsPage < 0) currentStampsPage = 0;
  if (currentStampsPage > totalPages - 1) currentStampsPage = totalPages - 1;

  writeStampsPage(currentStampsPage);

  const start = currentStampsPage * stampsPerPage;
  const pagePools = visitedPools.slice(start, start + stampsPerPage);

  grid.innerHTML = '';

  // IMPORTANT BEHAVIOUR:
  // - If a pool is NOT visited, we render an intentionally BLANK slot
  //   (no name, no stamp art, no "Not stamped" text).
  // - Visited pools show the stamp + optional date.
  pagePools.forEach(p => {
    const v = visited[p.id];
    const stamped = !!(v && v.done === true);
    const stampDate = stamped && v.date ? v.date : null;

    const card = document.createElement('div');
    card.className = stamped ? 'passport' : 'passport passport-empty';


    card.innerHTML = `
      <div class="title">${p.name}</div>
      <div class="stamp ${popId === p.id ? 'pop' : ''}" style="opacity:.98">
        <img src="${getStampSrc(p)}" alt="stamp">
        <div class="label">${p.suburb || p.location || p.area || 'Stamped'}</div>
      </div>
      <div class="stamp-date">${formatDateAU(stampDate) || ''}</div>
    `;

    const dateEl = card.querySelector('.stamp-date');
    if (dateEl) {
      dateEl.addEventListener('click', (e) => {
        e.stopPropagation();

        const current = stampDate || '';
        const next = prompt('Edit visit date (DD/MM/YYYY):', formatDateAU(current));
        if (!next) return;

        const trimmed = next.trim();
        if (!/^\d{2}\/\d{2}\/\d{4}$/.test(trimmed)) {
          alert('Please use DD/MM/YYYY format (e.g. 16/12/2025).');
          return;
        }
        setStampDate(p.id, trimmed);
      });
    }

    grid.appendChild(card);
  });

  if (pageLabel) {
    pageLabel.textContent = `Page ${currentStampsPage + 1} of ${totalPages}`;
  }

  if (prevStampsPageBtn) prevStampsPageBtn.disabled = (currentStampsPage === 0);
  if (nextStampsPageBtn) nextStampsPageBtn.disabled = (currentStampsPage === totalPages - 1);
}

toggleBtn?.addEventListener('click', () => setView(!onStampsView));

resetBtn?.addEventListener('click', () => {
  if (!confirm('Clear all stamps?')) return;
  visited = {};
  writeVisited(visited);
  renderList();
  renderStamps();
  updateCount();
});

mapToggle?.addEventListener('click', () => {
  const fm = document.body.classList.toggle('full-map');
  mapToggle.textContent = fm ? '📋 Back to Split' : '🗺️ Full Map';
  mapToggle.setAttribute('aria-pressed', fm ? 'true' : 'false');
  if (map) {
    setTimeout(() => { map.invalidateSize(); panToSelected(); }, 150);
  }
});

openNativeMapBtn?.addEventListener('click', (e) => {
  e.preventDefault();
  openInNativeMaps();
});

btnUp?.addEventListener('click', () => moveSelection(1));
btnDown?.addEventListener('click', () => moveSelection(-1));
btnPrevPool?.addEventListener('click', () => moveSelection(-1));
btnNextPool?.addEventListener('click', () => moveSelection(1));

prevStampsPageBtn?.addEventListener('click', () => changeStampsPage(-1));
nextStampsPageBtn?.addEventListener('click', () => changeStampsPage(1));

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

  if (selectedIndex < 0 || selectedIndex >= pools.length) selectedIndex = 0;

  setupMap();
  selectIndex(selectedIndex);
  setView(false);
  updateCount();

  setTimeout(() => {
    if (map) {
      map.invalidateSize();
      panToSelected();
    }
  }, 150);
}

document.addEventListener('DOMContentLoaded', () => {
  init().catch(err => console.error('Error during app init', err));
});
