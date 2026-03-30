# Ideas y Futuras Funcionalidades para CarbCalc

Este documento sirve como repositorio de ideas, arquitecturas propuestas y mejoras funcionales que se pueden implementar en el futuro para llevar la aplicación al siguiente nivel.

## 1. Modo Paciente (Cálculo Avanzado de Insulina)

**Objetivo:** Permitir al paciente diabético calcular su dosis exacta de insulina rápida basándose en la comida calculada por la familia, añadiendo extras y ajustando según sus propios parámetros médicos, sin ensuciar la interfaz ni exponer datos médicos al resto del grupo familiar.

### Arquitectura de Datos y Privacidad
- Mantenemos una única aplicación (PWA compartida).
- Los datos de la **receta y el reparto** seguirán guardándose en la subcolección compartida `groups/{groupId}`.
- Los **parámetros médicos** (Ratios de Insulina, Factor de Sensibilidad, Objetivos de Glucemia) se guardarán de forma estrictamente privada en el documento del usuario en Firebase: `users/{uid}`.
- Reglas de Firestore: Nadie más en el grupo (ni siquiera el administrador, salvo que sea el propio paciente) podrá leer o escribir en `users/{uid}`.

### Flujo de Usuario (UX/UI)
1. **Activación del Modo:** En la pestaña "Configuración", el usuario puede alternar un interruptor llamado "Modo Salud / Modo Paciente". Si está activo, aparece una nueva pestaña principal en la app: **💉 Dosis** o **🩺 Salud**.
2. **Entrada de Datos (La Comida):**
   - Al entrar a la pestaña "Dosis", la app lee el último reparto guardado en el historial (ej. "Lentejas con chorizo: 45g HC").
   - El paciente puede confirmar esa entrada o seleccionar otra reciente.
3. **Extras Rápidos:**
   - La interfaz incluye botones rápidos para sumar "extras" que no se cocinan pero se comen (ej. `+ Yogur (10g)`, `+ Pan (15g)`, `+ Fruta pequeña (12g)`). Esto se suma a los gramos de la comida calculada.
4. **Cálculo de Insulina (Fórmula Médica):**
   - El usuario introduce su **Glucemia Capilar Actual** (ej. 160 mg/dL).
   - La app determina automáticamente la franja horaria (Desayuno, Comida, Cena) y rescata el **Ratio de Insulina** configurado para esa hora.
   - Aplica la fórmula clínica:
     `Dosis = (Total HC / Ratio de Insulina) + ((Glucemia Actual - Glucemia Objetivo) / Factor de Sensibilidad)`
5. **Resultado y Feedback:**
   - Muestra claramente la sugerencia de dosis (ej. "Recomendación: 5.5 Unidades de Insulina Rápida").
   - Permite registrar y guardar esta acción en un "Historial Clínico" privado (colección `users/{uid}/clinical_history`) para posteriores exportaciones a su endocrino.

### Consideraciones de Implementación
- Habrá que crear un nuevo endpoint/hook (ej. `usePatientProfile`) que gestione el alta y actualización de estos datos privados (Ratios y Sensibilidad).
- Diseñar la UI de "Mi Dosis" de forma que sea un asistente paso a paso limpio: 1) Comida, 2) Extras, 3) Glucosa, 4) Resultado.
- Prever un manejo seguro en la PWA (offline) para que el paciente pueda calcular su dosis de insulina basándose en su configuración cacheada, independientemente de si hay conexión a internet.
- (Opcional) Integración con un **Temporizador Local** que envíe una notificación Push/Local a las 2 horas informando "⏰ Hora del control Post-pandrial de tu comida".
