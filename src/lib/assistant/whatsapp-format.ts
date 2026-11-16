import { DRAFT_DEFS, linkLabelKey, type DraftView } from "@/lib/assistant/draft-schema";
import { isSafeInternalHref } from "@/lib/assistant/links";

/**
 * Texto do assistente no WhatsApp (fase 4): conversão do Markdown do painel
 * para o estilo do WhatsApp, divisão em mensagens de até 4096 caracteres,
 * resumo dos rascunhos para confirmar com "OK" e leitura da resposta
 * ("OK" / "CANCELAR").
 */

/** Limite de caracteres de uma mensagem de texto do WhatsApp. */
export const WHATSAPP_MAX_CHARS = 4096;
/** Máximo de mensagens por resposta (o resto vai cortado, com aviso). */
export const WHATSAPP_MAX_PARTS = 3;

// ---------------------------------------------------------------------------
// "OK" / "CANCELAR"
// ---------------------------------------------------------------------------

const CONFIRM_WORDS = new Set([
  "ok",
  "okay",
  "okey",
  "ok ok",
  "sim",
  "s",
  "confirmo",
  "confirma",
  "confirmar",
  "confirmado",
  "pode gravar",
  "pode salvar",
  "pode confirmar",
  "pode cadastrar",
  "grava",
  "gravar",
  "salva",
  "salvar",
  "sim pode gravar",
  "ok pode gravar",
  "sim confirmo",
  "ok confirmo",
  "sim pode",
  "ok pode",
  "👍",
]);

const CANCEL_WORDS = new Set([
  "cancelar",
  "cancela",
  "cancelado",
  "cancele",
  "nao",
  "n",
  "descartar",
  "descarta",
  "descarte",
  "nao grava",
  "nao gravar",
  "nao salva",
  "nao precisa",
  "pode cancelar",
  "pode descartar",
  "nao cancela",
]);

/** Minúsculas, sem acentos, sem pontuação nas pontas e espaços simples. */
export function normalizeReply(text: string): string {
  return text
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .toLowerCase()
    .replace(/[\s.!?,;:…*_~]+$/u, "")
    .replace(/^[\s.!?,;:…*_~]+/u, "")
    .replace(/[\s,]+/g, " ")
    .trim();
}

/**
 * A mensagem inteira é uma confirmação ou um cancelamento? Comparação exata
 * (depois de normalizar): "ok, mas muda a data" NÃO é confirmação, é pedido
 * de correção e vai para o assistente.
 */
export function parseConfirmReply(text: string): "confirm" | "cancel" | null {
  const norm = normalizeReply(text);
  if (!norm || norm.length > 30) return null;
  // "não cancela" é ambíguo: trata como pedido normal.
  if (norm === "nao cancela") return null;
  if (CONFIRM_WORDS.has(norm)) return "confirm";
  if (CANCEL_WORDS.has(norm)) return "cancel";
  return null;
}

// ---------------------------------------------------------------------------
// Markdown → WhatsApp
// ---------------------------------------------------------------------------

/**
 * Converte o Markdown das respostas para o WhatsApp: **negrito** vira *negrito*,
 * títulos viram linha em negrito, listas viram "•", e links internos
 * [texto](/caminho) viram "texto: https://crm/caminho". Links que não são
 * caminhos internos do CRM viram só o texto (mesma regra do painel).
 */
export function toWhatsappText(markdown: string, baseUrl: string): string {
  const base = baseUrl.replace(/\/+$/, "");
  const lines = markdown.replace(/\r\n?/g, "\n").split("\n");
  const out: string[] = [];
  for (const rawLine of lines) {
    let line = rawLine.replace(/\s+$/, "");
    // Separador de tabela (|---|---|) e linha horizontal somem.
    if (/^\s*\|?\s*:?-{3,}:?\s*(\|\s*:?-{3,}:?\s*)*\|?\s*$/.test(line) || /^\s*([-*_])\s*\1\s*\1[\s\-*_]*$/.test(line)) {
      continue;
    }
    // Linha de tabela vira itens separados por " · ".
    if (/^\s*\|.*\|\s*$/.test(line)) {
      line = line
        .trim()
        .slice(1, -1)
        .split("|")
        .map((c) => c.trim())
        .filter(Boolean)
        .join(" · ");
    }
    const heading = line.match(/^\s{0,3}#{1,6}\s+(.+?)\s*#*\s*$/);
    if (heading) line = `**${heading[1].replace(/\*\*/g, "")}**`;
    // Listas com "-", "*" ou "+" no começo da linha.
    line = line.replace(/^(\s*)[-*+]\s+/, (_m, indent: string) => `${indent}• `);
    out.push(convertInline(line, base));
  }
  return out
    .join("\n")
    .replace(/\n{3,}/g, "\n\n")
    .trim();
}

function convertInline(line: string, base: string): string {
  return (
    line
      // Links: só os internos viram endereço completo; os outros, só o texto.
      .replace(/\[([^\]]+)\]\(([^)\s]+)\)/g, (_m, text: string, href: string) =>
        isSafeInternalHref(href) ? `${text}: ${base}${href}` : text
      )
      // Negrito do Markdown (** ou __) vira o do WhatsApp (*).
      .replace(/\*\*([^*\n]+?)\*\*/g, "*$1*")
      .replace(/__([^_\n]+?)__/g, "*$1*")
      // Tachado.
      .replace(/~~([^~\n]+?)~~/g, "~$1~")
      // Código em linha: só o texto.
      .replace(/`([^`\n]+)`/g, "$1")
  );
}

// ---------------------------------------------------------------------------
// Divisão em mensagens
// ---------------------------------------------------------------------------

function hardSplit(piece: string, max: number): string[] {
  const out: string[] = [];
  let rest = piece;
  while (rest.length > max) {
    let cut = rest.lastIndexOf(" ", max);
    if (cut < max * 0.5) cut = max;
    out.push(rest.slice(0, cut).trimEnd());
    rest = rest.slice(cut).trimStart();
  }
  if (rest) out.push(rest);
  return out;
}

/**
 * Divide o texto em mensagens de até `max` caracteres, quebrando entre
 * parágrafos, depois entre linhas e, em último caso, entre palavras. Passando
 * de `maxParts`, a última mensagem termina com um aviso de corte.
 */
export function splitWhatsappMessage(
  text: string,
  options: { max?: number; maxParts?: number; cutNotice?: string } = {}
): string[] {
  const max = options.max ?? WHATSAPP_MAX_CHARS;
  const maxParts = Math.max(1, options.maxParts ?? WHATSAPP_MAX_PARTS);
  const notice = options.cutNotice ?? "\n\n(Resposta cortada: peça um recorte menor ou veja no CRM.)";
  const clean = text.trim();
  if (!clean) return [];
  if (clean.length <= max) return [clean];

  // Pedaços que cabem numa mensagem: parágrafos → linhas → palavras.
  const pieces: string[] = [];
  for (const para of clean.split(/\n{2,}/)) {
    if (para.length <= max) {
      pieces.push(para);
      continue;
    }
    for (const line of para.split("\n")) {
      if (line.length <= max) pieces.push(line);
      else pieces.push(...hardSplit(line, max));
    }
  }

  const parts: string[] = [];
  let current = "";
  for (const piece of pieces) {
    const sep = current ? (current.endsWith("\n") ? "" : "\n\n") : "";
    if (current && current.length + sep.length + piece.length > max) {
      parts.push(current);
      current = piece;
    } else {
      current = current + sep + piece;
    }
  }
  if (current) parts.push(current);

  if (parts.length <= maxParts) return parts;
  const kept = parts.slice(0, maxParts);
  const last = kept[maxParts - 1];
  kept[maxParts - 1] =
    last.length + notice.length <= max ? last + notice : `${last.slice(0, max - notice.length).trimEnd()}${notice}`;
  return kept;
}

// ---------------------------------------------------------------------------
// Rascunhos para confirmar com "OK"
// ---------------------------------------------------------------------------

function formatDate(value: string): string {
  const m = value.match(/^(\d{4})-(\d{2})-(\d{2})(?:T(\d{2}:\d{2}))?$/);
  if (!m) return value;
  return `${m[3]}/${m[2]}/${m[1]}${m[4] ? ` ${m[4]}` : ""}`;
}

/** Um rascunho em texto: título, campos preenchidos, incertos e duplicados. */
export function formatDraftForWhatsapp(draft: DraftView, baseUrl: string, label?: string): string {
  const def = DRAFT_DEFS[draft.kind];
  const base = baseUrl.replace(/\/+$/, "");
  const uncertain = new Set(draft.uncertain);
  const lines: string[] = [`*${label ? `${label}: ` : ""}${def.title}*`];
  for (const f of def.fields) {
    if (f.onlyWithAttachment) continue;
    const raw = draft.data[f.key];
    let value: string | null = null;
    if (f.type === "checkbox") {
      if (typeof raw === "boolean") value = raw ? "sim" : "não";
    } else if (typeof raw === "string" && raw.trim()) {
      const v = raw.trim();
      switch (f.type) {
        case "select":
          value = f.options?.find((o) => o.value === v)?.label ?? v;
          break;
        case "date":
        case "datetime":
          value = formatDate(v);
          break;
        case "link": {
          const name = draft.data[linkLabelKey(f.key)];
          value = typeof name === "string" && name ? name : v;
          break;
        }
        default:
          value = v.length > 300 ? `${v.slice(0, 300)}…` : v;
      }
    }
    const flag = uncertain.has(f.key);
    if (value === null && !flag) continue;
    lines.push(`• ${f.label}: ${value ?? "(vazio)"}${flag ? " _(conferir)_" : ""}`);
  }
  for (const d of draft.duplicates) {
    const link = isSafeInternalHref(d.link) ? `: ${base}${d.link}` : "";
    lines.push(`⚠️ Pode já existir no CRM: ${d.label} (${d.reason})${link}`);
  }
  return lines.join("\n");
}

/** Rodapé com os rascunhos e o pedido de "OK". */
export function buildDraftFooter(drafts: DraftView[], baseUrl: string): string {
  if (drafts.length === 0) return "";
  const blocks = drafts.map((d, i) =>
    formatDraftForWhatsapp(d, baseUrl, drafts.length > 1 ? `${i + 1}` : undefined)
  );
  const ask =
    drafts.length > 1
      ? `Nada foi gravado ainda. Responda *OK* para gravar os ${drafts.length} ou *CANCELAR* para descartar. Para mudar algo, diga o que corrigir.`
      : "Nada foi gravado ainda. Responda *OK* para gravar ou *CANCELAR* para descartar. Para mudar algo, diga o que corrigir.";
  return `${blocks.join("\n\n")}\n\n${ask}`;
}

/**
 * Monta a resposta final: texto do assistente + rodapé dos rascunhos. O rodapé
 * nunca é cortado; o corte (se houver) fica no texto do assistente.
 */
export function composeWhatsappReply(body: string, footer: string): string[] {
  if (!footer) return splitWhatsappMessage(body);
  const footerParts = splitWhatsappMessage(footer, { maxParts: WHATSAPP_MAX_PARTS });
  const bodyParts = splitWhatsappMessage(body, {
    maxParts: Math.max(1, WHATSAPP_MAX_PARTS - footerParts.length),
  });
  const lastBody = bodyParts[bodyParts.length - 1];
  if (lastBody && lastBody.length + 2 + footerParts[0].length <= WHATSAPP_MAX_CHARS) {
    bodyParts[bodyParts.length - 1] = `${lastBody}\n\n${footerParts[0]}`;
    return [...bodyParts, ...footerParts.slice(1)];
  }
  return [...bodyParts, ...footerParts];
}

// ---------------------------------------------------------------------------
// Resposta ao resumo diário ("Responda esta mensagem para ver os detalhes")
// ---------------------------------------------------------------------------

const DIGEST_DETAIL_WORDS = new Set([
  "detalhes",
  "ver detalhes",
  "quero ver",
  "quero ver os detalhes",
  "ver os detalhes",
  "mostrar detalhes",
  "mostra",
  "manda",
  "pode mandar",
  "resumo",
  "ver resumo",
  "ver o resumo",
  "resumo do dia",
  "resumo de hoje",
  "o resumo",
]);

/** Pedido curto para ver o resumo diário completo. */
export function isDigestDetailsRequest(text: string): boolean {
  return DIGEST_DETAIL_WORDS.has(normalizeReply(text));
}
