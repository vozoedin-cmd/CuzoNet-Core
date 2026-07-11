import express from 'express';
import request from 'supertest';
import { describe, expect, it } from 'vitest';

import { createApp } from '../../backend/api/http/app.js';
import { errorHandlerMiddleware } from '../../backend/api/http/middlewares/error-handler.middleware.js';
import { correlationIdMiddleware } from '../../backend/api/http/middlewares/correlation-id.middleware.js';

const UUID_PATTERN =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

describe('GET /health', () => {
  it('devuelve 200 con la estructura exacta del contrato y un timestamp UTC válido', async () => {
    const response = await request(createApp()).get('/health').expect(200);

    expect(Object.keys(response.body)).toEqual(['status', 'timestamp']);
    expect(response.body.status).toBe('ok');
    expect(response.body.timestamp).toEqual(expect.any(String));
    expect(response.body.timestamp.endsWith('Z')).toBe(true);
    expect(new Date(response.body.timestamp).toISOString()).toBe(response.body.timestamp);
  });

  it('genera un correlation ID cuando la solicitud no lo incluye', async () => {
    const response = await request(createApp()).get('/health').expect(200);

    expect(response.headers['x-correlation-id']).toMatch(UUID_PATTERN);
  });

  it('propaga un correlation ID seguro recibido de una integración', async () => {
    const correlationId = 'n8n-execution_123.abc';

    const response = await request(createApp())
      .get('/health')
      .set('X-Correlation-Id', correlationId)
      .expect(200);

    expect(response.headers['x-correlation-id']).toBe(correlationId);
  });

  it('devuelve el contrato ApiError para una ruta inexistente', async () => {
    const correlationId = '5c2cb32f-3bc5-4b24-9a2d-a79dc0608e5f';

    const response = await request(createApp())
      .get('/ruta-inexistente')
      .set('X-Correlation-Id', correlationId)
      .expect(404);

    expect(response.body).toEqual({
      code: 'RESOURCE_NOT_FOUND',
      correlationId,
      message: 'Recurso no encontrado.',
    });
  });
});

describe('manejo global de errores', () => {
  it('no expone el stack ni detalles internos', async () => {
    const app = express();
    const internalDetail = 'postgres://secret-user:secret-password@internal-host';

    app.use(correlationIdMiddleware);
    app.get('/error-interno', () => {
      throw new Error(internalDetail);
    });
    app.use(errorHandlerMiddleware);

    const response = await request(app).get('/error-interno').expect(500);
    const serializedResponse = JSON.stringify(response.body);

    expect(response.body.code).toBe('INTERNAL_SERVER_ERROR');
    expect(response.body.message).toBe('Error interno del servidor.');
    expect(response.body.correlationId).toMatch(UUID_PATTERN);
    expect(serializedResponse).not.toContain(internalDetail);
    expect(serializedResponse).not.toContain('stack');
  });
});
