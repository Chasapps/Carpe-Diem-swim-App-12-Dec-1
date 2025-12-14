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
let visited = readVisited();
let selectedIndex = readSelection();
let currentStampsPage = readStampsPage();
let onStampsView = false;

const listView   = document.getElementById('listView');
const stampsView = document.getElementById('passportView');
const toggleBtn  = document.getElementById('toggleBtn');
const counterEl  = document.getElementById('counter');

loadPools().then(data => {
  pools = data;
  renderList();
  updateCounter();
});

function getStampSrc(p) {
  if (p.stamp) return p.stamp;
  if (p.id) return `stamps/${p.id}.png`;
  return 'stamps/default.png';
}

function renderList() {
  listView.innerHTML = '';

  pools.forEach(p => {
    const stamped = !!visited[p.id]?.done;

    const card = document.createElement('div');
    card.className = 'card';
    card.innerHTML = `
      <div class="title">${p.name}</div>
      <div class="status">${stamped ? '✓ Visited' : 'Not visited'}</div>
    `;

    card.onclick = () => toggleStamp(p.id);
    listView.appendChild(card);
  });
}

function renderStamps(popId = null) {
  stampsView.innerHTML = '';

  const perPage = 6;
  const start = currentStampsPage * perPage;
  const end = start + perPage;

  pools.slice(start, end).forEach(p => {
    const v = visited[p.id];
    const stamped = !!v?.done;
    const stampDate = stamped ? (v.date || '') : '';
    const label = stamped ? (p.suburb || 'Stamped') : 'Not stamped';

    const card = document.createElement('div');
    card.className = 'stamp-card';
    card.innerHTML = `
      <div class="title">${p.name}</div>
      <div class="stamp ${popId === p.id ? 'pop' : ''}"
           style="${stamped ? 'opacity:.98' : 'opacity:.45; filter:grayscale(1)'}">
        <img src="${getStampSrc(p)}" alt="stamp">
        <div class="label">${label}</div>
      </div>
      <div class="stamp-date">${stampDate}</div>
    `;

    stampsView.appendChild(card);
  });
}

function toggleStamp(poolId) {
  const today = new Date().toISOString().slice(0, 10);

  if (visited[poolId]?.done) {
    delete visited[poolId];
  } else {
    visited[poolId] = { done: true, date: today };
  }

  writeVisited(visited);
  updateCounter();

  onStampsView ? renderStamps(poolId) : renderList();
}

function updateCounter() {
  if (!counterEl) return;
  counterEl.textContent = `${countVisited(visited)} / ${pools.length}`;
}

toggleBtn.onclick = () => {
  onStampsView = !onStampsView;
  listView.style.display   = onStampsView ? 'none' : 'block';
  stampsView.style.display = onStampsView ? 'grid' : 'none';
  onStampsView ? renderStamps() : renderList();
};
