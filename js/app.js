import { ORIGIN, ROT, SCALE, IMG_CENTER, BUILDINGS, SENSORS } from './data.js';
import { firebaseConfig, DEMO } from './config.js';

const $ = (id) => document.getElementById(id);

/* ---------- Geometría: metros locales → lon/lat ---------- */
let origin = { ...ORIGIN };
let rotOff = ROT;
let scale = SCALE;
try {
  const s = JSON.parse(localStorage.getItem('camp-cal2'));
  if (s) { origin = s.origin; rotOff = s.rotOff ?? 0; scale = s.scale ?? SCALE; }
} catch { /* sin calibración local */ }

const M = 111320; // metros por grado de latitud
function toLL(e, n) {
  const r = (rotOff * Math.PI) / 180, c = Math.cos(r), s = Math.sin(r);
  const x = e * c - n * s, y = e * s + n * c;
  return [origin.lon + x / (M * Math.cos((origin.lat * Math.PI) / 180)), origin.lat + y / M];
}
const toLLpx = ([x, y]) => toLL((x - IMG_CENTER[0]) * scale, -(y - IMG_CENTER[1]) * scale);
const centroid = (b) => [b.poly.reduce((t, p) => t + p[0], 0) / b.poly.length, b.poly.reduce((t, p) => t + p[1], 0) / b.poly.length];
function footprint(b) {
  const ring = [...b.poly, b.poly[0]].map(toLLpx);
  return { type: 'Feature', properties: { id: b.id, name: b.name, h: b.h }, geometry: { type: 'Polygon', coordinates: [ring] } };
}
const campGeoJSON = () => ({ type: 'FeatureCollection', features: BUILDINGS.map(footprint) });
const bName = (id) => BUILDINGS.find((b) => b.id === id)?.name ?? 'Edificio sin mapear';

/* ---------- Mapa ---------- */
const style = {
  version: 8,
  sources: {
    osm: { type: 'raster', tiles: ['https://tile.openstreetmap.org/{z}/{x}/{y}.png'], tileSize: 256, maxzoom: 19, attribution: '© OpenStreetMap contributors' },
    sat: { type: 'raster', tiles: ['https://server.arcgisonline.com/ArcGIS/rest/services/World_Imagery/MapServer/tile/{z}/{y}/{x}'], tileSize: 256, maxzoom: 18, attribution: 'Imágenes © Esri, Maxar, Earthstar Geographics' },
  },
  layers: [
    { id: 'osm', type: 'raster', source: 'osm', layout: { visibility: 'none' } },
    { id: 'sat', type: 'raster', source: 'sat', paint: { 'raster-brightness-max': 0.85 } },
  ],
};
const map = new maplibregl.Map({
  container: 'map', style, center: toLL(0, 0), zoom: 17.2, pitch: 60, bearing: -20, maxPitch: 75, maxZoom: 20,
});
map.addControl(new maplibregl.NavigationControl({ visualizePitch: true }), 'bottom-right');

let mapReady = false, blinkOn = true, activeBuildings = new Set();
const labels = new Map();

const colorExpr = (alarm, normal) => ['case',
  ['in', ['get', 'id'], ['literal', activeBuildings.size ? [...activeBuildings] : ['__none']]], alarm, normal];

function paint() {
  if (!mapReady) return;
  map.setPaintProperty('bld', 'fill-extrusion-color', colorExpr(blinkOn ? '#ff1744' : '#7a0a1e', '#0e4a5c'));
  map.setPaintProperty('bld-line', 'line-color', colorExpr('#ff5c7a', '#00e5ff'));
  map.setPaintProperty('bld-glow', 'line-color', colorExpr('#ff1744', '#00e5ff'));
  for (const [id, el] of labels) el.classList.toggle('alarm', activeBuildings.has(id));
}
setInterval(() => { blinkOn = !blinkOn; paint(); }, 450);

function placeLabels() {
  for (const b of BUILDINGS) {
    let m = labels.get(`m:${b.id}`);
    if (!m) {
      const el = document.createElement('div');
      el.className = 'lbl';
      el.textContent = b.id;
      labels.set(b.id, el);
      m = new maplibregl.Marker({ element: el }).setLngLat([0, 0]).addTo(map);
      labels.set(`m:${b.id}`, m);
    }
    m.setLngLat(toLLpx(centroid(b)));
  }
}

map.on('load', () => {
  map.addSource('camp', { type: 'geojson', data: campGeoJSON() });
  map.addLayer({ id: 'bld-glow', type: 'line', source: 'camp', paint: { 'line-color': '#00e5ff', 'line-width': 7, 'line-blur': 5, 'line-opacity': 0.4 } });
  map.addLayer({ id: 'bld', type: 'fill-extrusion', source: 'camp', paint: {
    'fill-extrusion-color': '#0e4a5c', 'fill-extrusion-height': ['get', 'h'], 'fill-extrusion-base': 0, 'fill-extrusion-opacity': 0.85 } });
  map.addLayer({ id: 'bld-line', type: 'line', source: 'camp', paint: { 'line-color': '#00e5ff', 'line-width': 2 } });
  placeLabels();
  mapReady = true;
  paint();
});

function applyGeo() {
  map.getSource('camp')?.setData(campGeoJSON());
  placeLabels();
}

/* ---------- Vista 2D / 3D y mapa base ---------- */
function setMode(mode3d) {
  map.easeTo({ pitch: mode3d ? 60 : 0, bearing: mode3d ? -20 : 0, duration: 800 });
}
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
  e.currentTarget.textContent = streets ? 'Satélite' : 'Mapa de calles';
  map.setLayoutProperty('osm', 'visibility', streets ? 'visible' : 'none');
  map.setLayoutProperty('sat', 'visibility', streets ? 'none' : 'visible');
};

/* ---------- Calibración ---------- */
let calib = false;
function showCal() {
  $('calib-out').textContent =
    `export const ORIGIN = { lon: ${origin.lon.toFixed(6)}, lat: ${origin.lat.toFixed(6)} };\nexport const ROT = ${rotOff};\nexport const SCALE = ${scale.toFixed(3)};`;
}
function saveCal() {
  try { localStorage.setItem('camp-cal2', JSON.stringify({ origin, rotOff, scale })); } catch { /* sin almacenamiento */ }
  showCal(); applyGeo();
}
$('b-calib').onclick = (e) => {
  calib = !calib;
  e.currentTarget.setAttribute('aria-pressed', calib);
  $('calib').hidden = !calib;
  map.getCanvas().style.cursor = calib ? 'crosshair' : '';
  showCal();
};
map.on('click', (e) => { if (calib) { origin = { lon: e.lngLat.lng, lat: e.lngLat.lat }; saveCal(); } });
$('rot-m').onclick = () => { rotOff -= 2; saveCal(); };
$('rot-p').onclick = () => { rotOff += 2; saveCal(); };
$('sc-m').onclick = () => { scale *= 0.95; saveCal(); };
$('sc-p').onclick = () => { scale *= 1.05; saveCal(); };
$('calib-copy').onclick = () => navigator.clipboard?.writeText($('calib-out').textContent);
$('calib-reset').onclick = () => {
  try { localStorage.removeItem('camp-cal2'); } catch { /* nada */ }
  origin = { ...ORIGIN }; rotOff = ROT; scale = SCALE; showCal(); applyGeo();
};

/* ---------- Enfoque en el edificio en alarma ---------- */
function focus(id) {
  const b = BUILDINGS.find((x) => x.id === id);
  if (!b) return;
  const is3d = map.getPitch() > 5;
  map.flyTo({ center: toLLpx(centroid(b)), zoom: 18.3, pitch: is3d ? 60 : 0, bearing: is3d ? map.getBearing() : 0, duration: 1600, essential: true });
}

/* ---------- Estado de alarmas + HUD ---------- */
const sensorMeta = { ...SENSORS };
const alarms = new Map();
let hudSensor = null;
let dispatchFn = null;

function resolve(id, raw) {
  const m = sensorMeta[id];
  return {
    sensorId: id,
    buildingId: m?.buildingId ?? null,
    floor: m?.floor ?? 'Sin mapear',
    reference: m?.reference ?? 'Sensor sin mapear: verificar en el panel',
    ts: raw?.ts?.toMillis?.() ?? raw?.ts ?? Date.now(),
    dispatched: !!raw?.dispatchedAt,
  };
}

let actx;
function beep() {
  try {
    actx ??= new AudioContext();
    const o = actx.createOscillator(), g = actx.createGain();
    o.frequency.value = 880;
    o.connect(g); g.connect(actx.destination);
    g.gain.setValueAtTime(0.2, actx.currentTime);
    g.gain.exponentialRampToValueAtTime(0.001, actx.currentTime + 0.6);
    o.start(); o.stop(actx.currentTime + 0.6);
  } catch { /* el navegador puede bloquear audio hasta el primer clic */ }
}

function showHud(a) {
  hudSensor = a.sensorId;
  $('h-b').textContent = a.buildingId ? bName(a.buildingId) : 'Edificio sin mapear';
  $('h-f').textContent = a.floor;
  $('h-r').textContent = a.reference;
  $('h-s').textContent = `${a.sensorId} · ${new Date(a.ts).toLocaleTimeString()}`;
  const btn = $('h-dispatch');
  btn.disabled = a.dispatched;
  btn.textContent = a.dispatched ? 'Brigada despachada' : 'Despachar brigada';
  $('hud').hidden = false;
}
function openAlarm(a) {
  if (a.buildingId) focus(a.buildingId);
  showHud(a);
}

function refresh() {
  activeBuildings = new Set([...alarms.values()].map((a) => a.buildingId).filter(Boolean));
  const ul = $('alarm-list');
  ul.replaceChildren();
  for (const a of alarms.values()) {
    const li = document.createElement('li');
    li.tabIndex = 0;
    if (a.dispatched) li.className = 'done';
    li.textContent = `${a.buildingId ? bName(a.buildingId) : 'Sin mapear'} · ${a.floor}`;
    const s = document.createElement('small');
    s.textContent = `${a.sensorId}${a.dispatched ? ' · despachada' : ''}`;
    li.appendChild(s);
    li.onclick = () => openAlarm(a);
    li.onkeydown = (e) => { if (e.key === 'Enter') openAlarm(a); };
    ul.appendChild(li);
  }
  $('empty').hidden = alarms.size > 0;
  paint();
}
function upsertAlarm(a) {
  const isNew = !alarms.has(a.sensorId);
  alarms.set(a.sensorId, a);
  refresh();
  if (isNew) { beep(); openAlarm(a); }
  else if (hudSensor === a.sensorId) showHud(a);
}
function removeAlarm(id) {
  alarms.delete(id);
  refresh();
  if (hudSensor === id) { $('hud').hidden = true; hudSensor = null; }
}

$('h-close').onclick = () => { $('hud').hidden = true; };
$('h-dispatch').onclick = () => hudSensor && dispatchFn?.(hudSensor);

function setStatus(text, ok = true) {
  $('status').textContent = text;
  $('status').classList.toggle('off', !ok);
}

/* ---------- Modo demo (sin Firebase) ---------- */
function startDemo() {
  setStatus('Modo demo · sin conexión a Firebase', false);
  $('demo').hidden = false;
  const box = $('demo-buttons');
  for (const id of Object.keys(sensorMeta)) {
    const b = document.createElement('button');
    b.textContent = id;
    b.onclick = () => upsertAlarm(resolve(id, { ts: Date.now() }));
    box.appendChild(b);
  }
  const r = document.createElement('button');
  r.textContent = 'Restablecer';
  r.onclick = () => [...alarms.keys()].forEach(removeAlarm);
  box.appendChild(r);
  dispatchFn = (id) => upsertAlarm({ ...alarms.get(id), dispatched: true });
}

/* ---------- Firebase / Firestore ---------- */
async function startFirebase() {
  const V = '10.12.2';
  const { initializeApp } = await import(`https://www.gstatic.com/firebasejs/${V}/firebase-app.js`);
  const { getAuth, onAuthStateChanged, signInWithEmailAndPassword } = await import(`https://www.gstatic.com/firebasejs/${V}/firebase-auth.js`);
  const { getFirestore, collection, query, where, onSnapshot, getDocs, doc, updateDoc, serverTimestamp } =
    await import(`https://www.gstatic.com/firebasejs/${V}/firebase-firestore.js`);

  const app = initializeApp(firebaseConfig);
  const auth = getAuth(app);
  const db = getFirestore(app);

  $('login').onsubmit = async (e) => {
    e.preventDefault();
    $('login-err').textContent = '';
    try {
      await signInWithEmailAndPassword(auth, $('email').value, $('password').value);
    } catch {
      $('login-err').textContent = 'Correo o contraseña incorrectos.';
    }
  };

  let started = false;
  onAuthStateChanged(auth, async (user) => {
    $('login').hidden = !!user;
    if (!user) { setStatus('Inicia sesión para ver las alarmas', false); return; }
    if (started) return;
    started = true;

    try {
      const snap = await getDocs(collection(db, 'sensors'));
      snap.forEach((d) => { sensorMeta[d.id] = d.data(); });
    } catch (err) { console.error('No se pudo leer sensors; se usa el respaldo local', err); }

    dispatchFn = (id) => updateDoc(doc(db, 'alarms', id), { dispatchedAt: serverTimestamp(), dispatchedBy: user.email })
      .catch((err) => { console.error(err); setStatus('Error al registrar el despacho', false); });

    onSnapshot(
      query(collection(db, 'alarms'), where('status', '==', 'active')),
      { includeMetadataChanges: true },
      (snapshot) => {
        setStatus(snapshot.metadata.fromCache ? 'Sin conexión a Firestore' : 'Enlace activo', !snapshot.metadata.fromCache);
        snapshot.docChanges().forEach((ch) => {
          if (ch.type === 'removed') removeAlarm(ch.doc.id);
          else upsertAlarm(resolve(ch.doc.id, ch.doc.data()));
        });
      },
      (err) => { console.error(err); setStatus('Error de lectura en Firestore', false); }
    );

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
