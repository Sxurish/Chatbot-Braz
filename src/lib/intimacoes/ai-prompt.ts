import { z } from "zod";
import type { CourtPublication, PublicationAiReading } from "./types";

/**
 * Instruções, formato de saída e validação da leitura das intimações pela IA.
 * Arquivo puro (sem banco e sem rede): serve ao ai-read.ts e aos testes.
 */

/** Campos que a tela sabe destacar como dúvida. */
export const UNCERTAIN_FIELDS = ["dias", "unidade", "inicio", "dobro", "processo"] as const;

/** Texto maior que isso vai cortado ao meio (começo e fim ficam). */
export const AI_MAX_TEXT_CHARS = 12_000;
const HEAD_CHARS = 8_500;
const TAIL_CHARS = 3_000;
export const CUT_MARK = "[... trecho do meio omitido por tamanho ...]";

export const AI_READING_SYSTEM_PROMPT = `Você lê intimações publicadas no Diário de Justiça Eletrônico Nacional (DJEN) para o escritório de um advogado particular (OAB/SP), que representa clientes particulares. Sua resposta é só uma SUGESTÃO: quem decide e confere o prazo é o advogado. Um prazo errado pode causar perda de direito do cliente. Por isso: nunca invente. Na dúvida, marque o campo em "uncertain" e baixe a confiança.

O que fazer:
1. Diga o tipo do ato em palavras simples (actType) e resuma em 1 a 3 frases curtas, em português do Brasil (summary).
2. Diga se a intimação pede alguma providência do advogado com prazo (requiresAction). Mera ciência, juntada, remessa, "aguarde-se" ou "cumpra-se" sem ordem às partes: requiresAction false e suggestedDays null.
3. Sugira o prazo (suggestedDays e suggestedUnit), a base legal (legalBasis) e um título curto para a tarefa (taskTitle, ex.: "Réplica à contestação", sem a palavra "Prazo").
4. Em "quote", copie EXATAMENTE, letra por letra, o trecho da intimação que embasa o prazo (até 300 caracteres). Não resuma nem corrija o trecho. Sem trecho que embase o prazo, quote null.

Regra principal: o prazo que o juiz fixou no texto vale mais que a regra geral. "Manifeste-se em 10 dias" = 10 dias, mesmo que a regra geral seja outra.

Regras gerais (use só quando o texto não fixar o prazo):
- CPC, art. 219: prazos processuais em dias contam só os dias úteis (suggestedUnit "uteis").
- Contestação: 15 dias úteis (CPC, art. 335).
- Réplica (manifestação sobre a contestação): 15 dias úteis (CPC, arts. 350 e 351).
- Manifestação sobre documentos juntados: 15 dias úteis (CPC, art. 437, § 1º).
- Recursos em geral (apelação, agravo de instrumento, agravo interno, recurso especial e extraordinário) e contrarrazões: 15 dias úteis (CPC, art. 1.003, § 5º).
- Embargos de declaração: 5 dias úteis (CPC, art. 1.023).
- Cumprimento de sentença: pagamento voluntário em 15 dias úteis (CPC, art. 523); impugnação em 15 dias úteis (CPC, art. 525).
- Ato sem prazo na lei e sem prazo fixado pelo juiz: 5 dias úteis (CPC, art. 218, § 3º). Use confiança "media" ou "baixa" nesse caso.
- Juizado Especial Cível (Lei 9.099/95): recurso inominado em 10 dias (art. 42); embargos de declaração em 5 dias (art. 49). Desde a Lei 13.728/2018 (art. 12-A) os prazos contam em dias úteis.
- Processo penal (CPP, art. 798) conta em dias corridos: suggestedUnit "corridos" e marque "unidade" em uncertain.
- Prazo em horas, meses ou anos, ou prazo de direito material: não converta; deixe suggestedDays null ou marque "dias" e "unidade" em uncertain.

Início da contagem (startKind):
- No DJEN o prazo conta a partir da disponibilização: o sistema calcula sozinho a publicação (1º dia útil seguinte) e o início (dia útil seguinte à publicação). Use "disponibilizacao" quase sempre.
- Use "intimacao" só se o texto mandar contar de outro marco (ex.: ciência pessoal, juntada do mandado) e marque "inicio" em uncertain.
- Nunca calcule a data final: só diga dias, unidade e início.

Prazo em dobro (dobro):
- Fazenda Pública (CPC, art. 183), Ministério Público (art. 180) e Defensoria Pública (art. 186) têm prazo em dobro para as próprias manifestações. Isso NÃO dá prazo em dobro ao advogado particular da outra parte.
- Litisconsortes com advogados de escritórios diferentes têm prazo em dobro só em autos físicos (CPC, art. 229); em processo eletrônico, não.
- Nos Juizados Especiais não há prazo em dobro.
- Como o escritório é particular, use dobro false. Se o texto sugerir que o cliente do escritório tem o benefício, use dobro true e marque "dobro" em uncertain.

Dúvidas (uncertain) só com estes nomes: "dias", "unidade", "inicio", "dobro", "processo" ("processo" quando o texto parece ser de outro processo ou de outra parte).

Confiança (confidence):
- "alta": o prazo está escrito no texto ou o ato se encaixa sem dúvida numa regra acima.
- "media": prazo deduzido da regra geral, com algum ponto a conferir.
- "baixa": texto confuso, cortado, sem prazo claro, ou você não tem certeza do ato.

Se o texto vier cortado ("${CUT_MARK}"), considere que pode faltar informação e baixe a confiança.`;

/** Formato JSON exigido na resposta (saída estruturada da API). */
export const AI_READING_JSON_SCHEMA: Record<string, unknown> = {
  type: "object",
  additionalProperties: false,
  required: [
    "actType",
    "summary",
    "requiresAction",
    "suggestedDays",
    "suggestedUnit",
    "startKind",
    "dobro",
    "taskTitle",
    "legalBasis",
    "quote",
    "uncertain",
    "confidence",
  ],
  properties: {
    actType: { type: "string" },
    summary: { type: "string" },
    requiresAction: { type: "boolean" },
    suggestedDays: { anyOf: [{ type: "integer" }, { type: "null" }] },
    suggestedUnit: { anyOf: [{ type: "string", enum: ["uteis", "corridos"] }, { type: "null" }] },
    startKind: { type: "string", enum: ["disponibilizacao", "intimacao"] },
    dobro: { type: "boolean" },
    taskTitle: { anyOf: [{ type: "string" }, { type: "null" }] },
    legalBasis: { anyOf: [{ type: "string" }, { type: "null" }] },
    quote: { anyOf: [{ type: "string" }, { type: "null" }] },
    uncertain: { type: "array", items: { type: "string", enum: [...UNCERTAIN_FIELDS] } },
    confidence: { type: "string", enum: ["alta", "media", "baixa"] },
  },
};

const trimmed = (max: number) => z.string().trim().min(1).max(max);
const optionalText = (max: number) =>
  z
    .string()
    .nullable()
    .transform((v) => (v == null || !v.trim() ? null : v.trim().slice(0, max)));

/** Validação da resposta da IA (a API já segue o formato, mas nada é aceito sem conferir). */
export const PublicationAiReadingSchema = z.object({
  actType: trimmed(200),
  summary: trimmed(1200),
  requiresAction: z.boolean(),
  suggestedDays: z.number().int().min(1).max(365).nullable(),
  suggestedUnit: z.enum(["uteis", "corridos"]).nullable(),
  startKind: z.enum(["disponibilizacao", "intimacao"]),
  dobro: z.boolean(),
  taskTitle: optionalText(200),
  legalBasis: optionalText(200),
  quote: optionalText(600),
  uncertain: z.array(z.string()).max(10),
  confidence: z.enum(["alta", "media", "baixa"]),
});

/** Corta texto longo mantendo o começo e o fim (onde costuma estar a ordem do juiz). */
export function truncateForAi(text: string): { text: string; cut: boolean } {
  const clean = text.replace(/\r\n?/g, "\n").trim();
  if (clean.length <= AI_MAX_TEXT_CHARS) return { text: clean, cut: false };
  return {
    text: `${clean.slice(0, HEAD_CHARS)}\n\n${CUT_MARK}\n\n${clean.slice(-TAIL_CHARS)}`,
    cut: true,
  };
}

const SIDE_LABEL: Record<string, string> = { ativo: "polo ativo", passivo: "polo passivo", outro: "outra" };

/** Mensagem com os dados da intimação enviada à IA. */
export function buildUserMessage(
  pub: Pick<
    CourtPublication,
    | "tribunal"
    | "organ"
    | "kind"
    | "document_type"
    | "class_name"
    | "process_number_masked"
    | "process_number"
    | "available_date"
    | "publication_date"
    | "parties"
    | "lawyers"
    | "text"
  >
): { content: string; cut: boolean } {
  const { text, cut } = truncateForAi(pub.text ?? "");
  const parties = (pub.parties ?? [])
    .slice(0, 12)
    .map((p) => `${p.name} (${SIDE_LABEL[p.side] ?? "outra"})`)
    .join("; ");
  const lawyers = (pub.lawyers ?? [])
    .slice(0, 12)
    .map((l) => `${l.name}${l.oab ? ` (OAB ${l.oab}${l.uf ? `/${l.uf}` : ""})` : ""}`)
    .join("; ");
  const lines = [
    `Tribunal: ${pub.tribunal || "não informado"}`,
    `Órgão: ${pub.organ || "não informado"}`,
    `Tipo de comunicação: ${pub.kind || "não informado"}`,
    pub.document_type ? `Tipo de documento: ${pub.document_type}` : null,
    `Classe: ${pub.class_name || "não informada"}`,
    `Processo: ${pub.process_number_masked || pub.process_number || "não informado"}`,
    `Disponibilização no DJEN: ${pub.available_date}`,
    pub.publication_date ? `Publicação (1º dia útil seguinte): ${pub.publication_date}` : null,
    parties ? `Partes: ${parties}` : null,
    lawyers ? `Advogados intimados: ${lawyers}` : null,
    "",
    cut ? "Texto da intimação (cortado por tamanho):" : "Texto da intimação:",
    "<<<",
    text,
    ">>>",
  ].filter((l): l is string => l !== null);
  return { content: lines.join("\n"), cut };
}

const CONFIDENCE_ORDER = { baixa: 0, media: 1, alta: 2 } as const;
function atMost(c: PublicationAiReading["confidence"], max: PublicationAiReading["confidence"]) {
  return CONFIDENCE_ORDER[c] <= CONFIDENCE_ORDER[max] ? c : max;
}

/** Minúsculas, sem acento e com espaços simples: para achar o trecho citado no texto. */
function normalizeForSearch(s: string): string {
  return s
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .toLowerCase()
    .replace(/[\s"“”'‘’]+/g, " ")
    .trim();
}

export type ParseReadingResult = { ok: true; reading: PublicationAiReading } | { ok: false; error: string };

/**
 * Lê o JSON devolvido pela IA, valida com Zod e aplica as travas:
 *  - dúvidas só com os nomes conhecidos;
 *  - dias sem unidade (ou o contrário) vira dúvida;
 *  - trecho citado que não está no texto é descartado e o prazo fica em dúvida;
 *  - texto cortado nunca dá confiança alta.
 */
export function parseAiReading(raw: string, sourceText: string, opts: { cut?: boolean } = {}): ParseReadingResult {
  let json: unknown;
  try {
    json = JSON.parse(raw);
  } catch {
    return { ok: false, error: "A IA devolveu uma resposta fora do formato (JSON inválido)." };
  }
  const parsed = PublicationAiReadingSchema.safeParse(json);
  if (!parsed.success) {
    const issue = parsed.error.issues[0];
    const where = issue?.path?.length ? ` (campo ${issue.path.join(".")})` : "";
    return { ok: false, error: `A IA devolveu uma resposta fora do formato${where}.` };
  }
  const r = parsed.data;
  const known = new Set<string>(UNCERTAIN_FIELDS);
  const uncertain = new Set(r.uncertain.map((f) => f.trim().toLowerCase()).filter((f) => known.has(f)));
  let confidence = r.confidence;

  if ((r.suggestedDays == null) !== (r.suggestedUnit == null)) {
    uncertain.add(r.suggestedDays == null ? "dias" : "unidade");
    confidence = atMost(confidence, "media");
  }

  let quote = r.quote;
  if (quote && !normalizeForSearch(sourceText).includes(normalizeForSearch(quote.replace(/^[.…\s]+|[.…\s]+$/g, "")))) {
    quote = null;
    if (r.suggestedDays != null) uncertain.add("dias");
    confidence = atMost(confidence, "media");
  }
  if (r.suggestedDays != null && !quote) confidence = atMost(confidence, "media");
  if (opts.cut) confidence = atMost(confidence, "media");

  return {
    ok: true,
    reading: {
      actType: r.actType,
      summary: r.summary,
      requiresAction: r.requiresAction,
      suggestedDays: r.suggestedDays,
      suggestedUnit: r.suggestedUnit,
      startKind: r.startKind,
      dobro: r.dobro,
      taskTitle: r.taskTitle,
      legalBasis: r.legalBasis,
      quote,
      uncertain: UNCERTAIN_FIELDS.filter((f) => uncertain.has(f)),
      confidence,
    },
  };
}
