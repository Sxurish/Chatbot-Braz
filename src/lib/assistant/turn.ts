import Anthropic from "@anthropic-ai/sdk";
import { DRAFT_DEFS, type DraftView } from "@/lib/assistant/draft-schema";
import type { StoredMessage } from "@/lib/assistant/store";

/**
 * Peças comuns de uma resposta do assistente, usadas pelo painel
 * (/api/assistente) e pelo WhatsApp (fase 4).
 */

/** Notas curtas no histórico: anexos enviados e rascunhos preparados em respostas anteriores. */
export function withNotes(
  history: StoredMessage[],
  drafts: DraftView[]
): { role: "user" | "assistant"; content: string }[] {
  const byId = new Map(drafts.map((d) => [d.id, d]));
  const STATUS: Record<DraftView["status"], string> = {
    pendente: "aguardando confirmação",
    confirmando: "sendo confirmado",
    confirmado: "confirmado e gravado",
    descartado: "descartado",
  };
  return history.map((m) => {
    if (m.role === "user") {
      const files = (m.attachments ?? []).map((a) => a.name).join(", ");
      return { role: m.role, content: files ? `${m.content}\n\n[Arquivo enviado nesta mensagem: ${files}]` : m.content };
    }
    const notes = (m.tools_used ?? [])
      .map((t) => (t.draftId ? byId.get(t.draftId) : undefined))
      .filter((d): d is DraftView => Boolean(d))
      .map((d) => {
        const fields = Object.entries(d.data)
          .filter(([k, v]) => v !== undefined && v !== null && v !== "" && !k.endsWith("_id"))
          .map(([k, v]) => `${k}=${String(v).slice(0, 80)}`)
          .join("; ");
        return `[Rascunho "${DRAFT_DEFS[d.kind].title}" (${STATUS[d.status]}): ${fields}]`;
      });
    return { role: m.role, content: notes.length ? `${m.content}\n\n${notes.join("\n")}` : m.content };
  });
}

/** Mensagem amigável para falhas da API da IA. */
export function friendlyApiError(err: unknown): string {
  if (err instanceof Anthropic.RateLimitError) {
    return "Muitas perguntas ao mesmo tempo. Espere alguns segundos e tente de novo.";
  }
  if (err instanceof Anthropic.AuthenticationError || err instanceof Anthropic.PermissionDeniedError) {
    return "A chave da IA (ANTHROPIC_API_KEY) está inválida ou sem permissão. Avise o administrador.";
  }
  if (err instanceof Anthropic.APIError && err.status === 529) {
    return "A IA está sobrecarregada no momento. Tente de novo em instantes.";
  }
  if (err instanceof Anthropic.APIError) {
    return "A IA não respondeu como esperado. Tente de novo em instantes.";
  }
  return "Algo deu errado ao responder. Tente de novo.";
}
