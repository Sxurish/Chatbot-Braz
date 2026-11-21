import type { UserRole } from "@/lib/types";

/**
 * Minutas escritas pela IA a partir do assistente da equipe (só no CRM).
 * Arquivo usado no servidor e no navegador: tipos, rótulos e a regra de
 * quem pode pedir uma minuta.
 */

export const MINUTA_TIPOS = [
  "manifestacao",
  "notificacao_extrajudicial",
  "comunicacao_cliente",
  "resumo_caso",
] as const;
export type MinutaTipo = (typeof MINUTA_TIPOS)[number];

export const MINUTA_TIPO_LABELS: Record<MinutaTipo, string> = {
  manifestacao: "Manifestação / petição simples",
  notificacao_extrajudicial: "Notificação extrajudicial",
  comunicacao_cliente: "Comunicação ao cliente",
  resumo_caso: "Resumo do caso",
};

/** Aviso fixo do cartão e do .docx. */
export const MINUTA_WARNING = "MINUTA, revisar antes de usar";

/** Categoria dos documentos salvos a partir de uma minuta. */
export const MINUTA_DOC_CATEGORY = "minuta";

/** Só Admin e Advogado(a) pedem minutas (conferido no servidor). */
export const MINUTA_ROLES: readonly UserRole[] = ["admin", "advogado"];

export function canDraftMinuta(role: UserRole | string | null | undefined): boolean {
  return MINUTA_ROLES.includes(role as UserRole);
}

export const MINUTA_ROLE_DENIED =
  "Minutas só podem ser pedidas por Admin ou Advogado(a). Explique com educação que esse recurso é restrito e que um advogado do escritório pode pedir a minuta.";

/** Registros do CRM a que a minuta está ligada (vínculo ao salvar em Documentos). */
export interface MinutaRefs {
  process_id: string | null;
  case_id: string | null;
  lead_id: string | null;
  client_id: string | null;
}

export type MinutaStatus = "rascunho" | "salva";

/** O que o navegador recebe de uma minuta. */
export interface MinutaView {
  id: string;
  tipo: MinutaTipo;
  title: string;
  body: string;
  /** Pontos que a IA marcou para o advogado conferir. */
  checks: string[];
  refs: MinutaRefs;
  /** Rótulo do registro principal (ex.: número do processo). */
  refLabel: string | null;
  status: MinutaStatus;
  documentId: string | null;
  createdAt?: string;
}

/** Limites do texto editado no cartão. */
export const MINUTA_MAX_TITLE = 200;
export const MINUTA_MAX_BODY = 60_000;
