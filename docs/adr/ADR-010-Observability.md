# ADR-010: Observabilidad operativa

- Estado: Aceptado
- Fecha: 2026-07-10

## Contexto

Workers, Scheduler, RouterOS y proveedores externos introducen fallas asíncronas que no se detectan solo con respuestas HTTP.

## Decisión

Infrastructure incluirá logs estructurados, métricas, health checks, trazas y alertas. Toda solicitud, evento y operación técnica lleva `correlationId`. Se medirán operaciones pendientes/fallidas, duración de RouterOS, reintentos, salud de workers, retraso del outbox y disponibilidad de base de datos.

Los logs excluyen secretos, tokens, contraseñas y datos personales innecesarios. Los endpoints de salud no divulgan información operativa sensible.

## Consecuencias

El equipo puede detectar operaciones detenidas y degradación antes de que se conviertan en pérdida de servicio. La telemetría no reemplaza la auditoría de negocio.
