/**
 * Número de WhatsApp da equipe (fase 4). Guardado só com dígitos e com DDI
 * (ex.: 5511988887777), igual à regra do banco: ^[1-9][0-9]{9,14}$.
 * Sem dependências de servidor: usado também na tela Equipe.
 */

export const WHATSAPP_NUMBER_RE = /^[1-9][0-9]{9,14}$/;

/** Só os dígitos (tira +, espaços, parênteses e traços). */
export function normalizeWhatsappNumber(value: string | null | undefined): string {
  return (value ?? "").replace(/\D/g, "");
}

export type WhatsappNumberCheck =
  | { ok: true; number: string | null }
  | { ok: false; error: string };

/** Valida o que o Admin digitou. Vazio = remover o número. */
export function parseWhatsappNumberInput(value: string | null | undefined): WhatsappNumberCheck {
  const raw = (value ?? "").trim();
  if (!raw) return { ok: true, number: null };
  const digits = normalizeWhatsappNumber(raw);
  if (digits.startsWith("0")) {
    return { ok: false, error: "Comece pelo código do país, sem zero: para o Brasil, 55 (ex.: 55 11 98888-7777)." };
  }
  if (digits.length >= 10 && digits.length <= 11 && !digits.startsWith("55")) {
    return { ok: false, error: "Inclua o código do país: para o Brasil, comece com 55 (ex.: 55 11 98888-7777)." };
  }
  if (!WHATSAPP_NUMBER_RE.test(digits)) {
    return { ok: false, error: "Número inválido. Use DDI + DDD + número, ex.: 55 11 98888-7777." };
  }
  if (digits.startsWith("55") && (digits.length < 12 || digits.length > 13)) {
    return { ok: false, error: "Número do Brasil incompleto: 55 + DDD + número, ex.: 55 11 98888-7777." };
  }
  return { ok: true, number: digits };
}

/**
 * Formas equivalentes de um número. No Brasil (DDI 55) a Meta às vezes manda o
 * celular sem o nono dígito (55 11 8888-7777 em vez de 55 11 98888-7777):
 * as duas formas valem.
 */
export function whatsappNumberVariants(value: string | null | undefined): string[] {
  const d = normalizeWhatsappNumber(value);
  if (!d) return [];
  const out = new Set([d]);
  if (d.startsWith("55")) {
    const ddd = d.slice(2, 4);
    const local = d.slice(4);
    if (local.length === 9 && local.startsWith("9")) out.add(`55${ddd}${local.slice(1)}`);
    // Celular antigo (8 dígitos começando com 6–9): forma com o nono dígito.
    if (local.length === 8 && /^[6-9]/.test(local)) out.add(`55${ddd}9${local}`);
  }
  return [...out];
}

/** Para mostrar na lista: +55 11 9••••-7777 (só os 4 últimos dígitos). */
export function maskWhatsappNumber(value: string | null | undefined): string {
  const d = normalizeWhatsappNumber(value);
  if (!d) return "";
  const last = d.slice(-4);
  if (d.startsWith("55") && d.length >= 12) {
    const local = d.slice(4);
    const head = local.length === 9 ? local[0] : "";
    return `+55 ${d.slice(2, 4)} ${head}••••-${last}`;
  }
  return `+${d.slice(0, Math.min(3, d.length - 4))} ••••${last}`;
}

/** Para preencher o campo de edição: +55 11 98888-7777. */
export function formatWhatsappNumber(value: string | null | undefined): string {
  const d = normalizeWhatsappNumber(value);
  if (!d) return "";
  if (d.startsWith("55") && (d.length === 12 || d.length === 13)) {
    const local = d.slice(4);
    const cut = local.length - 4;
    return `+55 ${d.slice(2, 4)} ${local.slice(0, cut)}-${local.slice(cut)}`;
  }
  return `+${d}`;
}
