import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { runDashboardLogin } from '../automation/auth/sessionManager.js';
import { createModuleLogger } from '../logger/index.js';
import { parseStorageState } from '../utils/storageStateSchema.js';
import type { LineOaConnectConfig } from '../utils/lineOaConnectConfig.js';

const log = createModuleLogger('line-oa-connect');

export type ConnectProgress = {
  phase: 'login' | 'upload' | 'done' | 'error';
  message: string;
};

export type ConnectResult =
  | { ok: true; message: string; probeOk: boolean | null }
  | { ok: false; message: string };

function normalizeServerUrl(url: string): string {
  return url.replace(/\/+$/, '');
}

export async function connectLineAndUpload(
  connectConfig: LineOaConnectConfig,
  onProgress?: (p: ConnectProgress) => void
): Promise<ConnectResult> {
  const tempPath = path.join(
    os.tmpdir(),
    `line-oa-connect-${Date.now()}.json`
  );

  onProgress?.({
    phase: 'login',
    message: 'กำลังเปิด LINE OA — เข้าสู่ระบบให้เสร็จในหน้าต่างที่เปิด',
  });

  try {
    await runDashboardLogin({
      storageStatePath: tempPath,
      recordSessionMeta: false,
    });
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    onProgress?.({ phase: 'error', message });
    return { ok: false, message };
  }

  if (!fs.existsSync(tempPath)) {
    const message = 'ไม่พบ session หลัง login';
    onProgress?.({ phase: 'error', message });
    return { ok: false, message };
  }

  let storageState: unknown;
  try {
    storageState = JSON.parse(fs.readFileSync(tempPath, 'utf-8'));
    parseStorageState(storageState);
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    onProgress?.({ phase: 'error', message });
    return { ok: false, message };
  } finally {
    fs.unlinkSync(tempPath);
  }

  onProgress?.({
    phase: 'upload',
    message:
      'Login สำเร็จ — กำลังส่ง session ไป server…\n(ตรวจสอบบน server อาจใช้เวลา 1–2 นาที อย่าปิดหน้าต่างนี้)',
  });

  const base = normalizeServerUrl(connectConfig.serverUrl);
  const uploadUrl = `${base}/api/session/upload`;

  try {
    const res = await fetch(uploadUrl, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        token: connectConfig.uploadToken,
        storageState,
      }),
    });

    const body = (await res.json()) as {
      error?: string;
      message?: string;
      probeOk?: boolean | null;
    };

    if (!res.ok) {
      const message = body.error || `อัปโหลดไม่สำเร็จ (HTTP ${res.status})`;
      onProgress?.({ phase: 'error', message });
      return { ok: false, message };
    }

    const message = body.message || 'เชื่อมต่อ LINE สำเร็จ — พร้อมเก็บข้อมูล';
    log.info('Session uploaded via connect helper', { uploadUrl, probeOk: body.probeOk });
    onProgress?.({ phase: 'done', message });
    return { ok: true, message, probeOk: body.probeOk ?? null };
  } catch (err) {
    const message =
      err instanceof Error
        ? `เชื่อมต่อ server ไม่ได้ — ${err.message}`
        : 'เชื่อมต่อ server ไม่ได้';
    onProgress?.({ phase: 'error', message });
    return { ok: false, message };
  }
}
