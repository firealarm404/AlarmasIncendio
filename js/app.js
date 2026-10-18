import * as THREE from 'three';
import { OrbitControls } from 'three/addons/controls/OrbitControls.js';
import { EffectComposer } from 'three/addons/postprocessing/EffectComposer.js';
import { RenderPass } from 'three/addons/postprocessing/RenderPass.js';
import { UnrealBloomPass } from 'three/addons/postprocessing/UnrealBloomPass.js';
import { OutputPass } from 'three/addons/postprocessing/OutputPass.js';
import { BUILDINGS, SENSORS } from './data.js';
import { firebaseConfig, DEMO } from './config.js';

const $ = (id) => document.getElementById(id);
const host = $('scene');

/* ---------- Escena ---------- */
const renderer = new THREE.WebGLRenderer({ antialias: true });
renderer.setPixelRatio(Math.min(devicePixelRatio, 2));
host.appendChild(renderer.domElement);

const scene = new THREE.Scene();
scene.background = new THREE.Color(0x04070d);
scene.fog = new THREE.Fog(0x04070d, 150, 420);
const camera = new THREE.PerspectiveCamera(45, 1, 1, 1000);
camera.position.set(120, 110, 150);

const controls = new OrbitControls(camera, renderer.domElement);
controls.enableDamping = true;
controls.maxPolarAngle = Math.PI / 2.1;
controls.minDistance = 25;
controls.maxDistance = 300;

scene.add(new THREE.AmbientLight(0xffffff, 0.6));
const sun = new THREE.DirectionalLight(0xffffff, 0.8);
sun.position.set(80, 120, 40);
scene.add(sun);
const grid = new THREE.GridHelper(600, 60, 0x00e5ff, 0x0a3a4a);
grid.position.y = -0.05;
scene.add(grid);

const composer = new EffectComposer(renderer);
composer.addPass(new RenderPass(scene, camera));
composer.addPass(new UnrealBloomPass(new THREE.Vector2(1, 1), 0.9, 0.5, 0.2));
composer.addPass(new OutputPass());

function resize() {
  const w = host.clientWidth, h = host.clientHeight;
  renderer.setSize(w, h);
  composer.setSize(w, h);
  camera.aspect = w / h;
  camera.updateProjectionMatrix();
}
addEventListener('resize', resize);
resize();

/* ---------- Edificios ---------- */
function makeLabel(text) {
  const c = document.createElement('canvas');
  c.width = 256; c.height = 64;
  const g = c.getContext('2d');
  g.font = '600 34px monospace';
  g.fillStyle = '#6fe9ff';
  g.textAlign = 'center';
  g.fillText(text, 128, 44);
  const s = new THREE.Sprite(new THREE.SpriteMaterial({ map: new THREE.CanvasTexture(c), depthTest: false, transparent: true }));
  s.scale.set(24, 6, 1);
  return s;
}

const meshes = new Map();
for (const b of BUILDINGS) {
  const geo = new THREE.BoxGeometry(...b.size);
  const mat = new THREE.MeshStandardMaterial({ color: 0x06222b, emissive: 0x00e5ff, emissiveIntensity: 0.12, transparent: true, opacity: 0.9 });
  const mesh = new THREE.Mesh(geo, mat);
  const edges = new THREE.LineSegments(new THREE.EdgesGeometry(geo), new THREE.LineBasicMaterial({ color: 0x00e5ff }));
  const label = makeLabel(b.id);
  label.position.y = b.size[1] / 2 + 5;
  mesh.add(edges, label);
  mesh.position.set(b.pos[0], b.pos[1] + b.size[1] / 2, b.pos[2]);
  mesh.rotation.y = b.rot;
  scene.add(mesh);
  meshes.set(b.id, { b, mat, edges });
}
const bName = (id) => meshes.get(id)?.b.name ?? 'Edificio sin mapear';

/* ---------- Cámara ---------- */
let tween = null;
function focus(id) {
  const e = meshes.get(id);
  if (!e) return;
  const [x, y, z] = e.b.pos;
  tween = {
    t: 0,
    fp: camera.position.clone(), ft: controls.target.clone(),
    tp: new THREE.Vector3(x + 55, y + 60, z + 70), tt: new THREE.Vector3(x, y + 4, z),
  };
}

const clock = new THREE.Clock();
renderer.setAnimationLoop(() => {
  const dt = clock.getDelta(), t = clock.elapsedTime;
  if (tween) {
    tween.t = Math.min(1, tween.t + dt / 1.6);
    const k = 1 - Math.pow(1 - tween.t, 3);
    camera.position.lerpVectors(tween.fp, tween.tp, k);
    controls.target.lerpVectors(tween.ft, tween.tt, k);
    if (tween.t >= 1) tween = null;
  }
  controls.update();
  const blinkOn = Math.sin(t * 9) > 0;
  for (const [id, e] of meshes) {
    if (activeBuildings.has(id)) {
      e.mat.color.setHex(0xff1744);
      e.mat.emissive.setHex(0xff1744);
      e.mat.emissiveIntensity = blinkOn ? 3.2 : 0.4;
      e.edges.material.color.setHex(0xff5c7a);
    } else {
      e.mat.color.setHex(0x06222b);
      e.mat.emissive.setHex(0x00e5ff);
      e.mat.emissiveIntensity = 0.12;
      e.edges.material.color.setHex(0x00e5ff);
    }
  }
  composer.render();
});

/* ---------- Estado de alarmas + HUD ---------- */
const sensorMeta = { ...SENSORS };
const alarms = new Map();
let activeBuildings = new Set();
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
