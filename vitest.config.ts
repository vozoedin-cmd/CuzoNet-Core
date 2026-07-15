import { defineConfig } from 'vitest/config';

export default defineConfig({
  test: {
    environment: 'node',
    env: {
      API_PREFIX: '/api/v1',
      APP_NAME: 'CuzoNet-test',
      CORS_ALLOWED_ORIGINS: 'http://localhost:3000',
      NODE_ENV: 'test',
      PORT: '3001',
      TIMEZONE: 'UTC',
      LOG_LEVEL: 'silent',
    },
  },
});
