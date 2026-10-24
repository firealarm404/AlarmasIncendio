import { defaultCampus, loadCampus, saveCampus, centroid, pointInRing, campusCenter, translateAll, rotateAll, scaleAll } from './store.js';
import { firebaseConfig, DEMO } from './config.js';

const $ = (id) => document.getElementById(id);
const esc = (s) => String(s ?? '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));

/* ---------- Estado ---------- */
let campus = defaultCampus();
if (DEMO) campus = await loadCampus(null);
let fb = null;            // acceso a Firestore (null en modo demo)
let role = 'user';
let dirty = false;
const alarms = new Map(); // sensorId -> { ts, dispatchedAt }
let dispatchFn = null;
let hudSensor = null;
let mapReady = false, blinkOn = true;
let activeBuildings = new Set(), drillBuildings = new Set(), realSensors = new Set(), drillSensors = new Set();
// administración
let adminOn = false, tab = 'b', tool = null, selB = null, selS = null, pending = null, draft = [];

const getB = (id) => campus.buildings.find((b) => b.id === id);

/* ---------- Mapa ---------- */
const style = {
  version: 8,
  sources: {
    osm: { type: 'raster', tiles: ['https://tile.openstreetmap.org/{z}/{x}/{y}.png'], tileSize: 256, maxzoom: 19, attribution: '© OpenStreetMap contributors' },
    sat: { type: 'raster', tiles: ['https://server.arcgisonline.com/ArcGIS/rest/services/World_Imagery/MapServer/tile/{z}/{y}/{x}'], tileSize: 256, maxzoom: 18, attribution: 'Imágenes © Esri, Maxar, Earthstar Geographics' },
  },
  layers: [
    { id: 'osm', type: 'raster', source: 'osm', layout: { visibility: 'none' } },
    { id: 'sat', type: 'raster', source: 'sat', paint: { 'raster-brightness-max': 0.7, 'raster-saturation': -0.3 } },
  ],
};
const map = new maplibregl.Map({ container: 'map', style, center: campusCenter(campus), zoom: 17.2, pitch: 60, bearing: -20, maxPitch: 75, maxZoom: 20 });

const geo = () => ({
  type: 'FeatureCollection',
  features: campus.buildings.map((b) => ({
    type: 'Feature', properties: { id: b.id, name: b.name, h: b.h, tone: b.tone || 'green' },
    geometry: { type: 'Polygon', coordinates: [[...b.ring, b.ring[0]]] },
  })),
});
const renderPolys = () => map.getSource('camp')?.setData(geo());

map.on('load', () => {
  map.addSource('camp', { type: 'geojson', data: geo() });
  map.addSource('draft', { type: 'geojson', data: { type: 'FeatureCollection', features: [] } });
  map.addLayer({ id: 'bld-glow', type: 'line', source: 'camp', paint: { 'line-width': 8, 'line-blur': 6, 'line-opacity': 0.5 } });
  map.addLayer({ id: 'bld', type: 'fill-extrusion', source: 'camp', paint: { 'fill-extrusion-height': ['get', 'h'], 'fill-extrusion-base': 0, 'fill-extrusion-opacity': 0.72 } });
  map.addLayer({ id: 'bld-line', type: 'line', source: 'camp', paint: { 'line-width': 2.5 } });
  map.addLayer({ id: 'draft-line', type: 'line', source: 'draft', filter: ['==', ['geometry-type'], 'LineString'], paint: { 'line-color': '#ff2bd6', 'line-width': 2, 'line-dasharray': [2, 1] } });
  map.addLayer({ id: 'draft-pt', type: 'circle', source: 'draft', filter: ['==', ['geometry-type'], 'Point'], paint: { 'circle-color': '#ff2bd6', 'circle-radius': 5 } });
  mapReady = true;
  renderAll();
});

function paint() {
  if (!mapReady) return;
  const lit = (set) => ['in', ['get', 'id'], ['literal', set.size ? [...set] : ['__none']]];
  const al = lit(activeBuildings), dr = lit(drillBuildings);
  const cy = ['==', ['get', 'tone'], 'cyan'];
  map.setPaintProperty('bld', 'fill-extrusion-color', ['case', al, blinkOn ? '#ff1d2e' : '#7a0a1e', dr, blinkOn ? '#ffb300' : '#5a4300', cy, '#0b4f7a', '#0c5a4e']);
  map.setPaintProperty('bld-line', 'line-color', ['case', ['==', ['get', 'id'], selB || ''], '#ffffff', al, '#ff4d4d', dr, '#ffd24d', cy, '#19d3ff', '#2dff9a']);
  map.setPaintProperty('bld-glow', 'line-color', ['case', al, '#ff1d2e', dr, '#ffb300', cy, '#19d3ff', '#2dff9a']);
  for (const [id, m] of lblMarkers) {
    const el = m.getElement();
    el.classList.toggle('alarm', activeBuildings.has(id));
    el.classList.toggle('drill', drillBuildings.has(id) && !activeBuildings.has(id));
  }
}
setInterval(() => { blinkOn = !blinkOn; paint(); }, 450);

/* ---------- Marcadores: nombres de edificios y alarmas ---------- */
const lblMarkers = new Map(), sMarkers = new Map();
function syncLabels() {
  for (const [id, m] of lblMarkers) if (!getB(id)) { m.remove(); lblMarkers.delete(id); }
  for (const b of campus.buildings) {
    let m = lblMarkers.get(b.id);
    if (!m) {
      const el = document.createElement('div');
      m = new maplibregl.Marker({ element: el, offset: [0, -14] }).setLngLat([0, 0]).addTo(map);
      lblMarkers.set(b.id, m);
    }
    const el = m.getElement();
    el.className = `lbl ${b.tone === 'cyan' ? 'cyan' : ''}`;
    el.textContent = b.name;
    m.setLngLat(centroid(b.ring));
  }
}
function autoBuilding(id) {
  const s = campus.sensors[id];
  const b = campus.buildings.find((x) => pointInRing(s.pos, x.ring));
  if (b) s.buildingId = b.id;
}
function syncSensors() {
  for (const [id, m] of sMarkers) if (!campus.sensors[id]) { m.remove(); sMarkers.delete(id); }
  for (const [id, s] of Object.entries(campus.sensors)) {
    let m = sMarkers.get(id);
    if (!m) {
      const el = document.createElement('div');
      el.className = 'sensor';
      el.innerHTML = '<i></i><span></span>';
      el.addEventListener('click', (e) => { if (adminOn) { e.stopPropagation(); selectSensor(id); } });
      m = new maplibregl.Marker({ element: el }).setLngLat(s.pos).addTo(map);
      m.on('dragend', () => {
        const p = m.getLngLat();
        campus.sensors[id].pos = [p.lng, p.lat];
        autoBuilding(id); markDirty(); refresh(); renderAdmin();
      });
      sMarkers.set(id, m);
    }
    m.setLngLat(s.pos).setDraggable(adminOn);
    const el = m.getElement();
    el.querySelector('span').textContent = s.name || id;
    el.classList.toggle('alarm', realSensors.has(id));
    el.classList.toggle('drill', drillSensors.has(id) && !realSensors.has(id));
    el.classList.toggle('sel', selS === id);
  }
}
function renderAll() {
  if (!mapReady) return;
  renderPolys(); syncLabels(); refresh();
  if (adminOn) { renderAdmin(); showHandles(); }
}

/* ---------- Vista 2D / 3D y mapa base ---------- */
const setMode = (is3d) => map.easeTo({ pitch: is3d ? 60 : 0, bearing: is3d ? -20 : 0, duration: 800 });
map.on('pitchend', () => {
  const is3d = map.getPitch() > 5;
  $('b-3d').setAttribute('aria-pressed', is3d);
  $('b-2d').setAttribute('aria-pressed', !is3d);
});
$('b-2d').onclick = () => setMode(false);
$('b-3d').onclick = () => setMode(true);
$('b-base').onclick = (e) => {
  const streets = e.currentTarget.getAttribute('aria-pressed') !== 'true';
  e.currentTarget.setAttribute('aria-pressed', streets);
  e.currentTarget.textContent = streets ? 'Satélite' : 'Calles';
  map.setLayoutProperty('osm', 'visibility', streets ? 'visible' : 'none');
  map.setLayoutProperty('sat', 'visibility', streets ? 'none' : 'visible');
};

/* ---------- Alarmas ---------- */
function resolve(key, raw) {
  const id = raw?.sensorId ?? key;
  const s = campus.sensors[id];
  const b = s && getB(s.buildingId);
  return {
    key, sensorId: id, drill: !!raw?.drill, name: s?.name ?? id, buildingId: b?.id ?? null, buildingName: b?.name ?? null,
    floor: s?.floor ?? 'Sin mapear', reference: s?.reference ?? 'Sensor sin mapear: verificar en el panel',
    ts: raw?.ts?.toMillis?.() ?? raw?.ts ?? Date.now(), dispatched: !!raw?.dispatchedAt, pos: s?.pos ?? null,
  };
}
const list = () => [...alarms].map(([k, raw]) => resolve(k, raw));

const events = [];
function log(text, kind = '') {
  events.unshift({ t: new Date().toLocaleTimeString(), text, kind });
  events.length = Math.min(events.length, 40);
  $('log').replaceChildren(...events.map((e) => { const li = document.createElement('li'); li.className = e.kind; li.textContent = `${e.t} ${e.text}`; return li; }));
}

let actx;
function beep(freq = 880) {
  try {
    actx ??= new AudioContext();
    const o = actx.createOscillator(), g = actx.createGain();
    o.frequency.value = freq; o.connect(g); g.connect(actx.destination);
    g.gain.setValueAtTime(0.2, actx.currentTime);
    g.gain.exponentialRampToValueAtTime(0.001, actx.currentTime + 0.6);
    o.start(); o.stop(actx.currentTime + 0.6);
  } catch { /* el navegador puede bloquear audio hasta el primer clic */ }
}

function focusAlarm(a) {
  const b = a.buildingId && getB(a.buildingId);
  const center = b ? centroid(b.ring) : a.pos;
  if (!center) return;
  const is3d = map.getPitch() > 5;
  map.flyTo({ center, zoom: 18.3, pitch: is3d ? 60 : 0, bearing: is3d ? map.getBearing() : 0, duration: 1600, essential: true });
}
function renderHud() {
  if (!hudSensor || !alarms.has(hudSensor)) { $('hud').hidden = true; drawLink(); return; }
  const a = resolve(hudSensor, alarms.get(hudSensor));
  $('h-b').textContent = a.buildingName ?? 'Edificio sin mapear';
  $('h-s').textContent = `${a.name} · ${a.sensorId}`;
  $('h-f').textContent = a.floor;
  $('h-r').textContent = a.reference;
  $('h-t').textContent = new Date(a.ts).toLocaleTimeString();
  $('h-dispatch').disabled = a.dispatched;
  $('h-dispatch').textContent = a.dispatched ? 'Brigada despachada' : 'Despachar brigada';
  $('hud').classList.toggle('drill', a.drill);
  $('hud-title').textContent = a.drill ? 'Simulacro · no es una emergencia real' : '¡¡ Alerta de incendio activada !!';
  $('h-st').textContent = a.drill ? 'Simulacro en curso' : 'Crítico · alarma activada';
  $('hud').hidden = false;
  drawLink();
}
function drawLink() {
  const a = hudSensor && alarms.has(hudSensor) && resolve(hudSensor, alarms.get(hudSensor));
  const show = !$('hud').hidden && a && a.pos;
  $('link').style.display = show ? '' : 'none';
  if (!show) return;
  const p = map.project(a.pos), r = $('hud').getBoundingClientRect();
  $('link-line').setAttribute('x1', r.left); $('link-line').setAttribute('y1', r.top + r.height * 0.7);
  $('link-line').setAttribute('x2', p.x); $('link-line').setAttribute('y2', p.y);
  $('link-dot').setAttribute('cx', p.x); $('link-dot').setAttribute('cy', p.y);
}
map.on('render', drawLink);

function openAlarm(id) {
  hudSensor = id;
  focusAlarm(resolve(id, alarms.get(id)));
  renderHud();
}
function refresh() {
  const all = list();
  const real = all.filter((a) => !a.drill), dr = all.filter((a) => a.drill);
  activeBuildings = new Set(real.map((a) => a.buildingId).filter(Boolean));
  drillBuildings = new Set(dr.map((a) => a.buildingId).filter(Boolean));
  realSensors = new Set(real.map((a) => a.sensorId)); drillSensors = new Set(dr.map((a) => a.sensorId));
  $('drillbar').hidden = !dr.length;
  const ul = $('alarm-list');
  ul.replaceChildren(...all.map((a) => {
    const li = document.createElement('li');
    li.tabIndex = 0;
    li.className = [a.dispatched && 'done', a.drill && 'drill'].filter(Boolean).join(' ');
    li.textContent = `${a.drill ? 'SIMULACRO · ' : ''}${a.buildingName ?? 'Sin mapear'} · ${a.floor}`;
    const s = document.createElement('small');
    s.textContent = `${a.name}${a.dispatched ? ' · despachada' : ''}`;
    li.appendChild(s);
    li.onclick = () => openAlarm(a.key);
    li.onkeydown = (e) => { if (e.key === 'Enter') openAlarm(a.key); };
    return li;
  }));
  $('empty').hidden = all.length > 0;
  $('n-sensors').textContent = Object.keys(campus.sensors).length;
  $('n-active').textContent = real.length;
  $('n-disp').textContent = real.filter((a) => a.dispatched).length;
  syncSensors(); paint(); renderHud();
  if (adminOn && tab === 'd') renderAdmin();
}
function upsertAlarm(id, raw) {
  const isNew = !alarms.has(id);
  alarms.set(id, raw);
  refresh();
  if (isNew) {
    const a = resolve(id, raw);
    log(`${a.drill ? 'SIMULACRO' : 'ALARMA'} · ${a.buildingName ?? 'sin mapear'} · ${a.name}`, a.drill ? '' : 'al');
    beep(a.drill ? 520 : 880);
    if (!a.drill || !list().some((x) => !x.drill)) openAlarm(id); // un simulacro nunca desplaza una alarma real
  }
}
function removeAlarm(id) {
  const a = alarms.has(id) && resolve(id, alarms.get(id));
  if (!alarms.delete(id)) return;
  log(`${a.drill ? 'SIMULACRO TERMINADO' : 'RESTABLECIDA'} · ${a.name}`, 'ok');
  if (hudSensor === id) hudSensor = null;
  refresh();
}
$('h-close').onclick = () => { hudSensor = null; renderHud(); };
$('h-dispatch').onclick = () => {
  if (!hudSensor) return;
  const a = resolve(hudSensor, alarms.get(hudSensor));
  log(`${a.drill ? 'DESPACHO (SIMULACRO)' : 'DESPACHO'} · ${a.name}`);
  dispatchFn?.(hudSensor);
};

setInterval(() => {
  const ts = list().map((a) => a.ts);
  if (!ts.length) { $('t-val').textContent = '--:--'; return; }
  const s = Math.floor((Date.now() - Math.min(...ts)) / 1000), h = Math.floor(s / 3600);
  const mm = String(Math.floor((s % 3600) / 60)).padStart(2, '0'), ss = String(s % 60).padStart(2, '0');
  $('t-val').textContent = h ? `${h}:${mm}:${ss}` : `${mm}:${ss}`;
}, 1000);

function setStatus(text, ok = true) {
  $('banner-text').textContent = text;
  $('banner').classList.toggle('off', !ok);
  $('bar-fill').parentElement.classList.toggle('off', !ok);
}

function setOffline(off) {
  $('offbar').hidden = !off;
  document.title = `${off ? '⚠ SIN ENLACE · ' : ''}Sistema de seguridad`;
}
addEventListener('offline', () => setOffline(true));

/* ---------- Administración ---------- */
const flash = (msg) => { $('adm-msg').textContent = msg; clearTimeout(flash.t); flash.t = setTimeout(() => { $('adm-msg').textContent = ''; }, 5000); };
function markDirty() { dirty = true; $('dirty').textContent = 'Cambios sin guardar'; }
function setClean() { dirty = false; $('dirty').textContent = ''; }

function setAdmin(on) {
  adminOn = on;
  $('b-admin').setAttribute('aria-pressed', on);
  $('admin').hidden = !on;
  $('secpanel').hidden = on;
  if (!on) { endTool(); selB = null; selS = null; pending = null; clearHandles(); }
  else renderAdmin();
  syncSensors(); paint();
}
$('b-admin').onclick = () => setAdmin(!adminOn);

function setRole(r, label) {
  role = r;
  $('b-admin').hidden = r !== 'admin';
  if (r !== 'admin' && adminOn) setAdmin(false);
  $('who').textContent = `${label} · ${r === 'admin' ? 'Administrador' : 'Usuario'}`;
}

/* herramientas de dibujo */
const hints = {
  draw: 'Haz clic en el mapa para marcar las esquinas del edificio. Enter o "Terminar" para cerrarlo.',
  addVertex: 'Haz clic sobre el borde del edificio donde quieras agregar un vértice.',
  addSensor: 'Haz clic en el mapa donde está el sensor de alarma.',
  moveCamp: 'Haz clic en el punto donde debe quedar el centro del campamento.',
};
function startTool(t) {
  endTool(); tool = t; draft = [];
  $('hint-text').textContent = hints[t];
  $('hint-done').hidden = t !== 'draw';
  $('hint').hidden = false;
  map.getCanvas().style.cursor = 'crosshair';
  if (t === 'draw') { map.doubleClickZoom.disable(); selB = null; clearHandles(); }
}
function endTool() {
  tool = null; draft = [];
  $('hint').hidden = true;
  map.getCanvas().style.cursor = '';
  map.doubleClickZoom.enable();
  map.getSource('draft')?.setData({ type: 'FeatureCollection', features: [] });
}
$('hint-cancel').onclick = endTool;
$('hint-done').onclick = () => finishDraw();
addEventListener('keydown', (e) => {
  if (e.key === 'Escape' && tool) endTool();
  if (e.key === 'Enter' && tool === 'draw') finishDraw();
});

function drawDraft() {
  const f = draft.map((p) => ({ type: 'Feature', properties: {}, geometry: { type: 'Point', coordinates: p } }));
  if (draft.length > 1) f.push({ type: 'Feature', properties: {}, geometry: { type: 'LineString', coordinates: draft } });
  map.getSource('draft').setData({ type: 'FeatureCollection', features: f });
}
const nextId = (prefix, taken) => { let i = 1; while (taken(prefix + i)) i++; return prefix + i; };
function finishDraw() {
  if (draft.length < 3) { flash('Marca al menos 3 puntos.'); return; }
  const id = nextId('E', (x) => !!getB(x));
  campus.buildings.push({ id, name: `Edificio ${id.slice(1)}`, h: 8, tone: 'green', ring: [...draft] });
  endTool(); markDirty(); renderAll(); selectBuilding(id);
}
function distSeg(p, a, b) {
  const dx = b.x - a.x, dy = b.y - a.y, l2 = dx * dx + dy * dy || 1;
  const t = Math.max(0, Math.min(1, ((p.x - a.x) * dx + (p.y - a.y) * dy) / l2));
  return Math.hypot(p.x - (a.x + t * dx), p.y - (a.y + t * dy));
}
function insertVertex(ll) {
  const b = getB(selB);
  if (!b) return;
  const pt = map.project(ll);
  let best = 0, bd = Infinity;
  b.ring.forEach((p, i) => {
    const d = distSeg(pt, map.project(p), map.project(b.ring[(i + 1) % b.ring.length]));
    if (d < bd) { bd = d; best = i; }
  });
  b.ring.splice(best + 1, 0, [ll.lng, ll.lat]);
  endTool(); markDirty(); renderPolys(); showHandles();
}

/* manijas de vértices */
let handles = [];
function clearHandles() { handles.forEach((h) => h.remove()); handles = []; }
function showHandles() {
  clearHandles();
  const b = adminOn && selB && getB(selB);
  if (!b) return;
  b.ring.forEach((p, i) => {
    const el = document.createElement('div');
    el.className = 'vtx';
    el.title = 'Arrastra para mover · clic derecho para eliminar';
    el.addEventListener('contextmenu', (e) => {
      e.preventDefault();
      if (b.ring.length <= 3) { flash('Un edificio necesita al menos 3 vértices.'); return; }
      b.ring.splice(i, 1); markDirty(); renderPolys(); showHandles();
    });
    const m = new maplibregl.Marker({ element: el, draggable: true }).setLngLat(p).addTo(map);
    m.on('drag', () => { const l = m.getLngLat(); b.ring[i] = [l.lng, l.lat]; renderPolys(); });
    m.on('dragend', () => { markDirty(); syncLabels(); });
    handles.push(m);
  });
}

function selectBuilding(id) { selB = id; selS = null; pending = null; tab = 'b'; renderAdmin(); showHandles(); syncSensors(); paint(); }
function selectSensor(id) { selS = id; selB = null; pending = null; tab = 's'; clearHandles(); renderAdmin(); syncSensors(); paint(); }

map.on('click', (e) => {
  if (!adminOn) return;
  const ll = e.lngLat;
  if (tool === 'draw') { draft.push([ll.lng, ll.lat]); drawDraft(); return; }
  if (tool === 'addVertex') { insertVertex(ll); return; }
  if (tool === 'addSensor') {
    const pos = [ll.lng, ll.lat];
    const b = campus.buildings.find((x) => pointInRing(pos, x.ring));
    pending = { pos, buildingId: b?.id ?? '' };
    endTool(); selS = null; selB = null; clearHandles(); tab = 's'; renderAdmin(); return;
  }
  if (tool === 'moveCamp') { translateAll(campus, campusCenter(campus), [ll.lng, ll.lat]); endTool(); markDirty(); renderAll(); return; }
  const f = map.queryRenderedFeatures(e.point, { layers: ['bld'] })[0];
  if (f) selectBuilding(f.properties.id);
  else { selB = null; selS = null; clearHandles(); renderAdmin(); paint(); }
});

/* panel de administración */
const bOptions = (cur) => `<option value="">(sin edificio)</option>${campus.buildings.map((b) => `<option value="${esc(b.id)}" ${b.id === cur ? 'selected' : ''}>${esc(b.name)}</option>`).join('')}`;
function sensorFields(s) {
  return `<label>Nombre de la alarma<input id="f-sname" value="${esc(s.name)}"></label>
    <label>Edificio<select id="f-sbld">${bOptions(s.buildingId)}</select></label>
    <label>Piso<input id="f-sfloor" value="${esc(s.floor)}"></label>
    <label>Referencia exacta<textarea id="f-sref" rows="2">${esc(s.reference)}</textarea></label>`;
}
function renderAdmin() {
  if (!adminOn) return;
  document.querySelectorAll('.tabs button').forEach((b) => b.setAttribute('aria-pressed', b.dataset.tab === tab));
  let h = '';
  if (tab === 'b') {
    h = `<button id="a-newb" class="primary">+ Nuevo edificio</button>
      <h2>Edificios</h2><ul class="items">${campus.buildings.map((b) => `<li data-b="${esc(b.id)}" class="${b.id === selB ? 'on' : ''}">${esc(b.name)}<small>${esc(b.id)}</small></li>`).join('')}</ul>`;
    const b = selB && getB(selB);
    h += b ? `<h2>Editar edificio</h2>
      <label>Nombre<input id="f-bname" value="${esc(b.name)}"></label>
      <label>Alto (m)<input id="f-bh" type="number" min="2" max="80" value="${Number(b.h) || 8}"></label>
      <label>Color<select id="f-btone"><option value="green" ${b.tone !== 'cyan' ? 'selected' : ''}>Verde</option><option value="cyan" ${b.tone === 'cyan' ? 'selected' : ''}>Cian</option></select></label>
      <div class="row"><button id="a-addv">+ Agregar vértice</button><button id="a-delb" class="danger">Eliminar edificio</button></div>
      <p class="note">Arrastra los puntos blancos para ajustar la silueta. Clic derecho sobre un punto lo elimina.</p>`
      : '<p class="note">Haz clic en un edificio del mapa o de la lista para editarlo.</p>';
  } else if (tab === 's') {
    h = `<button id="a-adds" class="primary">+ Agregar alarma en el plano</button>
      <h2>Alarmas</h2><ul class="items">${Object.entries(campus.sensors).map(([id, s]) => `<li data-s="${esc(id)}" class="${id === selS ? 'on' : ''}">${esc(s.name)}<small>${esc(id)}</small></li>`).join('') || '<li>Sin alarmas en el plano</li>'}</ul>`;
    if (pending) {
      h += `<h2>Nueva alarma</h2>
        <label>Código del panel (ID exacto que envía el panel)<input id="f-sid" placeholder="Ej.: P1-Z03" maxlength="40"></label>
        ${sensorFields({ name: '', buildingId: pending.buildingId, floor: '', reference: '' })}
        <div class="row"><button id="a-create" class="primary">Crear</button><button id="a-cancelp">Cancelar</button></div>`;
    } else if (selS && campus.sensors[selS]) {
      const s = campus.sensors[selS];
      h += `<h2>Editar alarma</h2><label>Código del panel<input value="${esc(selS)}" disabled></label>${sensorFields(s)}
        <div class="row">${DEMO ? '<button id="a-sim">Simular alarma</button>' : ''}<button id="a-dels" class="danger">Quitar del plano</button></div>
        <p class="note">Arrastra el punto naranja en el mapa para moverla.</p>`;
    } else h += '<p class="note">Haz clic en una alarma del mapa o de la lista para editarla.</p>';
  } else if (tab === 'c') {
    h = `<p class="note">Mueve, gira o escala todo el campamento a la vez (edificios y alarmas).</p>
      <button id="c-move" class="primary">Mover: clic en el nuevo centro</button>
      <div class="row"><button id="c-rm">Girar −1°</button><button id="c-rp">Girar +1°</button></div>
      <div class="row"><button id="c-sm">Escala −2%</button><button id="c-sp">Escala +2%</button></div>
      <h2>Valores de fábrica</h2><button id="c-reset" class="danger">Restablecer edificios y alarmas</button>`;
  } else if (tab === 'd') h = drillHtml();
  else if (tab === 'a') h = '<button id="au-refresh">Actualizar</button><ul id="au-list" class="audit"><li>Cargando…</li></ul>';
  else h = backupHtml();
  $('adm-body').innerHTML = h;
  if (tab === 'a') loadAudit();
}
document.querySelector('.tabs').addEventListener('click', (e) => {
  const t = e.target.closest('button')?.dataset.tab;
  if (!t) return;
  tab = t; pending = null; endTool();
  if (t !== 'b') { selB = null; clearHandles(); }
  if (t !== 's') selS = null;
  renderAdmin(); syncSensors(); paint();
});

$('adm-body').addEventListener('input', (e) => {
  const id = e.target.id, v = e.target.value, b = selB && getB(selB), s = selS && campus.sensors[selS];
  if (id === 'f-bname' && b) { b.name = v; syncLabels(); }
  else if (id === 'f-bh' && b) { b.h = Math.max(2, Number(v) || 8); renderPolys(); }
  else if (id === 'f-btone' && b) { b.tone = v; renderPolys(); syncLabels(); }
  else if (s && id === 'f-sname') { s.name = v; }
  else if (s && id === 'f-sbld') { s.buildingId = v; }
  else if (s && id === 'f-sfloor') { s.floor = v; }
  else if (s && id === 'f-sref') { s.reference = v; }
  else return;
  markDirty();
  if (s) refresh();
});
$('adm-body').addEventListener('change', (e) => {
  if (e.target.id === 'bk-file') return restoreBackup(e.target.files[0]);
  if (e.target.id === 'd-sel') return;
  if (!pending && e.target.id !== 'f-sid') renderAdmin();
});

$('adm-body').addEventListener('click', (e) => {
  const el = e.target.closest('button,li');
  if (!el) return;
  if (el.dataset.b) return selectBuilding(el.dataset.b);
  if (el.dataset.s) return selectSensor(el.dataset.s);
  if (el.dataset.endd) return endDrill(el.dataset.endd);
  switch (el.id) {
    case 'a-newb': return startTool('draw');
    case 'a-addv': return startTool('addVertex');
    case 'a-adds': return startTool('addSensor');
    case 'a-delb':
      if (!confirm('¿Eliminar este edificio? Las alarmas que estaban dentro quedarán sin edificio.')) return;
      Object.values(campus.sensors).forEach((s) => { if (s.buildingId === selB) s.buildingId = ''; });
      campus.buildings = campus.buildings.filter((b) => b.id !== selB);
      selB = null; clearHandles(); markDirty(); renderAll(); return;
    case 'a-dels':
      if (!confirm('¿Quitar esta alarma del plano?')) return;
      delete campus.sensors[selS]; selS = null; markDirty(); renderAll(); return;
    case 'a-sim': return upsertAlarm(selS, { ts: Date.now() });
    case 'a-cancelp': pending = null; return renderAdmin();
    case 'a-create': {
      const id = $('f-sid').value.trim();
      if (!/^[A-Za-z0-9_.-]{1,40}$/.test(id)) return flash('El código solo admite letras, números, punto, guion y guion bajo.');
      if (campus.sensors[id]) return flash('Ya existe una alarma con ese código.');
      campus.sensors[id] = { name: $('f-sname').value.trim() || id, buildingId: $('f-sbld').value, floor: $('f-sfloor').value, reference: $('f-sref').value, pos: pending.pos };
      pending = null; markDirty(); renderAll(); return selectSensor(id);
    }
    case 'd-start': return startDrill($('d-sel').value);
    case 'd-endall': return [...alarms].filter(([, r]) => r.drill).forEach(([, r]) => endDrill(r.sensorId));
    case 'au-refresh': return loadAudit();
    case 'bk-dl': return downloadBackup();
    case 'c-move': return startTool('moveCamp');
    case 'c-rm': rotateAll(campus, -1); break;
    case 'c-rp': rotateAll(campus, 1); break;
    case 'c-sm': scaleAll(campus, 0.98); break;
    case 'c-sp': scaleAll(campus, 1.02); break;
    case 'c-reset':
      if (!confirm('Se perderán todos los cambios de edificios y alarmas y se volverá a los valores de fábrica.')) return;
      campus = defaultCampus(); selB = null; selS = null; clearHandles(); break;
    default: return;
  }
  markDirty(); renderAll();
});

$('adm-save').onclick = async () => {
  try { await saveCampus(campus, fb); setClean(); flash('Cambios guardados.'); audit('config_save', '', `${campus.buildings.length} edificios, ${Object.keys(campus.sensors).length} alarmas`); }
  catch (err) { console.error(err); flash(`No se pudo guardar: ${err.code || err.message}`); }
};
$('adm-discard').onclick = async () => {
  if (dirty && !confirm('¿Descartar los cambios sin guardar?')) return;
  campus = await loadCampus(fb); selB = null; selS = null; pending = null; endTool(); setClean(); renderAll();
};
addEventListener('beforeunload', (e) => { if (dirty) e.preventDefault(); });

/* ---------- Auditoría, simulacros y respaldo ---------- */
const AUDIT_LABELS = { login: 'Ingreso', dispatch: 'Despacho', config_save: 'Guardó el plano', drill_start: 'Inició simulacro', drill_end: 'Terminó simulacro', drill_dispatch: 'Despacho (simulacro)', backup_restore: 'Restauró respaldo' };
async function audit(type, sensorId = '', detail = '') {
  if (!fb) return;
  try {
    await fb.addDoc(fb.collection(fb.db, 'audit'), { ts: fb.serverTimestamp(), uid: fb.uid, email: fb.email, type, sensorId, detail: String(detail).slice(0, 300) });
  } catch (err) { console.error('No se pudo registrar en la auditoría', err); flash('Aviso: no se pudo registrar en la auditoría.'); }
}
async function loadAudit() {
  const ul = $('au-list');
  if (!ul) return;
  if (!fb) { ul.innerHTML = '<li>La auditoría requiere conexión a Firebase.</li>'; return; }
  try {
    const snap = await fb.getDocs(fb.query(fb.collection(fb.db, 'audit'), fb.orderBy('ts', 'desc'), fb.limit(60)));
    ul.replaceChildren(...snap.docs.map((d) => {
      const x = d.data(), li = document.createElement('li');
      li.textContent = `${x.ts?.toDate?.().toLocaleString() ?? '…'} · ${x.email} · ${AUDIT_LABELS[x.type] ?? x.type}${x.sensorId ? ` · ${x.sensorId}` : ''}${x.detail ? ` · ${x.detail}` : ''}`;
      return li;
    }));
    if (!snap.size) ul.innerHTML = '<li>Sin registros todavía.</li>';
  } catch (err) { console.error(err); ul.innerHTML = '<li>No se pudo leer la auditoría.</li>'; }
}

function drillHtml() {
  const active = [...alarms].filter(([, r]) => r.drill).map(([, r]) => r.sensorId);
  return `<p class="note">Un simulacro se ve en ámbar para todos los operadores. No es una alarma real ni activa avisos externos.</p>
    <label>Alarma a simular<select id="d-sel">${Object.entries(campus.sensors).map(([id, s]) => `<option value="${esc(id)}">${esc(s.name)} (${esc(id)})</option>`).join('')}</select></label>
    <button id="d-start" class="primary">Iniciar simulacro</button>
    <h2>En curso</h2><ul class="items">${active.map((id) => `<li>${esc(campus.sensors[id]?.name ?? id)}<button data-endd="${esc(id)}">Terminar</button></li>`).join('') || '<li>Ninguno</li>'}</ul>
    ${active.length ? '<button id="d-endall" class="danger">Terminar todos</button>' : ''}`;
}
async function startDrill(id) {
  if (!id) return;
  try {
    if (fb) { await fb.setDoc(fb.doc(fb.db, 'drills', id), { sensorId: id, status: 'active', ts: fb.serverTimestamp(), startedBy: fb.email }); audit('drill_start', id); }
    else upsertAlarm(`d:${id}`, { sensorId: id, drill: true, ts: Date.now() });
    flash('Simulacro iniciado.');
  } catch (err) { console.error(err); flash(`No se pudo iniciar: ${err.code || err.message}`); }
}
async function endDrill(id) {
  try {
    if (fb) { await fb.updateDoc(fb.doc(fb.db, 'drills', id), { status: 'cleared' }); audit('drill_end', id); }
    else removeAlarm(`d:${id}`);
  } catch (err) { console.error(err); flash(`No se pudo terminar: ${err.code || err.message}`); }
}

function backupHtml() {
  return `<p class="note">Descarga una copia de los edificios y alarmas del plano y guárdala fuera de Firebase (disco, correo). Si algo se daña, puedes restaurarla aquí.</p>
    <button id="bk-dl" class="primary">Descargar respaldo</button>
    <label>Restaurar desde archivo<input id="bk-file" type="file" accept="application/json,.json"></label>
    <p class="note">Al restaurar, revisa el plano y pulsa Guardar cambios para aplicarlo a todos.</p>`;
}
function downloadBackup() {
  const blob = new Blob([JSON.stringify({ exportedAt: new Date().toISOString(), campus }, null, 2)], { type: 'application/json' });
  const a = Object.assign(document.createElement('a'), { href: URL.createObjectURL(blob), download: `respaldo-plano-${new Date().toISOString().slice(0, 10)}.json` });
  a.click(); URL.revokeObjectURL(a.href);
}
async function restoreBackup(file) {
  if (!file) return;
  try {
    const c = JSON.parse(await file.text()).campus;
    const okPt = (p) => Array.isArray(p) && p.length === 2 && p.every(Number.isFinite);
    const ok = c && Array.isArray(c.buildings) && c.sensors && typeof c.sensors === 'object' &&
      c.buildings.every((b) => b.id && Array.isArray(b.ring) && b.ring.length >= 3 && b.ring.every(okPt)) &&
      Object.values(c.sensors).every((x) => okPt(x.pos));
    if (!ok) throw new Error('formato');
    if (!confirm(`Se reemplazará el plano actual por el respaldo (${c.buildings.length} edificios, ${Object.keys(c.sensors).length} alarmas).`)) return;
    campus = c; selB = null; selS = null; clearHandles(); markDirty(); audit('backup_restore', '', file.name); renderAll();
    flash('Respaldo cargado. Pulsa Guardar cambios para aplicarlo.');
  } catch { flash('El archivo no es un respaldo válido.'); }
}

/* ---------- Modo demo (sin Firebase) ---------- */
function startDemo() {
  setStatus('Modo demo · sin conexión a Firebase', false);
  $('demo').hidden = false;
  const demoRole = () => { setRole(role === 'admin' ? 'user' : 'admin', 'Demo'); $('b-out').textContent = role === 'admin' ? 'Ver como usuario' : 'Ver como administrador'; };
  $('b-out').onclick = demoRole;
  setRole('user', 'Demo'); $('b-out').textContent = 'Ver como administrador';
  const box = $('demo-buttons');
  const build = () => {
    box.replaceChildren(...Object.entries(campus.sensors).map(([id, s]) => {
      const b = document.createElement('button');
      b.textContent = s.name || id;
      b.onclick = () => upsertAlarm(id, { ts: Date.now() });
      return b;
    }), Object.assign(document.createElement('button'), { textContent: 'Restablecer', onclick: () => [...alarms.keys()].forEach(removeAlarm) }));
  };
  build();
  setInterval(() => { const n = Object.keys(campus.sensors).join(); if (build.n !== n) { build.n = n; build(); } }, 1500);
  dispatchFn = (id) => { alarms.set(id, { ...alarms.get(id), dispatchedAt: true }); refresh(); };
}

/* ---------- Firebase / Firestore ---------- */
async function startFirebase() {
  const V = '10.12.2';
  const { initializeApp } = await import(`https://www.gstatic.com/firebasejs/${V}/firebase-app.js`);
  const { getAuth, onAuthStateChanged, signInWithEmailAndPassword, signOut } = await import(`https://www.gstatic.com/firebasejs/${V}/firebase-auth.js`);
  const { initializeFirestore, persistentLocalCache, persistentMultipleTabManager, collection, query, where, orderBy, limit, onSnapshot, getDoc, getDocs, setDoc, addDoc, doc, updateDoc, serverTimestamp } =
    await import(`https://www.gstatic.com/firebasejs/${V}/firebase-firestore.js`);

  const app = initializeApp(firebaseConfig);
  const auth = getAuth(app);
  const db = initializeFirestore(app, { localCache: persistentLocalCache({ tabManager: persistentMultipleTabManager() }) });

  $('login').onsubmit = async (e) => {
    e.preventDefault();
    $('login-err').textContent = '';
    try { await signInWithEmailAndPassword(auth, $('email').value, $('password').value); }
    catch { $('login-err').textContent = 'Correo o contraseña incorrectos.'; }
  };
  $('b-out').onclick = () => signOut(auth).then(() => location.reload());

  let started = false;
  onAuthStateChanged(auth, async (user) => {
    $('login').hidden = !!user;
    if (!user) { setStatus('Inicia sesión para ver las alarmas', false); return; }
    if (started) return;
    started = true;

    let r = 'user';
    try { const u = await getDoc(doc(db, 'users', user.uid)); if (u.exists() && u.data().role === 'admin') r = 'admin'; }
    catch (err) { console.error('No se pudo leer el rol; se asigna Usuario', err); }
    setRole(r, user.email);

    fb = { db, getDoc, getDocs, setDoc, addDoc, updateDoc, doc, collection, query, orderBy, limit, serverTimestamp, email: user.email, uid: user.uid };
    campus = await loadCampus(fb);
    map.jumpTo({ center: campusCenter(campus) });
    renderAll();
    // Los cambios del administrador llegan en vivo a todos los operadores
    onSnapshot(doc(db, 'config', 'campus'), (snap) => {
      if (!snap.exists() || !snap.data().json || (adminOn && dirty)) return;
      try { campus = JSON.parse(snap.data().json); } catch { return; }
      renderAll();
    });

    dispatchFn = (key) => {
      const drill = key.startsWith('d:'), id = drill ? key.slice(2) : key;
      return updateDoc(doc(db, drill ? 'drills' : 'alarms', id), { dispatchedAt: serverTimestamp(), dispatchedBy: user.email })
        .then(() => audit(drill ? 'drill_dispatch' : 'dispatch', id, campus.sensors[id]?.name ?? ''))
        .catch((err) => { console.error(err); setStatus('Error al registrar el despacho', false); });
    };

    onSnapshot(
      query(collection(db, 'alarms'), where('status', '==', 'active')),
      { includeMetadataChanges: true },
      (snapshot) => {
        setStatus(snapshot.metadata.fromCache ? 'Sin conexión a Firestore' : 'Enlace activo', !snapshot.metadata.fromCache);
        setOffline(snapshot.metadata.fromCache);
        snapshot.docChanges().forEach((ch) => {
          if (ch.type === 'removed') removeAlarm(ch.doc.id);
          else upsertAlarm(ch.doc.id, ch.doc.data());
        });
      },
      (err) => { console.error(err); setStatus('Error de lectura en Firestore', false); }
    );

    onSnapshot(query(collection(db, 'drills'), where('status', '==', 'active')), (snapshot) => {
      snapshot.docChanges().forEach((ch) => {
        if (ch.type === 'removed') removeAlarm(`d:${ch.doc.id}`);
        else upsertAlarm(`d:${ch.doc.id}`, { ...ch.doc.data(), drill: true });
      });
    }, (err) => console.error('Simulacros:', err));
    audit('login');

    // Heartbeat: un panel en silencio no significa que no haya fuego
    const panels = new Map();
    onSnapshot(collection(db, 'panels'), (s) => s.forEach((d) => panels.set(d.id, d.data().lastSeen?.toMillis?.() ?? 0)));
    setInterval(() => {
      const stale = [...panels].filter(([, t]) => Date.now() - t > 90000).map(([id]) => id);
      $('warn').hidden = !stale.length;
      $('warn').textContent = `Sin señal del panel: ${stale.join(', ')}`;
    }, 10000);
  });
}

if (DEMO) startDemo();
else startFirebase().catch((err) => { console.error(err); setStatus('No se pudo iniciar Firebase', false); });
