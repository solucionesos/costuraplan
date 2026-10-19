# CosturaPlan — Gestión de Costura y Calendario de Evacuación por Color

Aplicación web progresiva (**PWA**) y lista para empaquetar como **App Nativa Android / iOS (Capacitor)** para talleres de confección.

## Funciones Principales
1. **Base de Datos de Operaciones de Costura**: Catálogo editable de operaciones por tipo de máquina (*Fileteadora, Plana, Collarín, Presilladora, Ojaladora, Botonadora, Manual, Especial*) con tiempos estándar (en minutos o segundos por prenda).
2. **Configuración de Días y Horario Semanal**: Configuración de jornada de Lunes a Domingo (hora inicio, hora fin, minutos de almuerzo) y días festivos/no laborables.
3. **Registro de Producciones por Lote y Color**: Registro de prenda, referencia, fecha de recepción, fecha de entrega, colores con unidades y orden de prioridad, y secuencia de operaciones con sus tiempos.
4. **Calendario Día a Día con Evacuación por Color**: Programa cada jornada laboral completando el **100% de las operaciones de un color** antes de pasar al siguiente color, permitiendo alternar entre **Modo Cumplir Fecha de Entrega** y **Modo Horario Normal**.

## Comandos Rápidos

```bash
# Levantar aplicación en contenedor Docker (disponible en http://localhost:8080)
docker compose up -d --build

# Iniciar servidor de desarrollo local
npm run dev

# Ejecutar pruebas unitarias y cobertura de ramas
npm test

# Compilar versión de producción (genera carpeta dist/)
npm run build
```

## Cómo Convertir en App de Celular (APK Android / iOS)

### Opción A: Instalar como PWA directa (Sin cables, 100% Offline)
1. Abre la aplicación desde Chrome (Android) o Safari (iPhone).
2. Selecciona **"Instalar aplicación"** o **"Agregar a pantalla de inicio"**.

### Opción B: Generar APK Nativo con Capacitor
```bash
npm run build
npx cap add android
npx cap sync android
npx cap open android
```
