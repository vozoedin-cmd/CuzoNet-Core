# CuzoNet

ERP especializado para WISP, construido como monolito modular con Arquitectura Limpia.

## Estado actual

Este repositorio contiene únicamente el esqueleto del proyecto y su configuración de calidad. No hay API, lógica de negocio, conexión a base de datos, migraciones, workers, Scheduler ni integración con MikroTik, n8n u OpenAI.

## Arquitectura

- `backend/domain`: reglas y agregados puros del negocio.
- `backend/application`: casos de uso, puertos y coordinación de módulos.
- `backend/infrastructure`: adaptadores de persistencia, red, integración, observabilidad y procesos futuros.
- `backend/api`: adaptador HTTP futuro; no contiene lógica de negocio.
- `backend/shared`: primitivas transversales sin dependencia de dominio.
- `tests`: espacios para pruebas unitarias, de integración y de contrato.
- `docs`: arquitectura aprobada, contratos y convenciones.

Las dependencias permitidas son `api → application → domain` e `infrastructure → application`.

## Documentación aprobada

- `docs/adr/`: decisiones de arquitectura.
- `docs/modelo-relacional.md`: modelo lógico de datos.
- `docs/openapi.yaml`: contrato HTTP.
- `docs/event-catalog.md`: eventos versionados.
- `docs/domain-model.md`: agregados e invariantes.
- `docs/glosario.md` y `docs/conventions.md`: términos y normas del proyecto.

## Tooling

TypeScript, ESLint y Prettier están configurados, pero no se han instalado dependencias ni se ha generado código fuente. Husky y lint-staged se propondrán cuando exista código que validar antes de un commit.

La arquitectura está congelada: cualquier cambio estructural requiere ADR y aprobación explícita.
