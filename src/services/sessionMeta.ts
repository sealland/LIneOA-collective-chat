import fs from 'node:fs';
import path from 'node:path';
import { config } from '../config/index.js';

export type SessionMetaSource = 'upload' | 'server-login' | 'cli';

export type SessionMeta = {
  uploadedAt: string;
  source: SessionMetaSource;
  clientIp: string | null;
  fileSizeBytes: number;
  probeOk: boolean | null;
  probedAt: string | null;
};

const META_PATH = path.join(config.authDir, 'session-meta.json');

function ensureAuthDir(): void {
  if (!fs.existsSync(config.authDir)) {
    fs.mkdirSync(config.authDir, { recursive: true });
  }
}

export function readSessionMeta(): SessionMeta | null {
  if (!fs.existsSync(META_PATH)) return null;
  try {
    return JSON.parse(fs.readFileSync(META_PATH, 'utf-8')) as SessionMeta;
  } catch {
    return null;
  }
}

export function writeSessionMeta(meta: SessionMeta): void {
  ensureAuthDir();
  fs.writeFileSync(META_PATH, JSON.stringify(meta, null, 2), 'utf-8');
}

export function recordSessionSaved(source: SessionMetaSource, storageStatePath: string): void {
  let fileSizeBytes = 0;
  try {
    fileSizeBytes = fs.statSync(storageStatePath).size;
  } catch {
    /* ignore */
  }
  writeSessionMeta({
    uploadedAt: new Date().toISOString(),
    source,
    clientIp: null,
    fileSizeBytes,
    probeOk: null,
    probedAt: null,
  });
}
