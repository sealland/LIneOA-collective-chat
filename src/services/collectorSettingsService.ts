import fs from 'node:fs';
import path from 'node:path';
import { config } from '../config/index.js';
import { createModuleLogger } from '../logger/index.js';
import { upsertEnvLine } from '../utils/envFile.js';

const log = createModuleLogger('collector-settings');
const ENV_FILE = path.join(config.projectRoot, '.env');

export function getCollectorHeadless(): boolean {
  return process.env.COLLECTOR_HEADLESS === 'true';
}

export function setCollectorHeadless(headless: boolean): { headless: boolean } {
  const value = headless ? 'true' : 'false';
  let content = '';
  try {
    content = fs.readFileSync(ENV_FILE, 'utf-8');
  } catch {
    content = '';
  }
  const next = upsertEnvLine(content, 'COLLECTOR_HEADLESS', value);
  fs.writeFileSync(ENV_FILE, next, 'utf-8');
  process.env.COLLECTOR_HEADLESS = value;
  log.info('Updated COLLECTOR_HEADLESS', { headless });
  return { headless };
}
