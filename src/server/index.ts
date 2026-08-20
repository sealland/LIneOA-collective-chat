import express from 'express';
import cors from 'cors';
import path from 'node:path';
import fs from 'node:fs';
import { config } from '../config/index.js';
import { closePool, isDatabaseConfigured } from '../database/connection.js';
import { createApiRouter } from './routes/api.js';
import { startNightCollectWorker } from '../services/nightCollectWorker.js';
import { createModuleLogger } from '../logger/index.js';

const log = createModuleLogger('server');

async function main() {
  if (!isDatabaseConfigured()) {
    log.error('Database not configured — set DATABASE_* in .env');
    process.exit(1);
  }

  const app = express();
  app.use(cors());
  app.use(express.json({ limit: '10mb' }));

  app.use('/api', createApiRouter());

  const screenshotsDir = config.screenshotsDir;
  if (fs.existsSync(screenshotsDir)) {
    app.use('/screenshots', express.static(screenshotsDir));
  }

  const dashboardDist = path.join(config.projectRoot, 'dashboard', 'dist');
  if (fs.existsSync(dashboardDist)) {
    app.use(express.static(dashboardDist));
    app.use((req, res, next) => {
      if (req.method !== 'GET' && req.method !== 'HEAD') return next();
      if (req.path.startsWith('/api') || req.path.startsWith('/screenshots')) return next();
      res.sendFile(path.join(dashboardDist, 'index.html'));
    });
  }

  const port = config.APP_PORT;
  const server = app.listen(port, '0.0.0.0', () => {
    log.info(`API listening on http://0.0.0.0:${port}`, {
      dashboardStatic: fs.existsSync(dashboardDist),
    });
  });

  const stopNightCollect = startNightCollectWorker();

  const shutdown = async () => {
    log.info('Shutting down…');
    stopNightCollect();
    server.close();
    await closePool();
    process.exit(0);
  };
  process.on('SIGINT', () => void shutdown());
  process.on('SIGTERM', () => void shutdown());
}

main().catch((err) => {
  log.error('Server failed to start', { err });
  process.exit(1);
});
