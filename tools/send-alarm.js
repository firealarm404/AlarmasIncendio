// Gateway de ejemplo: escribe eventos del panel en Firestore.
// Uso:  node send-alarm.js seed
//       node send-alarm.js ALARM P1-Z03
//       node send-alarm.js RESTORE P1-Z03
//       node send-alarm.js HEARTBEAT P1      (ejecutar cada 30 s por panel)
// Requiere tools/serviceAccount.json (Consola Firebase → Cuentas de servicio). NO lo subas a GitHub.
import admin from 'firebase-admin';
import { readFileSync } from 'node:fs';
import { SENSORS } from '../js/data.js';

admin.initializeApp({
  credential: admin.credential.cert(JSON.parse(readFileSync(new URL('./serviceAccount.json', import.meta.url)))),
});
const db = admin.firestore();
const ts = admin.firestore.FieldValue.serverTimestamp();
const [cmd, arg] = process.argv.slice(2);

if (cmd === 'seed') {
  const batch = db.batch();
  for (const [id, m] of Object.entries(SENSORS)) batch.set(db.doc(`sensors/${id}`), m);
  await batch.commit();
  console.log('Sensores cargados:', Object.keys(SENSORS).length);
} else if (cmd === 'ALARM') {
  await db.doc(`alarms/${arg}`).set({ sensorId: arg, status: 'active', ts });
} else if (cmd === 'RESTORE') {
  await db.doc(`alarms/${arg}`).set({ status: 'cleared', clearedAt: ts }, { merge: true });
} else if (cmd === 'HEARTBEAT') {
  await db.doc(`panels/${arg}`).set({ lastSeen: ts });
} else {
  console.log('Comando no reconocido. Ver instrucciones al inicio del archivo.');
}
process.exit(0);
