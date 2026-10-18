// Modelo del campamento (metros). Medidas estimadas desde imagen satelital:
// reemplazar por las reales de tus planos. y = cota de la terraza.
export const BUILDINGS = [
  { id: 'B1', name: 'Módulo 1', pos: [-8, 7, -52], size: [62, 9, 11], rot: -0.2 },
  { id: 'B2', name: 'Módulo 2', pos: [-6, 6, -36], size: [62, 9, 11], rot: -0.2 },
  { id: 'B3', name: 'Módulo 3', pos: [-4, 5, -20], size: [60, 9, 11], rot: -0.2 },
  { id: 'B4', name: 'Módulo 4', pos: [-2, 4, -4],  size: [60, 9, 11], rot: -0.2 },
  { id: 'B5', name: 'Módulo 5', pos: [0, 3, 12],   size: [62, 9, 11], rot: -0.2 },
  { id: 'B6', name: 'Módulo 6', pos: [2, 2, 28],   size: [62, 9, 11], rot: -0.2 },
  { id: 'B7', name: 'Módulo 7', pos: [4, 1, 44],   size: [58, 9, 11], rot: -0.2 },
  { id: 'B8', name: 'Módulo 8', pos: [-2, 0, 60],  size: [56, 9, 12], rot: -0.2 },
  { id: 'MED', name: 'Centro Médico', pos: [42, 3, 18], size: [14, 5, 22], rot: -0.2 },
];

// Mapeo sensor → ubicación. En producción vive en Firestore (colección "sensors");
// esto sirve de respaldo y de semilla (tools/send-alarm.js seed).
export const SENSORS = {
  'P1-Z03': { buildingId: 'B3',  floor: 'Piso 2', reference: 'Al costado del ascensor' },
  'P1-Z07': { buildingId: 'B5',  floor: 'Piso 1', reference: 'Pasillo norte, junto a lavandería' },
  'P1-Z11': { buildingId: 'B8',  floor: 'Piso 2', reference: 'Frente a escalera poniente' },
  'P2-Z01': { buildingId: 'MED', floor: 'Piso 1', reference: 'Sala de urgencias' },
};
