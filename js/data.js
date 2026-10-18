// Campamento Pérez Caldera. ORIGIN = centro del bloque de módulos. Afínalo con el botón "Calibrar" del mapa
// y pega aquí los valores que te muestre.
export const ORIGIN = { lon: -70.33962524749629, lat: -33.19111471796648 };
export const ROT = 0; // giro extra de todo el bloque, en grados (antihorario)

// Cada edificio: c = [este, norte] en metros desde ORIGIN; size = [largo, ancho, alto] en metros;
// ang = giro del eje largo en grados, antihorario desde el este.
// Medidas estimadas desde imagen satelital: reemplazar por las de tus planos.
export const BUILDINGS = [
  { id: 'B1', name: 'Módulo 1', c: [21, 52],   size: [62, 11, 9], ang: -22 },
  { id: 'B2', name: 'Módulo 2', c: [15, 37],   size: [62, 11, 9], ang: -22 },
  { id: 'B3', name: 'Módulo 3', c: [9, 22],    size: [60, 11, 9], ang: -22 },
  { id: 'B4', name: 'Módulo 4', c: [3, 7],     size: [60, 11, 9], ang: -22 },
  { id: 'B5', name: 'Módulo 5', c: [-3, -7],   size: [62, 11, 9], ang: -22 },
  { id: 'B6', name: 'Módulo 6', c: [-9, -22],  size: [62, 11, 9], ang: -22 },
  { id: 'B7', name: 'Módulo 7', c: [-15, -37], size: [58, 11, 9], ang: -22 },
  { id: 'B8', name: 'Módulo 8', c: [-21, -52], size: [56, 12, 9], ang: -22 },
  { id: 'MED', name: 'Centro Médico', c: [42, -12], size: [22, 14, 5], ang: -112 },
];

// Mapeo sensor → ubicación. En producción vive en Firestore (colección "sensors");
// esto sirve de respaldo y de semilla (tools/send-alarm.js seed).
export const SENSORS = {
  'P1-Z03': { buildingId: 'B3',  floor: 'Piso 2', reference: 'Al costado del ascensor' },
  'P1-Z07': { buildingId: 'B5',  floor: 'Piso 1', reference: 'Pasillo norte, junto a lavandería' },
  'P1-Z11': { buildingId: 'B8',  floor: 'Piso 2', reference: 'Frente a escalera poniente' },
  'P2-Z01': { buildingId: 'MED', floor: 'Piso 1', reference: 'Sala de urgencias' },
};
