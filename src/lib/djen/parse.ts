/**
 * Normaliza as comunicações do DJEN (Comunica PJe / CNJ).
 * Funções puras: não acessam rede nem banco.
 * A validação é tolerante: campos desconhecidos são ignorados e um item
 * ruim vai para a lista de rejeitados sem derrubar os outros.
 */
import { z } from "zod";
import { cnjOnlyDigits, isValidCnj } from "@/lib/datajud/tribunals";

export type DjenPartySide = "ativo" | "passivo" | "outro";

export interface DjenParty {
  name: string;
  side: DjenPartySide;
}

export interface DjenLawyer {
  name: string;
  /** Só dígitos, sem zeros à esquerda. Pode faltar. */
  oab: string | null;
  /** Sigla do estado em maiúsculas. Pode faltar. */
  uf: string | null;
}

export interface DjenCommunication {
  /** id da comunicação no DJEN, como texto. */
  externalId: string | null;
  hash: string | null;
  /** AAAA-MM-DD. */
  availableDate: string;
  tribunal: string | null;
  organ: string | null;
  /** tipoComunicacao (ex.: Intimação, Citação, Edital). */
  kind: string | null;
  documentType: string | null;
  className: string | null;
  /** 20 dígitos, com dígito verificador conferido. */
  processNumber: string | null;
  /** NNNNNNN-DD.AAAA.J.TR.OOOO. */
  processNumberMasked: string | null;
  text: string;
  parties: DjenParty[];
  lawyers: DjenLawyer[];
  link: string | null;
  cancelled: boolean;
  cancelReason: string | null;
  /** Outros números CNJ citados no texto (ex.: processo principal). */
  relatedProcessNumbers: string[];
}

export interface DjenRejectedItem {
  index: number;
  reason: string;
  /** id do item, quando dá para ler, para ajudar a achar no DJEN. */
  externalId: string | null;
}

export interface DjenParseResult {
  items: DjenCommunication[];
  rejected: DjenRejectedItem[];
}

// ---------- Esquema tolerante ----------

/** Texto ou número viram texto; o resto vira null. */
const looseText = z
  .unknown()
  .transform((v) => (typeof v === "string" ? v : typeof v === "number" && Number.isFinite(v) ? String(v) : null));

const personSchema = z.looseObject({
  nome: looseText.optional(),
  polo: looseText.optional(),
});

const lawyerLinkSchema = z.looseObject({
  advogado: z
    .looseObject({
      nome: looseText.optional(),
      numero_oab: looseText.optional(),
      uf_oab: looseText.optional(),
    })
    .nullish()
    .catch(null),
});

/** Lista que ignora entradas ruins em vez de falhar. */
function lenientArray<T extends z.ZodType>(schema: T) {
  return z
    .unknown()
    .transform((v) => (Array.isArray(v) ? v : []))
    .transform((arr) =>
      arr.flatMap((entry) => {
        const r = schema.safeParse(entry);
        return r.success ? [r.data as z.output<T>] : [];
      }),
    );
}

const itemSchema = z.looseObject({
  id: looseText.optional(),
  hash: looseText.optional(),
  data_disponibilizacao: looseText.optional(),
  datadisponibilizacao: looseText.optional(),
  siglaTribunal: looseText.optional(),
  tipoComunicacao: looseText.optional(),
  nomeOrgao: looseText.optional(),
  texto: looseText.optional(),
  numero_processo: looseText.optional(),
  numeroprocessocommascara: looseText.optional(),
  link: looseText.optional(),
  tipoDocumento: looseText.optional(),
  nomeClasse: looseText.optional(),
  ativo: z.unknown().optional(),
  motivo_cancelamento: looseText.optional(),
  data_cancelamento: looseText.optional(),
  destinatarios: lenientArray(personSchema).optional(),
  destinatarioadvogados: lenientArray(lawyerLinkSchema).optional(),
});

// ---------- Ajudantes ----------

function clean(value: string | null | undefined): string | null {
  const v = (value ?? "").replace(/\s+/g, " ").trim();
  return v ? v : null;
}

/** Confere se a data existe de verdade (ex.: recusa 2026-02-30). */
function isRealDate(y: number, m: number, d: number): boolean {
  const dt = new Date(Date.UTC(y, m - 1, d));
  return dt.getUTCFullYear() === y && dt.getUTCMonth() === m - 1 && dt.getUTCDate() === d;
}

/** Aceita AAAA-MM-DD (com ou sem hora) e DD/MM/AAAA. */
export function parseDjenDate(value: string | null | undefined): string | null {
  const v = (value ?? "").trim();
  let m = /^(\d{4})-(\d{2})-(\d{2})(?:$|[T ])/.exec(v);
  if (m) {
    const [y, mo, d] = [Number(m[1]), Number(m[2]), Number(m[3])];
    return isRealDate(y, mo, d) ? `${m[1]}-${m[2]}-${m[3]}` : null;
  }
  m = /^(\d{2})\/(\d{2})\/(\d{4})$/.exec(v);
  if (m) {
    const [d, mo, y] = [Number(m[1]), Number(m[2]), Number(m[3])];
    return isRealDate(y, mo, d) ? `${m[3]}-${m[2]}-${m[1]}` : null;
  }
  return null;
}

/** NNNNNNN-DD.AAAA.J.TR.OOOO a partir dos 20 dígitos. */
export function maskCnj(digits: string): string {
  const d = cnjOnlyDigits(digits);
  if (d.length !== 20) return d;
  return `${d.slice(0, 7)}-${d.slice(7, 9)}.${d.slice(9, 13)}.${d.slice(13, 14)}.${d.slice(14, 16)}.${d.slice(16)}`;
}

const CNJ_IN_TEXT = /(?<!\d)(\d{7}-?\d{2}\.?\d{4}\.?\d\.?\d{2}\.?\d{4})(?!\d)/g;

/** Todos os números CNJ válidos citados no texto, na ordem, sem repetir. */
export function extractCnjNumbers(text: string): string[] {
  const out: string[] = [];
  for (const m of text.matchAll(CNJ_IN_TEXT)) {
    const d = cnjOnlyDigits(m[1]);
    if (isValidCnj(d) && !out.includes(d)) out.push(d);
  }
  return out;
}

const ENTITIES: Record<string, string> = {
  nbsp: " ",
  amp: "&",
  lt: "<",
  gt: ">",
  quot: '"',
  apos: "'",
  ordm: "º",
  ordf: "ª",
  sect: "§",
};

const ACCENTS: Record<string, string> = {
  acute: "\u0301",
  grave: "\u0300",
  circ: "\u0302",
  tilde: "\u0303",
  uml: "\u0308",
  cedil: "\u0327",
};

function decodeEntities(s: string): string {
  return s.replace(/&(#x[0-9a-f]+|#\d+|[a-z]+);/gi, (all, code: string) => {
    if (code[0] === "#") {
      const n = code[1] === "x" || code[1] === "X" ? parseInt(code.slice(2), 16) : parseInt(code.slice(1), 10);
      return Number.isFinite(n) && n > 0 && n < 0x110000 ? String.fromCodePoint(n) : all;
    }
    const named = ENTITIES[code.toLowerCase()];
    if (named) return named;
    // Letras acentuadas: &eacute; &Atilde; &ccedil; etc.
    const accent = /^([a-z])(acute|grave|circ|tilde|uml|cedil)$/i.exec(code);
    return accent ? (accent[1] + ACCENTS[accent[2].toLowerCase()]).normalize("NFC") : all;
  });
}

const HTML_TAG = /<\/?[a-z][a-z0-9]*(?:\s[^<>]*)?\/?>/i;

/**
 * Limpa o texto da publicação: tira tags HTML (alguns tribunais mandam o
 * texto em HTML), junta espaços repetidos e linhas em branco a mais.
 * O conteúdo em si não muda.
 */
export function cleanDjenText(value: string | null | undefined): string {
  let s = (value ?? "").replace(/\r\n?/g, "\n");
  if (HTML_TAG.test(s)) {
    s = s
      .replace(/<(script|style)\b[^]*?<\/\1\s*>/gi, "")
      .replace(/<br\s*\/?>/gi, "\n")
      .replace(/<\/(p|div|li|tr|h[1-6])\s*>/gi, "\n")
      .replace(/<\/?[a-z][a-z0-9]*(?:\s[^<>]*)?\/?>/gi, "");
    s = decodeEntities(s);
  } else if (/&(nbsp|amp|quot|#\d+);/i.test(s)) {
    s = decodeEntities(s);
  }
  return s
    .replace(/[\t\f\v  -​  　]+/g, " ")
    .split("\n")
    .map((line) => line.replace(/ {2,}/g, " ").trim())
    .join("\n")
    .replace(/\n{3,}/g, "\n\n")
    .trim();
}

function sideFromPolo(polo: string | null | undefined): DjenPartySide {
  const p = (polo ?? "").trim().toUpperCase();
  if (p === "A" || p === "ATIVO") return "ativo";
  if (p === "P" || p === "PASSIVO") return "passivo";
  return "outro";
}

function normalizeOab(value: string | null | undefined): string | null {
  const d = (value ?? "").replace(/\D/g, "").replace(/^0+/, "");
  return d ? d : null;
}

function normalizeUf(value: string | null | undefined): string | null {
  const u = (value ?? "").trim().toUpperCase();
  return /^[A-Z]{2}$/.test(u) ? u : null;
}

/** "NOME (OAB 459159/SP)" ou "NOME (OAB: 459.159/SP)" no trecho "ADV:". */
const LAWYER_IN_TEXT = /([A-ZÀ-Ý][A-ZÀ-Ý'.\- ]{2,}?)\s*\(\s*OAB[:\s]*(?:n[º°o.]\s*)?([\d.]+)\s*[-/]?\s*([A-Z]{2})\s*\)/g;

/** Advogados citados no texto, no formato usado pelo DJE do TJSP e outros. */
export function extractLawyersFromText(text: string): DjenLawyer[] {
  const out: DjenLawyer[] = [];
  for (const m of text.matchAll(LAWYER_IN_TEXT)) {
    const name = clean(m[1].replace(/^.*\bADV(?:S|OGADOS?)?\s*:\s*/i, "").replace(/^[,\s-]+/, ""));
    if (!name) continue;
    out.push({ name, oab: normalizeOab(m[2]), uf: normalizeUf(m[3]) });
  }
  return out;
}

function lawyerKey(l: DjenLawyer): string {
  return l.oab && l.uf ? `${l.oab}/${l.uf}` : `nome:${l.name.toUpperCase()}`;
}

function mergeLawyers(...lists: DjenLawyer[][]): DjenLawyer[] {
  const seen = new Map<string, DjenLawyer>();
  for (const list of lists) {
    for (const l of list) {
      const key = lawyerKey(l);
      if (!seen.has(key)) seen.set(key, l);
    }
  }
  return [...seen.values()];
}

function isTruthyCancel(value: string | null | undefined): boolean {
  return Boolean(clean(value));
}

// ---------- Normalização ----------

/** Normaliza um item. Devolve o motivo quando não dá para aproveitar. */
export function normalizeDjenItem(raw: unknown): { ok: true; item: DjenCommunication } | { ok: false; reason: string; externalId: string | null } {
  if (!raw || typeof raw !== "object" || Array.isArray(raw)) {
    return { ok: false, reason: "Item não é um objeto.", externalId: null };
  }
  const parsed = itemSchema.safeParse(raw);
  if (!parsed.success) {
    return { ok: false, reason: "Item em formato inesperado.", externalId: null };
  }
  const r = parsed.data;
  const externalId = clean(r.id);
  const hash = clean(r.hash);

  const availableDate = parseDjenDate(r.data_disponibilizacao) ?? parseDjenDate(r.datadisponibilizacao);
  if (!availableDate) {
    return { ok: false, reason: "Sem data de disponibilização válida.", externalId };
  }

  const text = cleanDjenText(r.texto);
  if (!externalId && !hash && !text) {
    return { ok: false, reason: "Sem id, hash nem texto.", externalId };
  }

  // Número do processo: campo próprio, depois o campo com máscara, depois o texto.
  const mentioned = extractCnjNumbers(text);
  let processNumber: string | null = null;
  for (const candidate of [r.numero_processo, r.numeroprocessocommascara]) {
    const d = cnjOnlyDigits(candidate);
    if (isValidCnj(d)) {
      processNumber = d;
      break;
    }
  }
  if (!processNumber && mentioned.length > 0) processNumber = mentioned[0];

  const parties: DjenParty[] = [];
  for (const p of r.destinatarios ?? []) {
    const name = clean(p.nome);
    if (!name) continue;
    const side = sideFromPolo(p.polo);
    if (!parties.some((x) => x.name === name && x.side === side)) parties.push({ name, side });
  }

  const structuredLawyers: DjenLawyer[] = [];
  for (const link of r.destinatarioadvogados ?? []) {
    const name = clean(link.advogado?.nome);
    if (!name) continue;
    structuredLawyers.push({ name, oab: normalizeOab(link.advogado?.numero_oab), uf: normalizeUf(link.advogado?.uf_oab) });
  }

  const ativo = r.ativo;
  const inactive = ativo === false || ativo === "false" || ativo === 0;

  return {
    ok: true,
    item: {
      externalId,
      hash,
      availableDate,
      tribunal: clean(r.siglaTribunal)?.toUpperCase() ?? null,
      organ: clean(r.nomeOrgao),
      kind: clean(r.tipoComunicacao),
      documentType: clean(r.tipoDocumento),
      className: clean(r.nomeClasse),
      processNumber,
      processNumberMasked: processNumber ? maskCnj(processNumber) : null,
      text,
      parties,
      lawyers: mergeLawyers(structuredLawyers, extractLawyersFromText(text)),
      link: clean(r.link),
      cancelled: inactive || isTruthyCancel(r.data_cancelamento),
      cancelReason: clean(r.motivo_cancelamento),
      relatedProcessNumbers: mentioned.filter((n) => n !== processNumber),
    },
  };
}

/** Normaliza uma lista de itens. Os ruins vão para `rejected`. */
export function parseDjenItems(rawItems: unknown): DjenParseResult {
  const result: DjenParseResult = { items: [], rejected: [] };
  if (!Array.isArray(rawItems)) return result;
  rawItems.forEach((raw, index) => {
    const n = normalizeDjenItem(raw);
    if (n.ok) result.items.push(n.item);
    else result.rejected.push({ index, reason: n.reason, externalId: n.externalId });
  });
  return result;
}

const envelopeSchema = z.looseObject({
  status: looseText.optional(),
  message: looseText.optional(),
  count: z.unknown().optional(),
  items: z.unknown().optional(),
});

export type DjenEnvelope =
  | { ok: true; count: number | null; rawItems: unknown[] }
  | { ok: false; error: string };

/** Confere o envelope da resposta ({ status, message, count, items }). */
export function parseDjenEnvelope(body: unknown): DjenEnvelope {
  const parsed = envelopeSchema.safeParse(body);
  if (!parsed.success || !body || typeof body !== "object" || Array.isArray(body)) {
    return { ok: false, error: "Resposta do DJEN em formato inesperado." };
  }
  const env = parsed.data;
  const status = clean(env.status)?.toLowerCase() ?? null;
  if (status && status !== "success") {
    const msg = clean(env.message);
    return { ok: false, error: msg ? `O DJEN respondeu com erro: ${msg}` : "O DJEN respondeu com erro." };
  }
  if (!Array.isArray(env.items)) {
    return { ok: false, error: "Resposta do DJEN sem a lista de comunicações." };
  }
  const count = typeof env.count === "number" ? env.count : typeof env.count === "string" ? Number(env.count) : NaN;
  return { ok: true, count: Number.isFinite(count) && count >= 0 ? Math.floor(count) : null, rawItems: env.items };
}
