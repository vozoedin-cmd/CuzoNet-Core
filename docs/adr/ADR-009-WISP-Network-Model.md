# ADR-009: Modelo de red e inventario WISP

- Estado: Aceptado
- Fecha: 2026-07-10

## Contexto

Un WISP administra tanto servicios de clientes como CPE, routers, AP, switches, enlaces PTP, nodos, torres y sectores. Modelar cada equipo únicamente dentro del cliente impide conocer capacidad y topología.

## Decisión

Inventory representa activos físicos reutilizables: modelo, serial, MAC, interfaz, estado y asignaciones históricas. Network representa topología lógica y física: nodos, torres, sectores, enlaces y extremos. Un servicio se vincula a activos y puntos de acceso mediante relaciones temporales.

Routers administrados son activos de inventario y pueden tener una configuración técnica asociada en el adaptador MikroTik. La topología se mantiene separada de la configuración dinámica del router.

## Consecuencias

El sistema puede responder qué equipo tiene un cliente, por qué sector se atiende y qué enlace afecta a un nodo sin duplicar atributos del activo.
