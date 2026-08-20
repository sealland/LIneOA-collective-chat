#!/usr/bin/env node
/**
 * LINE OA Connect — login on this PC and upload session to the server.
 *
 * Usage:
 *   npm run line-oa-connect
 *   npm run line-oa-connect -- --config session-helper/config.json
 */
import path from 'node:path';
import {
  connectLineAndUpload,
  type ConnectProgress,
} from '../services/lineOaConnectService.js';
import {
  defaultConnectConfigPath,
  loadLineOaConnectConfig,
} from '../utils/lineOaConnectConfig.js';
import { createModuleLogger } from '../logger/index.js';

const log = createModuleLogger('script:line-oa-connect');

function parseConfigArg(): string {
  const idx = process.argv.indexOf('--config');
  if (idx >= 0 && process.argv[idx + 1]) {
    return path.resolve(process.argv[idx + 1]!);
  }
  return defaultConnectConfigPath();
}

function emitProgress(p: ConnectProgress): void {
  console.log(`PROGRESS:${JSON.stringify(p)}`);
}

async function main(): Promise<void> {
  emitProgress({ phase: 'login', message: 'กำลังเริ่ม…' });

  const configPath = parseConfigArg();
  let connectConfig;
  try {
    connectConfig = loadLineOaConnectConfig(configPath);
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    emitProgress({ phase: 'error', message });
    console.error('\n✗', message, '\n');
    process.exit(1);
  }

  console.log('\n========================================');
  console.log('  LINE OA Connect');
  console.log('========================================');
  console.log(`Server: ${connectConfig.serverUrl}`);
  console.log('1. หน้าต่าง LINE จะเปิด — เข้าสู่ระบบให้เสร็จ');
  console.log('2. ระบบจะส่ง session ไป server อัตโนมัติ');
  console.log('========================================\n');

  const result = await connectLineAndUpload(connectConfig, (p) => {
    emitProgress(p);
    if (p.phase !== 'done') {
      console.log(p.message);
    }
  });

  if (!result.ok) {
    emitProgress({ phase: 'error', message: result.message });
    console.error('\n✗', result.message, '\n');
    process.exit(1);
  }

  console.log('\n✓', result.message);
  if (result.probeOk === false) {
    console.warn('(หมายเหตุ: probe บน server ไม่ผ่าน — ลองใหม่หรือติดต่อ IT)');
  }
  console.log('');
  log.info('Connect helper finished', { ok: true });
}

main().catch((err) => {
  const message = err instanceof Error ? err.message : String(err);
  log.error('Connect helper failed', { error: message });
  emitProgress({ phase: 'error', message });
  console.error('\n✗', message, '\n');
  process.exit(1);
});
