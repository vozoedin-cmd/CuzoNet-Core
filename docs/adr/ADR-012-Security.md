# ADR-012: Seguridad, autorización y auditoría

- Estado: Aceptado
- Fecha: 2026-07-10

## Contexto

CuzoNet trata datos personales, estados financieros, operaciones de red y credenciales de integración. Un token de n8n o una solicitud de IA no puede tener privilegios administrativos implícitos.

## Decisión

Usuarios humanos se autentican con sesiones o tokens de corta duración y autorización basada en roles y permisos. Integraciones usan claves distintas, rotables y con scopes mínimos. Las mutaciones requieren validación de entrada, `Idempotency-Key`, auditoría y control de tasa cuando corresponda.

Secretos se obtienen de variables de entorno o un gestor de secretos; nunca se guardan en texto plano, repositorio, logs o respuestas HTTP. El acceso se protege con HTTPS, cifrado de credenciales técnicas y principios de mínimo privilegio.

## Consecuencias

La administración de credenciales y permisos exige procesos operativos, pero reduce el impacto de una clave comprometida y permite atribuir operaciones a un actor concreto.
