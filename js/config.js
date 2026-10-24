// Configuración de Firebase (Consola Firebase → Configuración del proyecto → Tus apps → Web).
// Estos valores NO son secretos: la seguridad la dan las reglas de firestore.rules.
export const firebaseConfig = {
  apiKey: "AIzaSyDjifwpw82J727W-hWu8Er_TPcTV2lj_RA",
  authDomain: "monitoralarmas-71457.firebaseapp.com",
  projectId: "monitoralarmas-71457",
  storageBucket: "monitoralarmas-71457.firebasestorage.app",
  messagingSenderId: "167209803820",
  appId: "1:167209803820:web:6dbdcb59fc19ed766c7189",
};

// Mientras apiKey sea "REEMPLAZAR", la app corre en modo demo (sin Firebase).
export const DEMO = firebaseConfig.apiKey === "REEMPLAZAR";
