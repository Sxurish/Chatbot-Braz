/**
 * Limite simples de tentativas em memória (por instância do servidor).
 * Complementa os limites do próprio Supabase Auth.
 */
const buckets = new Map<string, number[]>();

export function hitLimit(key: string, max: number, windowMs: number, now = Date.now()): boolean {
  const recent = (buckets.get(key) ?? []).filter((t) => now - t < windowMs);
  if (recent.length >= max) {
    buckets.set(key, recent);
    return true;
  }
  recent.push(now);
  buckets.set(key, recent);
  return false;
}

export function resetLimit(key: string) {
  buckets.delete(key);
}
