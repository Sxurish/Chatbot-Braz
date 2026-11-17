"use server";

import { requireAdminAction } from "@/lib/auth/require-admin";
import { runConnectionTests, type ConnectionTest } from "@/lib/automation/diagnostics";
import { hasServiceRole } from "@/lib/supabase/config";
import { createServiceClient } from "@/lib/supabase/server";

export interface TestConnectionsState {
  error?: string;
  results?: ConnectionTest[];
  at?: string;
}

/** Botão "Testar conexões" da página /automacoes (só Admin). */
export async function testConnectionsAction(): Promise<TestConnectionsState> {
  const admin = await requireAdminAction();
  if (!admin.ok) return { error: admin.error };
  try {
    const results = await runConnectionTests({ client: hasServiceRole() ? createServiceClient() : null });
    return { results, at: new Date().toISOString() };
  } catch {
    return { error: "Não foi possível rodar os testes agora. Tente de novo." };
  }
}
