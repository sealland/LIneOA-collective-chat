import fs from 'node:fs';
import path from 'node:path';
import { z } from 'zod';

const configSchema = z.object({
  serverUrl: z.string().trim().url(),
  uploadToken: z.string().trim().min(1),
});

export type LineOaConnectConfig = z.infer<typeof configSchema>;

export function loadLineOaConnectConfig(configPath: string): LineOaConnectConfig {
  if (!fs.existsSync(configPath)) {
    throw new Error(
      `ไม่พบไฟล์ config: ${configPath}\nคัดลอกจาก session-helper/config.json.example แล้วใส่ serverUrl กับ uploadToken`
    );
  }
  const raw = JSON.parse(fs.readFileSync(configPath, 'utf-8'));
  const parsed = configSchema.safeParse(raw);
  if (!parsed.success) {
    throw new Error(`config ไม่ถูกต้อง: ${parsed.error.flatten().formErrors.join(', ')}`);
  }
  return parsed.data;
}

export function defaultConnectConfigPath(): string {
  return path.resolve(process.cwd(), 'session-helper', 'config.json');
}
