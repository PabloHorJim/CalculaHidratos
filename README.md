# CarbCalc 🍽️

**Calculadora de carbohidratos para familias con miembros diabéticos.**

CarbCalc es una aplicación web progresiva (PWA) diseñada para facilitar el cálculo y reparto de carbohidratos en las comidas familiares. Permite crear recetas, calcular los HC totales, y repartir las raciones según la proporción de cada miembro de la familia.

## ✨ Funcionalidades

- **Calculadora de HC** — Añade ingredientes con sus pesos y calcula los carbohidratos totales automáticamente
- **Reparto familiar** — Distribuye la comida entre los miembros de la familia según sus proporciones
- **Gestión de recetas** — Guarda, edita y reutiliza tus recetas
- **Soporte multi-diabético** — Muestra los HC individuales para cada miembro diabético
- **Sin utensilio** — Opción de pesar directamente la comida sin descontar utensilios
- **Apartar comida** — Aparta una parte (en % o gramos) antes del reparto
- **Error de pesaje configurable** — Reduce las raciones automáticamente para compensar errores de pesaje
- **Historial de comidas** — Registra y consulta los repartos anteriores
- **Estadísticas** — Panel de estadísticas centrado en los miembros diabéticos (media por comida, diaria, gráficos)
- **Compartir** — Comparte raciones individuales o el reparto completo por WhatsApp o portapapeles
- **Comida rápida** — Lo que come una sola persona sin cocinar (fruta, pan, un yogur): por gramos o por unidades
- **Unidades y peso cocido** — «2 plátanos», «1 rebanada»; pasta, arroz y legumbres pesados ya cocidos; multiplicar una receta (×1,5, ×2…)
- **Código de barras** — Crea ingredientes envasados con los datos de Open Food Facts
- **Modo paciente** — Calculadora de dosis privada, con la glucosa del sensor (LibreLinkUp o Nightscout) y gráfica con comidas y dosis
- **Avisos a la familia** — Notificación en el móvil cuando alguien guarda un reparto
- **Invitaciones caducables** — Código, enlace o QR válidos 24 horas para unirse al grupo
- **Accesibilidad** — Tamaño de texto ajustable por móvil, zoom, lectores de pantalla, menos movimiento
- **Sincronización en la nube** — Comparte datos en tiempo real con tu familia mediante Firebase
- **PWA installable** — Instálala como app nativa en tu móvil
- **Tutorial interactivo** — Guía paso a paso para nuevos usuarios

## 🛡️ Aviso Legal

Esta aplicación se proporciona **sin garantía alguna**. Los cálculos son orientativos y **no deben usarse como sustituto del consejo médico profesional**. Consulta siempre con tu endocrino.

## 🚀 Stack Tecnológico

| Tecnología | Uso |
|---|---|
| React 19 | UI framework |
| Vite 6 | Build tool + dev server |
| Tailwind CSS 4 | Estilos |
| Firebase 12 | Auth (Google), Firestore, Hosting |
| Framer Motion | Animaciones |
| vite-plugin-pwa | Service Worker + manifest PWA |
| Lucide React | Iconos |

## 📦 Instalación Local

```bash
# Clonar el repositorio
git clone https://github.com/PabloHorJim/CalculaHidratos.git
cd CalculaHidratos

# Instalar dependencias
npm install

# Configurar variables de entorno
cp .env.example .env
# Edita .env con tus credenciales de Firebase

# Ejecutar en modo desarrollo
npm run dev
```

## 🔒 Variables de Entorno

Crea un archivo `.env` (o configúralas en Vercel/tu hosting):

```env
VITE_FIREBASE_API_KEY=tu_api_key
VITE_FIREBASE_AUTH_DOMAIN=tu_proyecto.firebaseapp.com
VITE_FIREBASE_PROJECT_ID=tu_proyecto
VITE_FIREBASE_STORAGE_BUCKET=tu_proyecto.appspot.com
VITE_FIREBASE_MESSAGING_SENDER_ID=123456789
VITE_FIREBASE_APP_ID=1:123456789:web:abc123
VITE_FIREBASE_FIRESTORE_DATABASE_ID=(default)
```

## 📁 Estructura del Proyecto

```
src/
├── App.tsx                     # Shell principal (routing + layout)
├── main.tsx                    # Entry point
├── firebase.ts                 # Configuración Firebase + offline persistence
├── types.ts                    # Tipos TypeScript
├── index.css                   # Estilos globales
├── components/
│   ├── RecipeTab.tsx           # Pestaña Cocinar
│   ├── SplitTab.tsx            # Pestaña Reparto
│   ├── FamilyTab.tsx           # Pestaña Familia
│   ├── CookwareTab.tsx         # Gestión de utensilios
│   ├── SavedRecipesTab.tsx     # Recetas guardadas
│   ├── HistoryTab.tsx          # Historial de comidas
│   ├── GroupTab.tsx             # Sincronización en la nube
│   ├── StatsTab.tsx            # Panel de estadísticas
│   ├── LegalNotice.tsx         # RGPD + disclaimer
│   ├── Sidebar.tsx             # Menú lateral
│   ├── OnboardingTutorial.tsx  # Tutorial interactivo
│   ├── NavButton.tsx           # Botón de navegación
│   └── SidebarButton.tsx       # Botón del sidebar
├── hooks/
│   └── useAppState.ts          # Hook central de estado
└── data/
    └── ingredients.ts          # Base de datos de ingredientes
```

## ✅ Tests

```bash
npm run lint        # TypeScript estricto
npm test            # unitarios: sincronización simulada, reparto, dosis, unidades/cocido, sensor, avisos, Alexa, proxy de login
npm run test:rules  # reglas de seguridad contra el emulador de Firestore (necesita Java)
npm run test:e2e    # tres navegadores contra los emuladores: grupos e invitaciones, sincronización, sin conexión, comida rápida, modo paciente
```

## 🚀 Despliegue

### Orden para desplegar esta versión (importante)

1. **Publica primero las reglas** de `firestore.rules` (son compatibles con la versión anterior de la app):
   `npx firebase-tools deploy --only firestore:rules --project <tu-proyecto>`, o pégalas en la consola de Firebase.
   Si usas una base de datos con nombre (`VITE_FIREBASE_FIRESTORE_DATABASE_ID`), publícalas en esa base de datos.
   Sin las reglas nuevas, el historial de comidas y el modo paciente no se sincronizan (la app muestra "Error de nube").
2. **Despliega la app.** La primera vez que cada persona la abra se apuntará sola en la lista de miembros de su grupo y
   el historial se moverá a la colección `meals`. Quien siga con la versión antigua dejará de ver el grupo hasta que su
   app se actualice (basta con abrirla de nuevo).
3. **Alexa:** añade en Vercel `NODEJS_HELPERS=0` (y, si quieres, `ALEXA_SKILL_ID`). El endpoint ahora rechaza peticiones
   que no vengan firmadas por Amazon; si la skill dejase de responder, mira los logs de la función y pon
   temporalmente `ALEXA_SIGNATURE_MODE=log`.

### Novedades que necesitan configuración (todas opcionales)

Sin configurar nada, la app funciona igual que antes; cada bloque se activa por separado.

**1. Reglas de Firestore (obligatorio para las invitaciones).** Vuelve a publicar `firestore.rules`: las invitaciones caducables usan la colección `invites`. Los grupos antiguos siguen funcionando: sus miembros se registran solos al abrir la app nueva y disponen de 30 días desde que lo haga el primero; después, solo se entra con invitación.

**2. Avisos a la familia (push).**
1. `npx web-push generate-vapid-keys` genera una clave pública y una privada.
2. En Vercel: `VITE_VAPID_PUBLIC_KEY` (pública), `VAPID_PRIVATE_KEY` (privada) y `VAPID_SUBJECT` (`mailto:` con un correo de contacto). Vuelve a desplegar.
3. Cada persona los activa en su móvil: menú → *Ajustes de este móvil* → *Activar avisos*. En iPhone hay que instalar antes la app en la pantalla de inicio (iOS 16.4 o posterior).

**3. Sensor de glucosa** (Modo paciente → Sensor de glucosa).
- *Nightscout*: dirección `https://…` del sitio y, si lo exige, un token de solo lectura. El sitio debe permitir CORS (activado por defecto en Nightscout).
- *LibreLinkUp*: usa `/api/glucose`, que necesita `FIREBASE_SERVICE_ACCOUNT` (el mismo de Alexa). Hace falta una cuenta de LibreLinkUp invitada desde FreeStyle LibreLink. No es una API oficial: si deja de funcionar, prueba a subir `LIBRE_LLU_VERSION` a la versión actual de la app LibreLinkUp.

**4. App Check** (impide usar la base de datos desde fuera de la app).
1. Firebase Console → App Check → registra la app web con reCAPTCHA v3 y copia la *site key*.
2. `VITE_FIREBASE_APPCHECK_SITE_KEY=<site key>` en Vercel y despliega.
3. Deja pasar unos días mirando en App Check → *Métricas* que las peticiones aparecen como verificadas, y entonces pulsa *Aplicar* (enforce) en Firestore y Authentication. No lo apliques antes: los móviles con la versión antigua dejarían de sincronizar. Alexa y los avisos no se ven afectados (usan la cuenta de servicio).

**5. Alexa: frases nuevas.** Añade los intents de `alexa/intents.es-ES.json` en la consola de Alexa (Build → JSON Editor) y pulsa *Build Model*: «añade dos plátanos», «quita el arroz», «¿cuántos hidratos lleva?», «empieza una receta nueva».

**6. Base de datos con nombre.** Si usas `VITE_FIREBASE_FIRESTORE_DATABASE_ID` distinto de `(default)`, define también `FIRESTORE_DATABASE_ID` en Vercel para que Alexa y los avisos usen esa misma base.

### Inicio de sesión dentro de la app instalada (opcional)

Las ventanas emergentes de Google fallan a menudo en una PWA instalada. Para usar el inicio de sesión por redirección:

1. En Vercel, define `FIREBASE_PROJECT_ID` (o deja `VITE_FIREBASE_PROJECT_ID`) y cambia
   `VITE_FIREBASE_AUTH_DOMAIN` al dominio de la app (p. ej. `mi-app.vercel.app`). `vercel.json` ya sirve
   `/__/auth/*` desde ese dominio a través de `api/auth-proxy.ts`.
2. En Google Cloud → Credenciales → cliente OAuth web, añade `https://<dominio-de-la-app>/__/auth/handler`
   a los URI de redirección autorizados.
3. En Firebase Authentication → Dominios autorizados, comprueba que está el dominio de la app.

Mientras `VITE_FIREBASE_AUTH_DOMAIN` no coincida con el dominio de la app, se sigue usando la ventana emergente.

### Vercel (recomendado)

1. Conecta el repo a [Vercel](https://vercel.com)
2. Configura las variables de entorno en la UI de Vercel
3. Deploy automático en cada push a `main`

### Firebase Hosting (alternativa)

```bash
npm run build
firebase deploy --only hosting
```

## 🤝 Contribuciones

¡Las contribuciones son bienvenidas! Si quieres contribuir:

1. **Fork** el repositorio
2. Crea una rama para tu feature: `git checkout -b feature/mi-mejora`
3. Haz tus cambios siguiendo las convenciones del proyecto
4. Ejecuta `npm run lint` para verificar que no hay errores
5. Crea un **Pull Request** con una descripción clara

### Convenciones

- **Idioma de la UI**: Español (España)
- **Commits**: Conventional Commits en inglés (`feat:`, `fix:`, `docs:`, etc.)
- **Componentes**: React funcional + hooks
- **Estilos**: Tailwind CSS (clases utility)
- **Estado**: Hook centralizado `useAppState` — no Redux ni Context API

### Ideas para contribuir

- 🔍 Buscador de alimentos por código de barras (OpenFoodFacts)
- 📊 Gráficos más avanzados (tendencias semanales, comparativas)
- 🌐 Soporte multi-idioma
- 📱 Mejoras de UX para pantallas pequeñas
- 🧪 Tests unitarios y de integración

## 📄 Licencia

MIT License. Ver [LICENSE](LICENSE) para más detalles.

## 📬 Contacto

- **Email**: pablohormigosjimenez@gmail.com
- **Issues**: [GitHub Issues](https://github.com/PabloHorJim/CalculaHidratos/issues)
