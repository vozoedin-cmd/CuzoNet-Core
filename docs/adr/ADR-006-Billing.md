# ADR-006: Facturación basada en documentos y asignaciones

- Estado: Aceptado
- Fecha: 2026-07-10

## Contexto

Deuda, saldo y mora no deben ser campos editables que se contradigan entre sí. Los pagos pueden cubrir varias facturas, ser parciales o dejar crédito.

## Decisión

Billing mantiene cuentas por servicio, facturas, líneas de factura, pagos, recibos y asignaciones de pago. Las facturas y pagos son documentos históricos; el saldo se deriva de sus importes y asignaciones. Los montos se guardan en centavos enteros y los cambios se corrigen mediante documentos de ajuste, no sobrescribiendo historia.

La condición financiera se evalúa en Billing y genera eventos. Provisioning interpreta la acción técnica correspondiente según políticas aprobadas.

## Consecuencias

La trazabilidad financiera es verificable y se evita duplicar saldos. Los reportes pueden reconstruirse sin depender de valores cacheados.
