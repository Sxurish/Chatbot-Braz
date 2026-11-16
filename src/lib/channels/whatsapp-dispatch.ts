import "server-only";
import type { TeamUser } from "@/lib/types";
import type { InboundMessage } from "./types";
import { parseInbound, parseInboundMedia, type InboundMedia } from "./whatsapp";

/**
 * Para onde vai cada mensagem do WhatsApp (fase 4):
 *  - número cadastrado na tela Equipe, de pessoa ativa → assistente da equipe;
 *  - qualquer outro número → triagem de clientes (como sempre foi).
 * Número desconhecido nunca chega ao assistente. Se a busca do número falhar,
 * a mensagem segue para a triagem (o caminho sem acesso ao CRM).
 */
export interface DispatchDeps {
  /**
   * Só libera o assistente quando a assinatura da Meta foi de fato conferida
   * (WHATSAPP_APP_SECRET configurado). Sem isso, qualquer um poderia forjar
   * uma mensagem "do número do Dr. Jean" e preparar/confirmar cadastros.
   */
  teamEnabled: boolean;
  findMember: (contactId: string) => Promise<TeamUser | null>;
  /** Resposta do assistente (demora alguns segundos: roda depois do 200). */
  team: (member: TeamUser, msg: InboundMessage) => Promise<unknown>;
  teamMedia: (member: TeamUser, media: InboundMedia) => Promise<unknown>;
  /** Triagem de clientes (sem mudança). */
  triage: (msg: InboundMessage) => Promise<unknown>;
  /** Agenda trabalho para depois da resposta à Meta (after() do Next). */
  defer: (task: () => Promise<unknown>) => void;
}

export interface DispatchSummary {
  assistant: number;
  triage: number;
  media: number;
}

async function safeFind(deps: DispatchDeps, contactId: string): Promise<TeamUser | null> {
  if (!deps.teamEnabled) return null;
  try {
    return await deps.findMember(contactId);
  } catch (err) {
    console.error("[whatsapp webhook] busca do número da equipe:", err);
    return null;
  }
}

export async function dispatchWhatsappPayload(payload: unknown, deps: DispatchDeps): Promise<DispatchSummary> {
  const summary: DispatchSummary = { assistant: 0, triage: 0, media: 0 };
  const messages = parseInbound(payload);
  const media = parseInboundMedia(payload);

  await Promise.all([
    ...messages.map(async (msg) => {
      const member = await safeFind(deps, msg.contactId);
      if (member) {
        summary.assistant++;
        deps.defer(() =>
          deps.team(member, msg).catch((err) => console.error("[whatsapp webhook] assistente:", err))
        );
        return;
      }
      summary.triage++;
      try {
        await deps.triage(msg);
      } catch (err) {
        console.error("[whatsapp webhook] ingest error:", err);
      }
    }),
    // Mídia: só a equipe recebe o aviso; para clientes segue ignorada como antes.
    ...media.map(async (m) => {
      const member = await safeFind(deps, m.contactId);
      if (!member) return;
      summary.media++;
      deps.defer(() =>
        deps.teamMedia(member, m).catch((err) => console.error("[whatsapp webhook] mídia:", err))
      );
    }),
  ]);
  return summary;
}
