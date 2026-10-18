// Modelo del campamento en lon/lat + persistencia (Firestore o localStorage) + transformaciones de calibración.
import { ORIGIN, ROT, SCALE, IMG_CENTER, BUILDINGS, SENSORS } from './data.js';

const M = 111320, KEY = 'campus-v1';

export const centroid = (pts) => [pts.reduce((t, p) => t + p[0], 0) / pts.length, pts.reduce((t, p) => t + p[1], 0) / pts.length];

export function pointInRing(pt, ring) {
  let inside = false;
  for (let i = 0, j = ring.length - 1; i < ring.length; j = i++) {
    const [xi, yi] = ring[i], [xj, yj] = ring[j];
    if ((yi > pt[1]) !== (yj > pt[1]) && pt[0] < ((xj - xi) * (pt[1] - yi)) / (yj - yi) + xi) inside = !inside;
  }
  return inside;
}

// Valores de fábrica: convierte data.js (píxeles de la imagen de referencia) a lon/lat
export function defaultCampus() {
  const k = Math.cos((ORIGIN.lat * Math.PI) / 180), r = (ROT * Math.PI) / 180, c = Math.cos(r), s = Math.sin(r);
  const toLL = ([px, py]) => {
    const e = (px - IMG_CENTER[0]) * SCALE, n = -(py - IMG_CENTER[1]) * SCALE;
    return [ORIGIN.lon + (e * c - n * s) / (M * k), ORIGIN.lat + (e * s + n * c) / M];
  };
  const buildings = BUILDINGS.map((b) => ({ id: b.id, name: b.name, h: b.h, tone: b.id.startsWith('B') ? 'green' : 'cyan', ring: b.poly.map(toLL) }));
  const sensors = {};
  for (const [id, m] of Object.entries(SENSORS)) {
    const b = buildings.find((x) => x.id === m.buildingId);
    sensors[id] = { name: `Detector ${id}`, buildingId: m.buildingId, floor: m.floor, reference: m.reference, pos: b ? centroid(b.ring) : [ORIGIN.lon, ORIGIN.lat] };
  }
  return { v: 1, buildings, sensors };
}

// Firestore no admite arrays anidados: el campamento se guarda como un string JSON en config/campus
export async function loadCampus(fb) {
  try {
    if (fb) {
      const d = await fb.getDoc(fb.doc(fb.db, 'config', 'campus'));
      if (d.exists() && d.data().json) return JSON.parse(d.data().json);
    } else {
      const s = localStorage.getItem(KEY);
      if (s) return JSON.parse(s);
    }
  } catch (err) { console.error('No se pudo cargar la configuración; se usan valores de fábrica', err); }
  return defaultCampus();
}
export async function saveCampus(campus, fb) {
  if (fb) await fb.setDoc(fb.doc(fb.db, 'config', 'campus'), { json: JSON.stringify(campus), updatedAt: fb.serverTimestamp(), updatedBy: fb.email });
  else localStorage.setItem(KEY, JSON.stringify(campus));
}

// Calibración: transforma todos los edificios y alarmas a la vez
const mapPts = (c, fn) => {
  c.buildings.forEach((b) => { b.ring = b.ring.map(fn); });
  Object.values(c.sensors).forEach((s) => { s.pos = fn(s.pos); });
};
export const campusCenter = (c) => (c.buildings.length ? centroid(c.buildings.flatMap((b) => b.ring)) : [ORIGIN.lon, ORIGIN.lat]);
export function translateAll(c, from, to) {
  const dx = to[0] - from[0], dy = to[1] - from[1];
  mapPts(c, (p) => [p[0] + dx, p[1] + dy]);
}
export function rotateAll(c, deg) {
  const o = campusCenter(c), k = Math.cos((o[1] * Math.PI) / 180), r = (deg * Math.PI) / 180, cs = Math.cos(r), sn = Math.sin(r);
  mapPts(c, (p) => {
    const x = (p[0] - o[0]) * M * k, y = (p[1] - o[1]) * M;
    return [o[0] + (x * cs - y * sn) / (M * k), o[1] + (x * sn + y * cs) / M];
  });
}
export function scaleAll(c, f) {
  const o = campusCenter(c);
  mapPts(c, (p) => [o[0] + (p[0] - o[0]) * f, o[1] + (p[1] - o[1]) * f]);
}
