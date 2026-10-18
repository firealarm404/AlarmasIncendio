# Central de alarmas de incendio (3D, tiempo real)

Web estática (GitHub Pages) + Firestore. Sin build: solo HTML, CSS y JS.

## 1. Probar sin Firebase
Sube los archivos a GitHub (o abre con un servidor local: `python -m http.server`).
Mientras `js/config.js` tenga `REEMPLAZAR`, la app corre en **modo demo** con botones para simular alarmas.
(No funciona abriendo `index.html` con doble clic: los módulos requieren http/https.)

## 2. Firebase
1. Crea un proyecto en https://console.firebase.google.com
2. **Authentication** → Método de acceso → activa *Correo/contraseña* y crea los usuarios operadores.
3. **Authentication → Configuración → Dominios autorizados**: agrega `TU-USUARIO.github.io`.
4. **Firestore Database** → crear base de datos (modo producción).
5. **Firestore → Reglas**: pega `firestore.rules` y publica.
6. **Configuración del proyecto → Tus apps → Web**: copia la config en `js/config.js`.

## 3. Cargar sensores y probar
Cuenta de servicio: Configuración → Cuentas de servicio → Generar clave. Guárdala como `tools/serviceAccount.json`.
```
cd tools && npm install
node send-alarm.js seed
node send-alarm.js ALARM P1-Z03
node send-alarm.js RESTORE P1-Z03
```
Edita `SENSORS` en `js/data.js` con tus sensores reales antes del `seed`.

## 4. Publicar en GitHub Pages
Repositorio → Settings → Pages → Deploy from branch → `main` / root.

## 5. Paneles reales
Los paneles físicos no escriben a Firestore directamente. Un equipo en sitio (PC/Raspberry con respaldo de energía)
lee el panel (Modbus, BACnet, relés, Contact-ID) y ejecuta la lógica de `tools/send-alarm.js`:
`ALARM`/`RESTORE` por cada evento y `HEARTBEAT` cada 30 s. Si un panel deja de enviar heartbeat por 90 s,
el dashboard muestra una advertencia ámbar.

## Seguridad y límites
- Este sistema complementa, no reemplaza, la monitorización certificada del panel (NFPA 72 o norma local).
- Nunca subas `serviceAccount.json`. La `apiKey` web sí es pública; la protección son las reglas de Firestore.
- Un sensor sin mapear aparece en la lista como "Sin mapear" en vez de descartarse.
