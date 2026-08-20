import { z } from 'zod';

const cookieSchema = z
  .object({
    name: z.string(),
    value: z.string(),
    domain: z.string(),
    path: z.string().optional(),
    expires: z.number().optional(),
    httpOnly: z.boolean().optional(),
    secure: z.boolean().optional(),
    sameSite: z.enum(['Strict', 'Lax', 'None']).optional(),
  })
  .passthrough();

const originSchema = z
  .object({
    origin: z.string(),
    localStorage: z
      .array(
        z.object({
          name: z.string(),
          value: z.string(),
        })
      )
      .optional(),
  })
  .passthrough();

export const storageStateSchema = z
  .object({
    cookies: z.array(cookieSchema),
    origins: z.array(originSchema).optional(),
  })
  .passthrough();

export type PlaywrightStorageState = z.infer<typeof storageStateSchema>;

export function parseStorageState(raw: unknown): PlaywrightStorageState {
  const parsed = storageStateSchema.safeParse(raw);
  if (!parsed.success) {
    const detail = parsed.error.flatten().formErrors.join('; ') || 'invalid format';
    throw new Error(`ไฟล์ session ไม่ถูกต้อง (${detail})`);
  }
  if (parsed.data.cookies.length === 0) {
    throw new Error('ไฟล์ session ไม่มี cookies — login ให้เสร็จก่อน export');
  }
  return parsed.data;
}
