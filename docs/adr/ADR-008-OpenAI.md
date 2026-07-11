# ADR-008: IA como consumidor restringido de casos de uso

- Estado: Aceptado
- Fecha: 2026-07-10

## Contexto

La IA puede asistir por WhatsApp para buscar clientes, consultar deuda, registrar solicitudes y explicar estados. No debe poder inventar operaciones ni ejecutar acciones privilegiadas sin reglas.

## Decisión

El módulo AI vive en Application; el cliente OpenAI es una integración de Infrastructure. Los agentes usan herramientas tipadas que invocan casos de uso autorizados, nunca consultas SQL ni comandos RouterOS arbitrarios. Acciones sensibles requieren identidad verificada, autorización, confirmación según política y auditoría.

La memoria se minimiza, tiene retención definida y no almacena secretos ni datos de pago innecesarios. Los prompts y resultados relevantes se versionan y registran con controles de privacidad.

## Consecuencias

Se limita la capacidad autónoma de la IA, pero se preservan seguridad, explicabilidad y consistencia del negocio.
