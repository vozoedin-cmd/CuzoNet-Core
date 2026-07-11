import { createServer } from 'node:http';

import { createApp } from './api/http/app.js';
import { environment } from './infrastructure/config/environment.js';
import { logger } from './infrastructure/logging/logger.js';

const shutdownTimeoutMs = 10_000;
const server = createServer(createApp());

let isShuttingDown = false;

function shutdown(signal: NodeJS.Signals): void {
  if (isShuttingDown) {
    return;
  }

  isShuttingDown = true;
  logger.info({ action: 'server.shutdown.started', module: 'server', signal });

  const forceShutdownTimer = setTimeout(() => {
    logger.error({ action: 'server.shutdown.timeout', module: 'server', signal });
    process.exit(1);
  }, shutdownTimeoutMs);

  forceShutdownTimer.unref();

  server.close((error) => {
    clearTimeout(forceShutdownTimer);

    if (error !== undefined) {
      logger.error({
        action: 'server.shutdown.failed',
        errorName: error.name,
        module: 'server',
        signal,
      });
      process.exit(1);
    }

    logger.info({ action: 'server.shutdown.completed', module: 'server', signal });
    process.exit(0);
  });
}

server.on('error', (error) => {
  logger.error({
    action: 'server.error',
    errorCode: 'code' in error ? error.code : undefined,
    errorName: error.name,
    module: 'server',
  });
  process.exitCode = 1;
});

process.once('SIGINT', shutdown);
process.once('SIGTERM', shutdown);

server.listen(environment.PORT, () => {
  logger.info({
    action: 'server.started',
    module: 'server',
    port: environment.PORT,
  });
});
