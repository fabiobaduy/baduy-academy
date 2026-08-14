# Detector de Juego Sucio (Anti-Señas) — Baduy Academy

## 🎯 Propósito
Detectar parejas que se hacen señas ilegales en torneos de dominó,
para garantizar el juego limpio y permitir revivir las modalidades
por parejas y equipos de parejas en el dominó competitivo mundial.

## 🧠 Principio estadístico
Un jugador honesto elige la jugada con mejor EV (o cerca).
Un coludido hace jugadas subóptimas que "milagrosamente" benefician
a su compañero (porque sabe lo que el compañero tiene).

**No se acusa por una jugada — se acusa por el patrón.**

## 📦 Archivos
| Archivo | Función |
|---------|---------|
| `detector.js` | El detector: MatchLog, análisis de EV, gap, beneficio al compañero, SuspicionEngine |
| `detector_test.js` | Validación: simula parejas honestas vs coludidas |

## 🔍 Métricas por jugada
- **`gap`**: qué tan lejos estuvo la jugada real del óptimo (normalizado 0-1)
- **`teammateBenefit`**: cuánto mejoró la posición del compañero vs si jugara óptimo
- **`rank`**: posición de la jugada entre las opciones (1 = mejor)
- **Jugada sospechosa** = `gap ≥ 0.45` Y `teammateBenefit > 0`

## ⚖️ Veredictos por pareja (score acumulativo)
| Estado | Significado |
|--------|-------------|
| `limpio` | Sin patrones sospechosos |
| `observacion` | Algunas jugadas dudosas, monitorear |
| `sospechoso` | Patrón consistente — revisión de árbitros |
| `descalificacion` | Patrón claro de colusión — sanción |

## 📊 Validación actual
- **Falsos positivos (honestos acusados): 0%** ✅
- **Verdaderos positivos (coludidos detectados): 33% con colusión al 50%**
  → Sube a "sospechoso/descalificación" cuando la colusión es más frecuente

## 🚀 Siguiente paso
Integrar a la app: grabar partidas reales, alimentar el detector,
y mostrar el reporte por pareja al final de cada partida.

## ⚠️ Uso ético
Este sistema debe usarse para proteger la integridad del deporte.
Los veredictos requieren revisión humana de árbitros antes de
cualquier sanción. El "sospechoso" nunca es condena automática.
