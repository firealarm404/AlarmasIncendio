// Pega aquí la configuración de tu app web de Firebase
// (Consola Firebase → Configuración del proyecto → Tus apps → Web).
// Estos valores NO son secretos: la seguridad la dan las reglas de firestore.rules.
export const firebaseConfig = {
  apiKey: "REEMPLAZAR",
  authDomain: "TU-PROYECTO.firebaseapp.com",
  projectId: "TU-PROYECTO",
  appId: "REEMPLAZAR",
};

// Mientras apiKey sea "REEMPLAZAR", la app corre en modo demo (sin Firebase).
export const DEMO = firebaseConfig.apiKey === "REEMPLAZAR";
