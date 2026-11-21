import type { UserRole } from "@/lib/types";

/**
 * Quem pode gerar documentos a partir dos modelos (.docx da tela Templates).
 * Client-safe: usado no servidor (ação da ficha, assistente, WhatsApp) e na
 * interface (esconder o botão). A conferência que vale é sempre a do servidor.
 *
 * Regras:
 *  - só Admin e Advogado(a) geram, qualquer modelo (contratos inclusive);
 *  - Atendente, Financeiro e Visualizador não geram;
 *  - pelo WhatsApp, contratos e honorários nunca (o financeiro só vai pelo CRM).
 */

export const TEMPLATE_GENERATOR_ROLES: readonly UserRole[] = ["admin", "advogado"];

/** Categorias de modelo tratadas como contrato (assunto financeiro). */
export const CONTRACT_TEMPLATE_CATEGORIES: readonly string[] = ["contrato", "honorarios"];

export type TemplateChannel = "painel" | "whatsapp";

export function canGenerateFromTemplates(role: UserRole | string | null | undefined): boolean {
  return TEMPLATE_GENERATOR_ROLES.includes(role as UserRole);
}

function plain(value: string | null | undefined): string {
  return (value ?? "")
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .toLowerCase();
}

/** Contrato ou honorários, pela categoria ou pelo nome do modelo. */
export function isContractTemplate(template: { category: string; name?: string | null }): boolean {
  if (CONTRACT_TEMPLATE_CATEGORIES.includes(plain(template.category))) return true;
  const name = plain(template.name);
  return /\bcontrato\b/.test(name) || /\bhonorario/.test(name);
}

export const TEMPLATE_ROLE_DENIED =
  "Gerar documentos a partir dos modelos é só para Advogado(a) e Admin. Peça a um deles para gerar.";

export const TEMPLATE_WHATSAPP_CONTRACT_DENIED =
  "Contratos e honorários não são gerados pelo WhatsApp, porque o financeiro só aparece no CRM, com login. Gere pela ficha do lead no CRM.";

/** Confere se esta pessoa pode gerar este modelo por este canal. */
export function checkTemplateGeneration(
  role: UserRole | string | null | undefined,
  template: { category: string; name?: string | null },
  channel: TemplateChannel = "painel"
): { ok: true } | { ok: false; error: string } {
  if (!canGenerateFromTemplates(role)) return { ok: false, error: TEMPLATE_ROLE_DENIED };
  if (channel === "whatsapp" && isContractTemplate(template)) {
    return { ok: false, error: TEMPLATE_WHATSAPP_CONTRACT_DENIED };
  }
  return { ok: true };
}
