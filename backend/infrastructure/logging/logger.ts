import pino from 'pino';

import { environment } from '../config/environment.js';

export const logger = pino({
  base: { service: environment.APP_NAME },
  level: environment.LOG_LEVEL,
  timestamp: () => `,"timestamp":"${new Date().toISOString()}"`,
});
