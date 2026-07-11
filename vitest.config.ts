import { defineConfig } from 'vitest/config';

export default defineConfig({
  test: {
    environment: 'node',
    env: {
      APP_NAME: 'CuzoNet-test',
      NODE_ENV: 'test',
      PORT: '3001',
      TIMEZONE: 'UTC',
      LOG_LEVEL: 'silent',
    },
  },
});
