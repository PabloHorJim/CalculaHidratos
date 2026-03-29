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

## 🚀 Despliegue

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
