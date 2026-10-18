// Campamento Pérez Caldera.
// ORIGIN = punto del mapa que corresponde al centro de la imagen de referencia (IMG_CENTER).
// Calibrado por el usuario. Si lo reajustas con el botón "Calibrar", pega aquí los nuevos valores.
export const ORIGIN = { lon: -70.339651, lat: -33.190402 };
export const ROT = 0;
export const SCALE = 0.280;

// Imagen de referencia: captura satelital de 537 × 742 px, norte hacia arriba.
export const IMG_CENTER = [245, 370];

// Cada edificio es un polígono en píxeles de esa imagen (x hacia la derecha, y hacia abajo).
// Para corregir una forma, mueve sus vértices. h = alto en metros.
// Formas y medidas estimadas desde imagen: reemplazar por las de tus planos.
export const BUILDINGS = [
  { id: 'B1', name: 'Módulo 1', h: 9, poly: [[224, 40], [472, 110], [466, 152], [216, 82]] },
  { id: 'B2', name: 'Módulo 2', h: 9, poly: [[207, 106], [448, 184], [443, 224], [198, 150]] },
  { id: 'B3', name: 'Módulo 3', h: 9, poly: [[182, 180], [388, 246], [383, 296], [174, 228]] },
  { id: 'B4', name: 'Módulo 4', h: 9, poly: [[157, 257], [358, 320], [352, 358], [146, 306]] },
  { id: 'B5', name: 'Módulo 5', h: 9, poly: [[132, 348], [322, 422], [312, 462], [123, 400]] },
  { id: 'B6', name: 'Módulo 6', h: 9, poly: [[102, 423], [356, 525], [349, 568], [95, 470]] },
  { id: 'B7', name: 'Módulo 7', h: 9, poly: [[70, 496], [288, 585], [283, 620], [62, 546]] },
  // Módulo 8 tiene forma de L: bloque grande a la izquierda y ala más angosta hacia el este
  { id: 'B8', name: 'Módulo 8', h: 9, poly: [[62, 568], [158, 610], [258, 668], [250, 706], [150, 668], [22, 672]] },
  { id: 'LOB19', name: 'LOB-19', h: 8, poly: [[392, 247], [440, 257], [424, 330], [384, 388], [358, 366], [368, 322]] },
  { id: 'MED', name: 'Centro Médico', h: 6, poly: [[328, 404], [390, 396], [404, 442], [376, 484], [326, 462]] },
];

// Mapeo sensor → ubicación. En producción vive en Firestore (colección "sensors");
// esto sirve de respaldo y de semilla (tools/send-alarm.js seed).
export const SENSORS = {
  'P1-Z03': { buildingId: 'B3',  floor: 'Piso 2', reference: 'Al costado del ascensor' },
  'P1-Z07': { buildingId: 'B5',  floor: 'Piso 1', reference: 'Pasillo norte, junto a lavandería' },
  'P1-Z11': { buildingId: 'B8',  floor: 'Piso 2', reference: 'Frente a escalera poniente' },
  'P2-Z01': { buildingId: 'MED', floor: 'Piso 1', reference: 'Sala de urgencias' },
};
