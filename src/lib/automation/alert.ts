import "server-only";
import type { SupabaseClient } from "@supabase/supabase-js";
import { buildTemplatePayload, sendWhatsappTemplate, type DigestSendResult } from "@/lib/digest/whatsapp-template";
import { jobLabel } from "./jobs";

/**
 * Alerta de rotina com problema: quando a mesma rotina falha 2 vezes seguidas,
 * cria uma notificação no CRM para cada Admin ativo e tenta o WhatsApp (modelo
 * aprovado da Meta) para quem tem número cadastrado na Equipe.
 *
 * Só avisa na 2ª falha seguida. Na 3ª, 4ª... fica quieto. Se a rotina voltar a
 * funcionar e falhar 2 vezes de novo, avisa de novo.
 *
 * Modelo do WhatsApp (categoria Utilidade, pt_BR), nome em WHATSAPP_ALERT_TEMPLATE:
 * "Atenção: a rotina {{1}} do CRM falhou {{2}} vezes seguidas. Último erro: {{3}}. Veja em Saúde das automações."
 * Sem WHATSAPP_ALERT_TEMPLATE ou sem as credenciais do WhatsApp: só a notificação.
 */

export const ALERT_AFTER_FAILURES = 2;
export const ALERT_TEMPLATE_SUGGESTED_NAME = "alerta_automacao";
export const ALERT_TEMPLATE_LANG = "pt_BR";
export const ALERT_TEMPLATE_BODY =
  "Atenção: a rotina {{1}} do CRM falhou {{2}} vezes seguidas. Último erro: {{3}}. Veja em Saúde das automações.";

type Env = Record<string, string | undefined>;
type AnyClient = Pick<SupabaseClient, "from">;

/**
 * Recebe o resultado das últimas execuções terminadas, da mais nova para a
 * mais antiga (true = ok, false = falhou). Avisa só se as 2 mais novas falharam
 * e a anterior a elas não (ou não existe).
 */
export function shouldAlert(recent: boolean[]): boolean {
  const n = ALERT_AFTER_FAILURES;
  if (recent.length < n) return false;
  for (let i = 0; i < n; i++) if (recent[i] !== false) return false;
  return recent[n] !== false;
}

export function alertTemplateConfig(env: Env = process.env) {
  const name = env.WHATSAPP_ALERT_TEMPLATE?.trim() || null;
  return {
    name,
    lang: ALERT_TEMPLATE_LANG,
    enabled: Boolean(name && env.WHATSAPP_ACCESS_TOKEN && env.WHATSAPP_PHONE_NUMBER_ID),
  };
}

export interface AlertOutcome {
  alerted: boolean;
  notificacoes: number;
  whatsapp_enviados: number;
  whatsapp_erros: string[];
}

export async function maybeAlertOnFailure(
  supabase: AnyClient,
  input: { job: string; error: string },
  deps: {
    env?: Env;
    send?: (input: { to: string; params: [string, number][] }) => Promise<DigestSendResult>;
  } = {}
): Promise<AlertOutcome> {
  const out: AlertOutcome = { alerted: false, notificacoes: 0, whatsapp_enviados: 0, whatsapp_erros: [] };

  const { data, error } = await supabase
    .from("automation_runs")
    .select("ok, started_at")
    .eq("job", input.job)
    .not("ok", "is", null)
    .order("started_at", { ascending: false })
    .limit(ALERT_AFTER_FAILURES + 1);
  if (error || !data) return out;
  const recent = (data as { ok: boolean }[]).map((r) => r.ok);
  if (!shouldAlert(recent)) return out;
  out.alerted = true;

  const { data: admins } = await supabase
    .from("users")
    .select("id, name, whatsapp_number")
    .eq("role", "admin")
    .eq("active", true);
  const list = (admins as { id: string; name: string; whatsapp_number: string | null }[] | null) ?? [];
  if (list.length === 0) return out;

  const label = jobLabel(input.job);
  const lastError = input.error.trim() || "erro sem descrição";
  const { error: notifErr } = await supabase.from("notifications").insert(
    list.map((a) => ({
      user_id: a.id,
      type: "automacao_falhou",
      title: `A rotina "${label}" falhou ${ALERT_AFTER_FAILURES} vezes seguidas`,
      body: `Último erro: ${lastError.slice(0, 400)}. Veja em Saúde das automações.`,
      entity_type: "automation",
      entity_id: null,
      read: false,
    }))
  );
  if (!notifErr) out.notificacoes = list.length;

  const env = deps.env ?? process.env;
  const cfg = alertTemplateConfig(env);
  if (!cfg.enabled || !cfg.name) return out;
  const templateName = cfg.name;
  const send =
    deps.send ??
    ((msg: { to: string; params: [string, number][] }) =>
      sendWhatsappTemplate(
        {
          to: msg.to,
          name: templateName,
          lang: cfg.lang,
          paramCount: 3,
          build: (to) => buildTemplatePayload({ to, name: templateName, lang: cfg.lang, params: msg.params }),
        },
        { env }
      ));

  for (const admin of list) {
    if (!admin.whatsapp_number) continue;
    const res = await send({
      to: admin.whatsapp_number,
      params: [
        [label, 60],
        [String(ALERT_AFTER_FAILURES), 4],
        [lastError, 300],
      ],
    });
    if (res.ok) out.whatsapp_enviados++;
    else out.whatsapp_erros.push(res.error);
  }
  return out;
}
