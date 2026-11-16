import "server-only";
import type { SupabaseClient } from "@supabase/supabase-js";
import type { UserRole } from "@/lib/types";
import { buildDailyDigest, digestSummaryLine, firstName, type DailyDigest } from "./build";
import { isoDateInSaoPaulo, isWeekend } from "./dates";
import { sendDigestTemplate, type DigestSendResult } from "./whatsapp-template";

/**
 * Rotina diária do resumo (chamada por /api/cron/resumo com o cliente de
 * serviço). Para cada pessoa ativa com "recebe o resumo diário":
 * monta o resumo, grava em daily_digests e manda o modelo pelo WhatsApp.
 * Não reenvia se o resumo de hoje já foi entregue.
 */

export interface DigestRecipient {
  id: string;
  name: string;
  role: UserRole;
  whatsapp_number: string | null;
}

export type DigestRunStatus = "enviado" | "salvo_sem_whatsapp" | "falha_whatsapp" | "ja_enviado" | "erro";

export interface DigestRunResult {
  userId: string;
  status: DigestRunStatus;
  error?: string;
}

export const NO_WHATSAPP_NUMBER = "Sem número de WhatsApp cadastrado na Equipe.";

type AnyClient = Pick<SupabaseClient, "from">;

export async function runDailyDigests(
  supabase: AnyClient,
  opts: {
    now: Date;
    send?: (input: { to: string; firstName: string; summaryLine: string }) => Promise<DigestSendResult>;
  }
): Promise<{ date: string; skipped?: string; results: DigestRunResult[] }> {
  const date = isoDateInSaoPaulo(opts.now);
  if (isWeekend(date)) return { date, skipped: "Fim de semana: o resumo só sai em dias úteis.", results: [] };
  const send = opts.send ?? ((input) => sendDigestTemplate(input));

  const { data, error } = await supabase
    .from("users")
    .select("id, name, role, whatsapp_number")
    .eq("active", true)
    .eq("daily_digest", true);
  if (error) {
    throw new Error(`Não deu para ler a equipe (${error.message}). Rode supabase/assistente-fase4.sql.`);
  }
  const recipients = (data as DigestRecipient[] | null) ?? [];

  // O resumo só muda com o financeiro (Admin): monta no máximo duas vezes.
  const cache = new Map<boolean, Promise<DailyDigest>>();
  const digestFor = (includeFinance: boolean) => {
    if (!cache.has(includeFinance)) cache.set(includeFinance, buildDailyDigest(supabase, { now: opts.now, includeFinance }));
    return cache.get(includeFinance)!;
  };

  const results: DigestRunResult[] = [];
  for (const user of recipients) {
    try {
      const { data: existing, error: readErr } = await supabase
        .from("daily_digests")
        .select("id, whatsapp_sent_at")
        .eq("digest_date", date)
        .eq("user_id", user.id)
        .maybeSingle();
      if (readErr) throw new Error(readErr.message);
      if ((existing as { whatsapp_sent_at: string | null } | null)?.whatsapp_sent_at) {
        results.push({ userId: user.id, status: "ja_enviado" });
        continue;
      }

      const digest = await digestFor(user.role === "admin");
      // A linha do WhatsApp nunca traz financeiro; o conteúdo do Admin traz (só para o painel).
      const summaryLine = digestSummaryLine(digest);
      const { error: saveErr } = await supabase.from("daily_digests").upsert(
        {
          digest_date: date,
          user_id: user.id,
          content: digest,
          summary_line: summaryLine,
          whatsapp_sent_at: null,
          whatsapp_error: null,
        },
        { onConflict: "digest_date,user_id" }
      );
      if (saveErr) throw new Error(saveErr.message);

      const outcome: DigestSendResult = user.whatsapp_number
        ? await send({ to: user.whatsapp_number, firstName: firstName(user.name), summaryLine })
        : { ok: false, error: NO_WHATSAPP_NUMBER };

      const { error: markErr } = await supabase
        .from("daily_digests")
        .update(
          outcome.ok
            ? { whatsapp_sent_at: new Date().toISOString(), whatsapp_error: null }
            : { whatsapp_error: outcome.error }
        )
        .eq("digest_date", date)
        .eq("user_id", user.id);
      if (markErr) throw new Error(markErr.message);

      results.push(
        outcome.ok
          ? { userId: user.id, status: "enviado" }
          : {
              userId: user.id,
              status: user.whatsapp_number ? "falha_whatsapp" : "salvo_sem_whatsapp",
              error: outcome.error,
            }
      );
    } catch (err) {
      results.push({ userId: user.id, status: "erro", error: (err as Error).message });
    }
  }
  return { date, results };
}
