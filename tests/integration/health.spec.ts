import express from 'express';
import request from 'supertest';
import { describe, expect, it } from 'vitest';

import { createApp } from '../../backend/api/http/app.js';
import { errorHandlerMiddleware } from '../../backend/api/http/middlewares/error-handler.middleware.js';
import { correlationIdMiddleware } from '../../backend/api/http/middlewares/correlation-id.middleware.js';

const UUID_PATTERN =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

describe('GET /api/v1/health', () => {
  it('devuelve 200 con la estructura exacta del contrato y un timestamp UTC válido', async () => {
    const response = await request(createApp()).get('/api/v1/health').expect(200);

    expect(Object.keys(response.body)).toEqual(['status', 'timestamp']);
    expect(response.body.status).toBe('ok');
    expect(response.body.timestamp).toEqual(expect.any(String));
    expect(response.body.timestamp.endsWith('Z')).toBe(true);
    expect(new Date(response.body.timestamp).toISOString()).toBe(response.body.timestamp);
  });

  it('genera un correlation ID cuando la solicitud no lo incluye', async () => {
    const response = await request(createApp()).get('/api/v1/health').expect(200);

    expect(response.headers['x-correlation-id']).toMatch(UUID_PATTERN);
  });

  it('propaga un correlation ID seguro recibido de una integración', async () => {
    const correlationId = 'n8n-execution_123.abc';

    const response = await request(createApp())
      .get('/api/v1/health')
      .set('X-Correlation-Id', correlationId)
      .expect(200);

    expect(response.headers['x-correlation-id']).toBe(correlationId);
  });

  it('devuelve el contrato ApiError para una ruta inexistente', async () => {
    const correlationId = '5c2cb32f-3bc5-4b24-9a2d-a79dc0608e5f';

    const response = await request(createApp())
      .get('/api/v1/ruta-inexistente')
      .set('X-Correlation-Id', correlationId)
      .expect(404);

    expect(response.body).toEqual({
      code: 'RESOURCE_NOT_FOUND',
      correlationId,
      message: 'Recurso no encontrado.',
    });
  });

  it('no mantiene disponible la ruta raíz antigua', async () => {
    const response = await request(createApp()).get('/health').expect(404);

    expect(response.body.code).toBe('RESOURCE_NOT_FOUND');
  });
});

describe('CORS', () => {
  it('expone la respuesta al origen permitido sin habilitar credenciales', async () => {
    const response = await request(createApp())
      .get('/api/v1/health')
      .set('Origin', 'http://localhost:3000')
      .expect(200);

    expect(response.headers['access-control-allow-origin']).toBe('http://localhost:3000');
    expect(response.headers['access-control-expose-headers']).toBe('X-Correlation-Id');
    expect(response.headers['access-control-allow-credentials']).toBeUndefined();
  });

  it('rechaza un origen no permitido con un ApiError correlacionado', async () => {
    const correlationId = '5c2cb32f-3bc5-4b24-9a2d-a79dc0608e5f';
    const response = await request(createApp())
      .get('/api/v1/health')
      .set('Origin', 'http://malicious.example')
      .set('X-Correlation-Id', correlationId)
      .expect(403);

    expect(response.body).toEqual({
      code: 'CORS_ORIGIN_NOT_ALLOWED',
      correlationId,
      message: 'El origen de la solicitud no está permitido por CORS.',
    });
    expect(response.headers['access-control-allow-origin']).toBeUndefined();
  });

  it('acepta el preflight con todos los métodos y headers contractuales', async () => {
    const response = await request(createApp())
      .options('/api/v1/clientes')
      .set('Origin', 'http://localhost:3000')
      .set('Access-Control-Request-Method', 'POST')
      .set(
        'Access-Control-Request-Headers',
        'Content-Type, X-Correlation-Id, Idempotency-Key, Authorization',
      )
      .expect(204);

    expect(response.headers['access-control-allow-origin']).toBe('http://localhost:3000');
    expect(response.headers['access-control-allow-methods']).toBe(
      'GET, POST, PUT, PATCH, DELETE, OPTIONS',
    );
    expect(response.headers['access-control-allow-headers']).toBe(
      'Content-Type, Authorization, X-Correlation-Id, Idempotency-Key',
    );
  });

  it('acepta múltiples orígenes configurados separados por coma', async () => {
    const app = createApp({}, {
      corsAllowedOrigins: 'http://localhost:3000, http://127.0.0.1:3000',
    });
    const response = await request(app)
      .get('/api/v1/health')
      .set('Origin', 'http://127.0.0.1:3000')
      .expect(200);

    expect(response.headers['access-control-allow-origin']).toBe('http://127.0.0.1:3000');
  });
});

describe('manejo global de errores', () => {
  it('rechaza JSON inválido sin exponer detalles del parser', async () => {
    const response = await request(createApp())
      .post('/api/v1/clientes')
      .set('Content-Type', 'application/json')
      .send('{"legalName":')
      .expect(400);

    expect(response.body).toMatchObject({
      code: 'INVALID_JSON',
      correlationId: expect.any(String),
      message: 'El cuerpo de la solicitud no contiene JSON válido.',
    });
    expect(JSON.stringify(response.body)).not.toContain('SyntaxError');
  });

  it('aplica el límite de 1 MiB al cuerpo JSON', async () => {
    const response = await request(createApp())
      .post('/api/v1/clientes')
      .set('Content-Type', 'application/json')
      .send(JSON.stringify({ data: 'x'.repeat(1024 * 1024) }))
      .expect(413);

    expect(response.body).toMatchObject({
      code: 'PAYLOAD_TOO_LARGE',
      correlationId: expect.any(String),
      message: 'El cuerpo JSON excede el límite permitido.',
    });
  });

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
