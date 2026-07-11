# ADR-001: Arquitectura Limpia y reglas de dependencia

- Estado: Aceptado
- Fecha: 2026-07-10

## Contexto

El sistema debe evolucionar de SQLite a PostgreSQL y puede incorporar otros proveedores de red. Una organización por framework permitiría que Express, consultas SQL o RouterOS se filtren hacia las reglas de negocio.

## Decisión

La estructura lógica tendrá cuatro fronteras:

```text
api → application → domain
infrastructure → application
```

- `domain`: entidades, reglas, políticas y eventos de negocio puros.
- `application`: casos de uso, puertos, transacciones lógicas y coordinación de módulos.
- `infrastructure`: adaptadores concretos de persistencia, MikroTik, eventos, trabajos, secretos y observabilidad.
- `api`: adaptador HTTP que autentica, valida formato y delega en casos de uso.

`domain` no importa otra capa. `application` no importa Express, SQLite, RouterOS ni SDK de OpenAI. `infrastructure` implementa los puertos definidos por `application`. `api` no contiene reglas de negocio ni consultas a la base de datos.

`shared` solo puede contener primitivas estables, errores comunes y tipos sin dependencia de dominio. No se usa como almacén genérico.

## Consecuencias

La implementación tendrá más interfaces explícitas y composición de dependencias. A cambio, los proveedores externos pueden reemplazarse sin reescribir las políticas centrales.
