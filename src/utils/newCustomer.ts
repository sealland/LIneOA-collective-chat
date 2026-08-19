export function isNewCustomerWelcomeMessage(
  preview: string | null | undefined
): boolean {
  if (!preview) return false;
  const normalized = preview.replace(/\s+/g, ' ').trim();
  return /ขอบคุณที่\s*เป็นเพื่อน\s*กับ(?:\s|$)/i.test(normalized);
}
