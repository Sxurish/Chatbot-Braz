import "server-only";
import type { SupabaseClient } from "@supabase/supabase-js";
import { fetchDatajudMovements, type DatajudFetchResult } from "@/lib/datajud/client";

/**
 * Diagnóstico da página /automacoes: quais variáveis de ambiente estão
 * configuradas e testes rápidos de conexão (Supabase, IA, WhatsApp, DataJud).
 *
 * Segurança: NUNCA devolve o valor de um segredo, nem um pedaço dele. Só diz
 * "configurada" ou "faltando". A única exceção é AI_PROVIDER, que não é segredo.
 */

type Env = Record<string, string | undefined>;
type AnyClient = Pick<SupabaseClient, "from">;

export const TEST_TIMEOUT_MS = 8_000;

// ---------------------------------------------------------------------------
// Variáveis de ambiente
// ---------------------------------------------------------------------------

interface EnvSpec {
  name: string;
  purpose: string;
  /** O que acontece se faltar. */
  missing: string;
  /** Pode mostrar o valor (não é segredo). */
  showValue?: boolean;
  /** Tem valor padrão no código: faltar não é problema. */
  defaultNote?: string;
}

export const ENV_SPECS: EnvSpec[] = [
  {
    name: "NEXT_PUBLIC_SUPABASE_URL",
    purpose: "Endereço do banco de dados (Supabase).",
    missing: "O CRM roda em modo demonstração, com dados fictícios. Nada é salvo.",
  },
  {
    name: "NEXT_PUBLIC_SUPABASE_ANON_KEY",
    purpose: "Chave pública do Supabase, usada no login e nas telas.",
    missing: "O CRM roda em modo demonstração, com dados fictícios. Nada é salvo.",
  },
  {
    name: "SUPABASE_SERVICE_ROLE_KEY",
    purpose: "Chave do servidor do Supabase, usada pelas rotinas automáticas e pelo chatbot.",
    missing: "As rotinas (andamentos, resumo) não rodam e o chatbot não grava leads.",
  },
  {
    name: "NEXT_PUBLIC_APP_URL",
    purpose: "Endereço público do CRM, usado nos links dos convites e e-mails.",
    missing: "Links de convite e de e-mail podem apontar para o endereço errado.",
  },
  {
    name: "CRON_SECRET",
    purpose: "Senha que a Vercel usa para chamar as rotinas automáticas.",
    missing: "As rotinas automáticas são recusadas (Não autorizado) e não rodam.",
  },
  {
    name: "ANTHROPIC_API_KEY",
    purpose: "Chave da IA do assistente e do chatbot.",
    missing: "O assistente virtual não responde e o chatbot usa respostas prontas.",
  },
  {
    name: "AI_PROVIDER",
    purpose: "Qual IA o chatbot do site usa (anthropic, mock...).",
    missing: "O chatbot usa o modo de teste (respostas prontas).",
    showValue: true,
  },
  {
    name: "WHATSAPP_ACCESS_TOKEN",
    purpose: "Token da Meta para mandar mensagens pelo WhatsApp.",
    missing: "Nada sai pelo WhatsApp: nem respostas, nem resumo diário, nem alertas.",
  },
  {
    name: "WHATSAPP_PHONE_NUMBER_ID",
    purpose: "Identificação do número do escritório no WhatsApp Business.",
    missing: "Nada sai pelo WhatsApp: nem respostas, nem resumo diário, nem alertas.",
  },
  {
    name: "WHATSAPP_VERIFY_TOKEN",
    purpose: "Senha que a Meta usa para ligar o webhook (mensagens recebidas).",
    missing: "A Meta não consegue ligar o webhook: o CRM não recebe mensagens do WhatsApp.",
  },
  {
    name: "WHATSAPP_APP_SECRET",
    purpose: "Confere se as mensagens recebidas vieram mesmo da Meta.",
    missing: "O CRM aceita mensagens sem conferir a assinatura (inseguro em produção).",
  },
  {
    name: "WHATSAPP_DIGEST_TEMPLATE",
    purpose: "Nome do modelo aprovado na Meta para o resumo diário.",
    missing: "Usa o nome padrão resumo_diario.",
    defaultNote: "usando o padrão",
  },
  {
    name: "WHATSAPP_ALERT_TEMPLATE",
    purpose: "Nome do modelo aprovado na Meta para o alerta de rotina com falha.",
    missing: "O alerta de falha só aparece nas Notificações do CRM, sem WhatsApp.",
  },
];

export type EnvStatus = "configurada" | "faltando" | "padrao";

export interface EnvCheck {
  name: string;
  purpose: string;
  status: EnvStatus;
  /** Efeito de faltar (só quando falta ou usa o padrão). */
  effect: string | null;
  /** Só para variáveis que não são segredo (AI_PROVIDER). */
  value: string | null;
}

export function checkEnv(env: Env = process.env): EnvCheck[] {
  return ENV_SPECS.map((spec) => {
    const raw = env[spec.name];
    const set = typeof raw === "string" && raw.trim().length > 0;
    const status: EnvStatus = set ? "configurada" : spec.defaultNote ? "padrao" : "faltando";
    return {
      name: spec.name,
      purpose: spec.purpose,
      status,
      effect: set ? null : spec.missing,
      value: spec.showValue && set ? raw!.trim().slice(0, 40) : null,
    };
  });
}

// ---------------------------------------------------------------------------
// Testes de conexão
// ---------------------------------------------------------------------------

export type TestStatus = "ok" | "erro" | "aviso" | "pulado";

export interface ConnectionTest {
  id: "supabase" | "ia" | "whatsapp" | "datajud" | "tabelas";
  label: string;
  status: TestStatus;
  message: string;
  details?: string[];
}

function isTimeout(err: unknown): boolean {
  const name = (err as { name?: string } | null)?.name;
  return name === "TimeoutError" || name === "AbortError";
}

class TestTimeout extends Error {
  constructor() {
    super("timeout");
    this.name = "TimeoutError";
  }
}

/** Espera no máximo `ms`; depois desiste (lança TimeoutError). */
export function withTimeout<T>(p: PromiseLike<T>, ms = TEST_TIMEOUT_MS): Promise<T> {
  let timer: ReturnType<typeof setTimeout> | undefined;
  const t = new Promise<never>((_, reject) => {
    timer = setTimeout(() => reject(new TestTimeout()), ms);
  });
  return Promise.race([Promise.resolve(p), t]).finally(() => clearTimeout(timer));
}

async function readJson(res: Response): Promise<unknown> {
  try {
    return await res.json();
  } catch {
    return null;
  }
}

const SECONDS = `${TEST_TIMEOUT_MS / 1000} s`;

export async function testSupabase(client: AnyClient | null): Promise<ConnectionTest> {
  const base = { id: "supabase" as const, label: "Banco de dados (Supabase)" };
  if (!client) {
    return {
      ...base,
      status: "erro",
      message: "Falta NEXT_PUBLIC_SUPABASE_URL ou SUPABASE_SERVICE_ROLE_KEY na Vercel.",
    };
  }
  try {
    const { count, error } = await withTimeout(client.from("users").select("id", { count: "exact", head: true }));
    if (error) {
      const msg = (error as { message?: string }).message ?? "";
      if (/jwt|invalid api key|apikey|401|403/i.test(msg)) {
        return { ...base, status: "erro", message: "O Supabase recusou a chave SUPABASE_SERVICE_ROLE_KEY. Copie de novo no painel." };
      }
      return { ...base, status: "erro", message: `O Supabase respondeu com erro: ${msg.slice(0, 160) || "sem detalhes"}.` };
    }
    return { ...base, status: "ok", message: `Conectado. ${count ?? 0} pessoa(s) cadastrada(s) na Equipe.` };
  } catch (err) {
    return {
      ...base,
      status: "erro",
      message: isTimeout(err)
        ? `O Supabase não respondeu em ${SECONDS}. Confira se o projeto está ativo (não pausado).`
        : "Não foi possível falar com o Supabase. Confira NEXT_PUBLIC_SUPABASE_URL.",
    };
  }
}

export async function testAnthropic(deps: { env?: Env; fetchImpl?: typeof fetch } = {}): Promise<ConnectionTest> {
  const env = deps.env ?? process.env;
  const doFetch = deps.fetchImpl ?? fetch;
  const base = { id: "ia" as const, label: "Inteligência artificial (Anthropic)" };
  const key = env.ANTHROPIC_API_KEY?.trim();
  if (!key) return { ...base, status: "pulado", message: "Falta ANTHROPIC_API_KEY: o assistente virtual fica desligado." };
  try {
    const res = await doFetch("https://api.anthropic.com/v1/models", {
      method: "GET",
      headers: { "x-api-key": key, "anthropic-version": "2023-06-01" },
      signal: AbortSignal.timeout(TEST_TIMEOUT_MS),
      cache: "no-store",
    });
    if (res.ok) return { ...base, status: "ok", message: "Chave aceita. A IA está respondendo." };
    if (res.status === 401) return { ...base, status: "erro", message: "A Anthropic recusou a chave ANTHROPIC_API_KEY. Gere uma nova no painel." };
    if (res.status === 403) return { ...base, status: "erro", message: "A chave não tem permissão. Confira a conta e o faturamento na Anthropic." };
    if (res.status === 429) return { ...base, status: "aviso", message: "Limite de uso da Anthropic atingido agora. Tente mais tarde." };
    if (res.status >= 500) return { ...base, status: "aviso", message: "A Anthropic está instável agora. Tente mais tarde." };
    return { ...base, status: "erro", message: `A Anthropic respondeu com erro (HTTP ${res.status}).` };
  } catch (err) {
    return {
      ...base,
      status: "erro",
      message: isTimeout(err) ? `A Anthropic não respondeu em ${SECONDS}. Tente mais tarde.` : "Não foi possível falar com a Anthropic (erro de rede).",
    };
  }
}

export async function testWhatsapp(deps: { env?: Env; fetchImpl?: typeof fetch } = {}): Promise<ConnectionTest> {
  const env = deps.env ?? process.env;
  const doFetch = deps.fetchImpl ?? fetch;
  const base = { id: "whatsapp" as const, label: "WhatsApp (Meta)" };
  const token = env.WHATSAPP_ACCESS_TOKEN?.trim();
  const phoneId = env.WHATSAPP_PHONE_NUMBER_ID?.trim();
  if (!token || !phoneId) {
    return { ...base, status: "pulado", message: "Faltam WHATSAPP_ACCESS_TOKEN e/ou WHATSAPP_PHONE_NUMBER_ID: nada sai pelo WhatsApp." };
  }
  try {
    const res = await doFetch(`https://graph.facebook.com/v21.0/${encodeURIComponent(phoneId)}`, {
      method: "GET",
      headers: { Authorization: `Bearer ${token}` },
      signal: AbortSignal.timeout(TEST_TIMEOUT_MS),
      cache: "no-store",
    });
    const body = (await readJson(res)) as {
      display_phone_number?: string;
      verified_name?: string;
      error?: { code?: number };
    } | null;
    if (res.ok) {
      const who = [body?.verified_name, body?.display_phone_number].filter(Boolean).join(" · ");
      return { ...base, status: "ok", message: who ? `Conectado ao número ${who}.` : "Conectado." };
    }
    const code = body?.error?.code;
    if (code === 190 || res.status === 401) {
      return { ...base, status: "erro", message: "O token do WhatsApp (WHATSAPP_ACCESS_TOKEN) expirou ou é inválido. Gere um novo no painel da Meta." };
    }
    if (code === 100 || res.status === 400 || res.status === 404) {
      return { ...base, status: "erro", message: "A Meta não achou este número. Confira WHATSAPP_PHONE_NUMBER_ID (é o ID do número, não o telefone)." };
    }
    if (code === 10 || code === 200 || res.status === 403) {
      return { ...base, status: "erro", message: "O token não tem permissão para este número. Confira as permissões do usuário do sistema na Meta." };
    }
    if (res.status === 429 || res.status >= 500) return { ...base, status: "aviso", message: "A Meta está instável agora. Tente mais tarde." };
    return { ...base, status: "erro", message: `A Meta respondeu com erro (HTTP ${res.status}).` };
  } catch (err) {
    return {
      ...base,
      status: "erro",
      message: isTimeout(err) ? `A Meta não respondeu em ${SECONDS}. Tente mais tarde.` : "Não foi possível falar com a Meta (erro de rede).",
    };
  }
}

/** Número CNJ válido qualquer (TJSP), só para testar a conexão. */
export const DATAJUD_TEST_NUMBER = "1000000-37.2024.8.26.0100";

export async function testDatajud(
  deps: { fetchMovements?: (n: string) => Promise<DatajudFetchResult> } = {}
): Promise<ConnectionTest> {
  const base = { id: "datajud" as const, label: "Tribunais (DataJud / CNJ)" };
  const fetchMovements = deps.fetchMovements ?? fetchDatajudMovements;
  const unstable = { ...base, status: "aviso" as const, message: "DataJud instável, tente mais tarde." };
  try {
    const res = await withTimeout(fetchMovements(DATAJUD_TEST_NUMBER));
    if (res.ok) return { ...base, status: "ok", message: "O DataJud está respondendo." };
    if (/chave/i.test(res.error)) {
      return { ...base, status: "erro", message: "O DataJud recusou a chave de acesso. Confira DATAJUD_API_KEY (ou apague para usar a chave pública)." };
    }
    if (res.retry) return unstable;
    return { ...base, status: "erro", message: res.error };
  } catch {
    // Sem resposta em 8 s (ou falha de rede): o DataJud costuma oscilar.
    return unstable;
  }
}

/** Tabelas das fases e o SQL que cria cada uma. */
export const PHASE_TABLES: { table: string; sql: string }[] = [
  { table: "assistant_drafts", sql: "supabase/assistente-fase2.sql" },
  { table: "process_movements", sql: "supabase/assistente-fase3.sql" },
  { table: "daily_digests", sql: "supabase/assistente-fase4.sql" },
  { table: "deadline_calculations", sql: "supabase/fase5-prazos.sql" },
  { table: "automation_runs", sql: "supabase/fase5-automacoes.sql" },
];

function isMissingTable(error: { code?: string; message?: string }): boolean {
  return (
    error.code === "42P01" ||
    error.code === "PGRST205" ||
    /does not exist|could not find the table|schema cache/i.test(error.message ?? "")
  );
}

export async function checkTables(client: AnyClient | null): Promise<ConnectionTest> {
  const base = { id: "tabelas" as const, label: "Tabelas das fases" };
  if (!client) return { ...base, status: "pulado", message: "Sem acesso ao banco (falta SUPABASE_SERVICE_ROLE_KEY)." };
  const missing: string[] = [];
  const unknown: string[] = [];
  await Promise.all(
    PHASE_TABLES.map(async ({ table, sql }) => {
      try {
        const { error } = await withTimeout(client.from(table).select("*", { count: "exact", head: true }));
        if (error) {
          if (isMissingTable(error)) missing.push(`Falta a tabela ${table}: rode ${sql} no SQL Editor do Supabase.`);
          else unknown.push(`Não deu para conferir ${table}.`);
        }
      } catch {
        unknown.push(`Não deu para conferir ${table} (sem resposta).`);
      }
    })
  );
  if (missing.length > 0) {
    return { ...base, status: "erro", message: `${missing.length} tabela(s) faltando.`, details: [...missing, ...unknown] };
  }
  if (unknown.length > 0) return { ...base, status: "aviso", message: "Algumas tabelas não puderam ser conferidas.", details: unknown };
  return { ...base, status: "ok", message: "Todas as tabelas das fases existem." };
}

export async function runConnectionTests(deps: {
  client: AnyClient | null;
  env?: Env;
  fetchImpl?: typeof fetch;
  fetchMovements?: (n: string) => Promise<DatajudFetchResult>;
}): Promise<ConnectionTest[]> {
  return Promise.all([
    testSupabase(deps.client),
    checkTables(deps.client),
    testAnthropic({ env: deps.env, fetchImpl: deps.fetchImpl }),
    testWhatsapp({ env: deps.env, fetchImpl: deps.fetchImpl }),
    testDatajud({ fetchMovements: deps.fetchMovements }),
  ]);
}
