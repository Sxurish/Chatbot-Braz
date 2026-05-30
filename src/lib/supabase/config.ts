/**
 * Detecta se o Supabase está configurado via variáveis de ambiente.
 * Permite que o app funcione em modo demonstração (mocks) quando não há
 * credenciais — útil para desenvolvimento local e preview sem backend.
 */
export function isSupabaseConfigured(): boolean {
  return Boolean(
    process.env.NEXT_PUBLIC_SUPABASE_URL &&
      process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY
  );
}

/** Indica se a service role key está disponível (gravações privilegiadas). */
export function hasServiceRole(): boolean {
  return Boolean(
    process.env.NEXT_PUBLIC_SUPABASE_URL && process.env.SUPABASE_SERVICE_ROLE_KEY
  );
}
