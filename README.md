# Sistema de seguridad · Monitoreo de complejo

Web estática (GitHub Pages) + Firestore. Sin build: solo HTML, CSS y JS.

## 1. Probar sin Firebase
Mientras `js/config.js` tenga `REEMPLAZAR`, la app corre en **modo demo**: botón para ver como usuario o administrador,
y todo lo que edites se guarda en tu navegador (localStorage).
(No funciona abriendo `index.html` con doble clic: los módulos requieren http/https.)

## 2. Firebase
1. Crea un proyecto en https://console.firebase.google.com
2. **Authentication** → activa *Correo/contraseña* y crea los usuarios.
3. **Authentication → Configuración → Dominios autorizados**: agrega `TU-USUARIO.github.io`.
4. **Firestore Database** → crear base de datos. **Reglas**: pega `firestore.rules` y publica.
5. Copia la config web de Firebase en `js/config.js`.

## 3. Roles
- **Usuario** (por defecto): ve el mapa, las alarmas y despacha brigadas.
- **Administrador**: además ve el botón *Administrar* (edificios, alarmas, calibración).

Para hacer administrador a alguien: en Firestore crea el documento `users/{UID}` con el campo `role` = `admin`
(el UID está en Authentication → Usuarios). Las reglas impiden que nadie se asigne ese rol desde la web.

## 4. Alarmas reales
El administrador crea cada alarma en *Administrar → Alarmas* con su **Código del panel** (ej. `P1-Z03`).
Un equipo en sitio ejecuta `tools/send-alarm.js` con ese mismo código:
```
cd tools && npm install
node send-alarm.js ALARM P1-Z03
node send-alarm.js RESTORE P1-Z03
node send-alarm.js HEARTBEAT P1    # cada 30 s por panel
```
Requiere `tools/serviceAccount.json` (no lo subas a GitHub).

## 5. Publicar en GitHub Pages
Repositorio → Settings → Pages → Deploy from branch → `main` / root.

## Seguridad y límites
- Este sistema complementa, no reemplaza, la monitorización certificada del panel (NFPA 72 o norma local).
- La `apiKey` web es pública; la protección son las reglas de Firestore.
- Un sensor sin mapear aparece como "Sin mapear" en vez de descartarse.

## Auditoría, simulacro y respaldo (Administrar)
- **Auditoría:** registra ingresos, despachos, guardados del plano y simulacros (quién y cuándo). Los registros no se pueden editar ni borrar. Solo el administrador los lee.
- **Simulacro:** muestra una alarma en ámbar, marcada como simulacro, para todos los operadores. Nunca desplaza a una alarma real.
- **Respaldo:** descarga y restaura el plano en un archivo JSON. Guarda una copia fuera de Firebase.
- **Sin enlace:** si Firestore deja de responder, aparece una franja roja arriba. Con el enlace caído NO llegan alarmas.
