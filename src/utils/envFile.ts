/**
 * Minimal .env line updater — replace or append a KEY=value without touching other keys.
 */
export function upsertEnvLine(content: string, key: string, value: string): string {
  if (!/^[A-Z][A-Z0-9_]*$/.test(key)) {
    throw new Error(`Invalid env key: ${key}`);
  }
  const line = `${key}=${value}`;
  const re = new RegExp(`^${key}=.*$`, 'm');
  if (re.test(content)) {
    return content.replace(re, line);
  }
  const base = content.endsWith('\n') || content.length === 0 ? content : `${content}\n`;
  return `${base}${line}\n`;
}
