# CarbCalc: Especificaciones del Módulo "Paciente" (Sub-App)

Este documento define la arquitectura y funcionalidad del **Modo Paciente**, una extensión crítica de la PWA CarbCalc diseñada para la gestión clínica individualizada del paciente con diabetes.

---

## 1. Filosofía de "Doble Identidad" (UX/UI)
La aplicación debe comportarse como dos herramientas distintas basadas en el contexto de la ruta y el perfil del usuario.

- **Modo Chef (Grupo/Cocina):** - **Ruta:** `/chef/*`
  - **Diseño:** Colores cálidos (Verde/Naranja), tipografías amigables.
  - **Foco:** Colaboración familiar para el pesaje y cálculo de raciones netas.
- **Modo Paciente (Clínico):** - **Ruta:** `/patient/*`
  - **Diseño:** "Modo Clínico" (Azul noche `#0f172a`, gris técnico), tipografías monoespaciadas para valores numéricos.
  - **Foco:** Gestión de insulina, correcciones de urgencia y monitoreo de glucosa.

---

## 2. Arquitectura de Acceso y Puntos de Entrada
Para simular dos aplicaciones independientes con un único código base:

### A. PWA Shortcuts
El `manifest.json` debe incluir accesos directos que permitan al usuario anclar iconos independientes en su pantalla de inicio:
- **Shortcut 1:** "Cocinar" -> Enlace a `/chef`
- **Shortcut 2:** "Mi Dosis" -> Enlace a `/patient`

### B. Tematizado Dinámico
Uso de variables CSS reactivas al contexto del router para asegurar un aislamiento visual total (Cero contaminación visual entre modos).

---

## 3. Estructura de Datos y Privacidad (Firebase)

### A. Espacio Compartido (`groups/{groupId}`)
- Almacena recetas, ingredientes base y repartos del grupo familiar.
- Accesible por todos los miembros invitados.

### B. Muro de Privacidad (`users/{uid}`)
- **Configuración Médica:** Ratios de Insulina (por franjas horarias), Factor de Sensibilidad (ISF), Objetivos de Glucemia, Duración de Acción de Insulina (DIA).
- **Historial Clínico:** Subcolección privada con registros de inyecciones, glucemias manuales y notas.
- **Reglas de Seguridad:** Acceso restringido estrictamente al dueño del `uid`.

---

## 4. Calculadora de Insulina de Precisión

La sub-app debe calcular la dosis basándose en carbohidratos netos y parámetros dinámicos:

### Fórmula de Cálculo
$$Dosis_{Total} = \left( \frac{HC_{Comida}}{Ratio} \right) + \text{max} \left( 0, \frac{G_{Actual} - G_{Objetivo}}{ISF} - IOB \right)$$

### Lógica de Seguridad Obligatoria:
1. **Insulina a Bordo (IOB):** Rastrear la insulina activa de dosis anteriores para evitar hipoglucemias por acumulación (*stacking*).
2. **Redondeo Configurable:** Opción de ajustar el resultado a pasos de 0.5 o 1 unidad según el dispositivo de inyección del paciente.
3. **Franjas Horarias:** El sistema debe detectar la hora actual y aplicar el Ratio e ISF correspondientes a ese tramo (ej. Desayuno, Comida, Merienda, Cena).

---

## 5. Integración con Sensores de Glucosa (CGM)
Priorizar la automatización para evitar errores humanos:
- **Conector Nightscout:** Fetch de datos en tiempo real mediante API REST (`/entries.json`).
- **Conector Local xDrip+:** Consulta al servidor local de Android (`http://127.0.0.1:17580`) para obtener glucosa y flecha de tendencia.
- **Fallback Manual:** Interfaz rápida de entrada numérica para glucemias capilares.

---

## 6. Flujo de Trabajo y Funciones Clave

### A. El "Dashboard" del Paciente
- Widget de glucosa actual con flecha de tendencia.
- Indicador visual de Insulina a Bordo (IOB).
- Botón de **"Pánico/Corrección Rápida"** (Salta el cálculo de comida).

### B. El Puente de Cocina a Dosis
Al finalizar un cálculo en el Modo Chef, un botón "Calcular mi Dosis" transfiere los HC calculados al Modo Paciente de forma transparente, manteniendo el estado de la receta.

### C. Extras Rápidos
Botones preconfigurados para añadir HC comunes (ej. +10g Pan, +15g Fruta, +5g Azúcar) sin necesidad de buscarlos en la base de datos principal, facilitando ajustes de última hora en la mesa.

---

## 7. Requisitos Técnicos de Implementación
- **Estado Global:** Separación de `sharedStore` y `patientStore`.
- **Persistencia:** Almacenamiento en `IndexedDB` para funcionamiento 100% Offline (Crucial para seguridad médica).
- **Notificaciones:** Sistema de alertas locales para el control post-pandrial (2 horas después de la dosis).
- **Base de Datos:** Uso estricto de la lista de **150 ingredientes con Carbohidratos Netos** configurados.