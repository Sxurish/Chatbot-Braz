import { brDayLong } from "@/lib/prazos/calendar";
import { UNIT_LABELS } from "@/lib/prazos/types";
import type { CourtPublication } from "./types";

/**
 * Textos do aviso de intimação pelo WhatsApp (modelo da Meta) e das respostas
 * ao "OK". Arquivo puro: serve ao notify.ts, ao whatsapp-ok.ts e aos testes.
 */

export const INTIMACAO_TEMPLATE_LANG = "pt_BR";
/** Nome sugerido para cadastrar na Meta (o CRM só usa o que estiver em WHATSAPP_INTIMACAO_TEMPLATE). */
export const INTIMACAO_TEMPLATE_SUGGESTED_NAME = "intimacao_conferir";
/** Corpo do modelo (categoria Utilidade, pt_BR). Ver docs/RESUMO-E-WHATSAPP.md. */
export const INTIMACAO_TEMPLATE_BODY =
  "Nova intimação para conferir. Processo: {{1}}. Resumo: {{2}}. Prazo sugerido: {{3}}. Data final: {{4}}. Responda OK para confirmar, ou abra o painel: {{5}} . Nada vira prazo sem a sua conferência.";

type Env = Record<string, string | undefined>;

export function intimacaoTemplateConfig(env: Env = process.env) {
  const name = env.WHATSAPP_INTIMACAO_TEMPLATE?.trim() || null;
  return {
    name,
    lang: INTIMACAO_TEMPLATE_LANG,
    enabled: Boolean(name && env.WHATSAPP_ACCESS_TOKEN && env.WHATSAPP_PHONE_NUMBER_ID),
  };
}

export type PubForText = Pick<
  CourtPublication,
  "id" | "process_number" | "process_number_masked" | "tribunal" | "kind" | "ai_reading" | "ai_status"
> & { process_title?: string | null };

/** "1002345-67.2026.8.26.0554 (Cobrança), TJSP" — ou "sem número". */
export function processLabel(pub: PubForText, max = 120): string {
  const number = pub.process_number_masked || pub.process_number || "sem número";
  const title = pub.process_title?.trim();
  const tail = [title ? `(${title})` : null, pub.tribunal ? pub.tribunal : null].filter(Boolean).join(", ");
  const text = tail ? `${number} ${tail}` : number;
  return text.length > max ? `${text.slice(0, max - 1)}…` : text;
}

/** "15 dias úteis (CPC, art. 335)" / "nenhum" — sem a data. */
export function suggestionLabel(pub: PubForText): string {
  const r = pub.ai_reading;
  if (pub.ai_status !== "pronta" || !r) return "sem leitura da IA, confira no painel";
  if (!r.suggestedDays || !r.suggestedUnit) {
    return r.requiresAction ? "a IA não achou prazo claro, confira no painel" : "nenhum (não pede providência)";
  }
  const parts = [`${r.suggestedDays} ${UNIT_LABELS[r.suggestedUnit]}`];
  if (r.dobro) parts.push("em dobro");
  let text = parts.join(" ");
  if (r.legalBasis) text += ` (${r.legalBasis})`;
  if (r.confidence !== "alta") text += `, confiança ${r.confidence === "media" ? "média" : "baixa"}`;
  return text;
}

/** "sexta-feira, 05/12/2026" */
export function finalDateLabel(finalDate: string | null): string {
  if (!finalDate) return "a definir no painel";
  return brDayLong(finalDate);
}

/** Resumo de uma linha para o modelo. */
export function summaryLabel(pub: PubForText): string {
  const r = pub.ai_reading;
  if (pub.ai_status !== "pronta" || !r) {
    return `${pub.kind || "Intimação"} no DJEN. ${pub.ai_status === "falhou" ? "A leitura pela IA falhou" : "Sem leitura da IA"}`;
  }
  return `${r.actType}: ${r.summary}`;
}

/** Parâmetros {{1}}..{{5}} do modelo, com o tamanho máximo de cada um. */
export function intimacaoTemplateParams(
  pub: PubForText,
  finalDate: string | null,
  link: string
): [string, number][] {
  return [
    [processLabel(pub), 140],
    [summaryLabel(pub), 400],
    [suggestionLabel(pub), 160],
    [finalDateLabel(finalDate), 60],
    [link, 300],
  ];
}
