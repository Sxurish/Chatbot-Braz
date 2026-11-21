import "server-only";
import { z } from "zod";
import {
  DEFAULT_ATTACH_CATEGORY,
  DRAFT_DEFS,
  DRAFT_KINDS,
  formatCnj,
  linkLabelKey,
  MODELO_AUTO_PREFIX,
  MODELO_CATEGORY_KEY,
  MODELO_FIELD_PREFIX,
  type DraftData,
  type DraftDuplicate,
  type DraftKind,
  type FieldDef,
  type LinkEntity,
} from "@/lib/assistant/draft-schema";
import {
  findAppointmentConflicts,
  findMovementDuplicates,
  findPersonDuplicates,
  findProcessDuplicates,
} from "@/lib/assistant/duplicates";
import { createDraft } from "@/lib/assistant/drafts";
import { AssistantSetupError } from "@/lib/assistant/store";
import { defineTool, type AssistantTool, type ToolContext } from "@/lib/assistant/tools";
import { listAppointments } from "@/lib/data/crm";
import { listCases, listClients, listProcesses } from "@/lib/data/fase6";
import { listLeads, listTeam } from "@/lib/data/leads";
import { listMovements } from "@/lib/data/movements";
import { getTemplate } from "@/lib/data/templates-read";
import { loadTemplatePreview, type TemplatePreview } from "@/lib/data/templates-generate";
import {
  canGenerateFromTemplates,
  checkTemplateGeneration,
  TEMPLATE_ROLE_DENIED,
} from "@/lib/data/templates-permissions";
import { TEMPLATE_CATEGORY_LABELS } from "@/lib/data/templates-types";

/**
 * Ferramentas de RASCUNHO do assistente (fase 2; andamento na fase 3). Nenhuma grava no CRM:
 * cada uma monta um rascunho, confere duplicados e mostra um cartão para a
 * pessoa conferir. Só o botão Confirmar grava, no servidor.
 */

const ENTITY_HINT: Record<LinkEntity, string> = {
  case: "id do caso, obtido com buscar_casos",
  lead: "id do lead, obtido com buscar_leads",
  client: "id do cliente, obtido com buscar_clientes",
  process: "id do processo, obtido com buscar_processos",
  user: "id da pessoa da equipe, obtido com listar_equipe",
  template: "id do modelo, obtido com listar_modelos",
};

function fieldSchema(f: FieldDef): z.ZodType {
  const base = f.label + (f.required ? " (obrigatório)" : "");
  switch (f.type) {
    case "checkbox":
      return z.boolean().optional().describe(base);
    case "date":
      return z.string().max(10).optional().describe(`${base}. Formato AAAA-MM-DD.`);
    case "datetime":
      return z
        .string()
        .max(16)
        .optional()
        .describe(`${base}. Formato AAAA-MM-DDTHH:mm (horário de Brasília) ou só AAAA-MM-DD.`);
    case "time":
      return z.string().max(5).optional().describe(`${base}. Formato HH:mm.`);
    case "select":
      return z
        .string()
        .max(60)
        .optional()
        .describe(`${base}. Um destes valores: ${f.options!.map((o) => o.value).join(", ")}.`);
    case "link":
      return z
        .string()
        .max(64)
        .optional()
        .describe(`${base}: ${ENTITY_HINT[f.entity!]}. Nunca invente: deixe vazio se não encontrou.`);
    default:
      return z.string().max(f.type === "textarea" ? 4000 : 300).optional().describe(base);
  }
}

function inputSchemaFor(kind: DraftKind) {
  const shape: Record<string, z.ZodType> = {};
  for (const f of DRAFT_DEFS[kind].fields) {
    if (f.key === "attach_file") continue; // decidido pela pessoa no cartão
    shape[f.key] = fieldSchema(f);
  }
  shape.incertos = z
    .array(z.string().max(40))
    .max(30)
    .default([])
    .describe("Chaves dos campos em que você não tem certeza (aparecem em amarelo para a pessoa conferir).");
  return z.object(shape);
}

// ---------------------------------------------------------------------------
// Vínculos: confere que o id existe e pega o nome para mostrar no cartão
// ---------------------------------------------------------------------------
async function resolveLink(entity: LinkEntity, id: string): Promise<string | null> {
  switch (entity) {
    case "case": {
      const c = (await listCases()).find((x) => x.id === id);
      return c ? c.title : null;
    }
    case "client": {
      const c = (await listClients()).find((x) => x.id === id);
      return c ? c.full_name : null;
    }
    case "lead": {
      const l = (await listLeads()).find((x) => x.id === id);
      return l ? l.full_name : null;
    }
    case "process": {
      const p = (await listProcesses()).find((x) => x.id === id);
      return p ? p.process_number || p.subject || "Processo sem número" : null;
    }
    case "user": {
      const u = (await listTeam()).find((x) => x.id === id && x.active);
      return u ? u.name : null;
    }
    case "template": {
      const t = await getTemplate(id);
      return t && t.active ? t.name : null;
    }
  }
}

const DATE_RE = /^\d{4}-\d{2}-\d{2}$/;
const DATETIME_RE = /^\d{4}-\d{2}-\d{2}(T\d{2}:\d{2})?$/;
const TIME_RE = /^\d{2}:\d{2}$/;

/** Normaliza o que a IA mandou: valores fora do formato viram campo incerto em vez de erro. */
export async function normalizeDraftInput(
  kind: DraftKind,
  input: Record<string, unknown>,
  attachment: { id: string; name: string } | null,
  resolve: (entity: LinkEntity, id: string) => Promise<string | null> = resolveLink
): Promise<{ data: DraftData; uncertain: string[] }> {
  const data: DraftData = {};
  const fields = DRAFT_DEFS[kind].fields.filter((f) => attachment || !f.onlyWithAttachment);
  const keys = new Set(fields.map((f) => f.key));
  const uncertain = new Set(
    (Array.isArray(input.incertos) ? input.incertos : []).filter(
      (k): k is string => typeof k === "string" && keys.has(k)
    )
  );

  for (const f of fields) {
    const raw = input[f.key];
    if (f.type === "checkbox") {
      if (typeof raw === "boolean") data[f.key] = raw;
      continue;
    }
    const value = typeof raw === "string" ? raw.trim() : "";
    if (!value) continue;
    switch (f.type) {
      case "select": {
        const opt = f.options!.find(
          (o) => o.value === value || o.label.toLowerCase() === value.toLowerCase()
        );
        if (opt) data[f.key] = opt.value;
        else uncertain.add(f.key);
        break;
      }
      case "date":
        if (DATE_RE.test(value)) data[f.key] = value;
        else uncertain.add(f.key);
        break;
      case "datetime":
        if (DATETIME_RE.test(value)) data[f.key] = value;
        else uncertain.add(f.key);
        break;
      case "time":
        if (TIME_RE.test(value)) data[f.key] = value;
        else uncertain.add(f.key);
        break;
      case "link": {
        const label = await resolve(f.entity!, value);
        if (label) {
          data[f.key] = value;
          data[linkLabelKey(f.key)] = label;
        } else {
          uncertain.add(f.key);
        }
        break;
      }
      default:
        data[f.key] = value;
    }
  }

  // Padrões
  if (data.process_number) data.process_number = formatCnj(String(data.process_number));
  if (kind === "processo" && !data.status) data.status = "em_andamento";
  if (kind === "prazo") {
    data.priority ??= "alta";
    if (data.process_id && data.update_process_deadline === undefined) data.update_process_deadline = true;
  }
  if (kind === "compromisso" && !data.modality) data.modality = "presencial";
  if (kind === "lead" && !data.source) data.source = "outro";
  if (attachment && keys.has("attach_category")) {
    if (keys.has("attach_file")) data.attach_file = true;
    data.attach_category ??= DEFAULT_ATTACH_CATEGORY[kind];
    if (kind === "documento" && !data.file_name) data.file_name = attachment.name;
  }

  return { data, uncertain: [...uncertain] };
}

async function findDuplicates(kind: DraftKind, data: DraftData): Promise<DraftDuplicate[]> {
  const s = (k: string) => (typeof data[k] === "string" ? (data[k] as string) : undefined);
  switch (kind) {
    case "processo":
      return findProcessDuplicates(s("process_number"), await listProcesses());
    case "lead": {
      const [leads, clients] = await Promise.all([listLeads(), listClients()]);
      return findPersonDuplicates(
        { full_name: s("full_name"), phone: s("phone"), email: s("email") },
        leads,
        clients
      );
    }
    case "compromisso":
      return findAppointmentConflicts(
        { date: s("date"), start_time: s("start_time"), end_time: s("end_time") },
        await listAppointments()
      );
    case "andamento": {
      const processId = s("process_id");
      if (!processId) return [];
      return findMovementDuplicates(
        { process_id: processId, occurred_at: s("occurred_at"), description: s("description") },
        await listMovements(processId)
      );
    }
    default:
      return [];
  }
}

const DESCRIPTIONS: Record<DraftKind, string> = {
  processo:
    "Prepara o RASCUNHO de um processo novo para a pessoa conferir (não grava). Use quando pedirem para cadastrar um processo ou quando um documento (intimação, petição, decisão) trouxer um processo que ainda não está no CRM. Antes, procure o processo com buscar_processos e o caso com buscar_casos. Informe case_id de um caso existente OU new_case_title para criar um caso novo.",
  lead: "Prepara o RASCUNHO de um lead novo (pessoa interessada em contratar o escritório). Não grava. Antes, procure com buscar_leads e buscar_clientes para não duplicar.",
  tarefa:
    "Prepara o RASCUNHO de uma tarefa da equipe. Não grava. Vincule ao processo, caso, lead ou cliente quando fizer sentido (ids das ferramentas de busca).",
  prazo:
    "Prepara o RASCUNHO de um prazo processual (vira uma tarefa com prioridade alta e pode atualizar o próximo prazo do processo). Não grava. Use a data FINAL do prazo; se o documento só trouxer a data de publicação/intimação, deixe a data vazia e marque como incerta em vez de calcular.",
  compromisso:
    "Prepara o RASCUNHO de um compromisso na agenda (reunião, audiência, atendimento). Não grava. Avisa se já houver outro compromisso no mesmo horário.",
  documento:
    "Prepara o RASCUNHO para anexar o arquivo enviado nesta mensagem a um processo, caso, lead ou cliente. Só funciona quando a pessoa anexou um arquivo. Não grava.",
  andamento:
    "Prepara o RASCUNHO de um andamento lançado pela equipe num processo já cadastrado (ex.: 'registra que protocolamos a réplica hoje', ou o que uma intimação anexada informa). Não grava. Antes, ache o processo com buscar_processos ou andamentos_do_processo e use o id dele. occurred_at é a data em que o fato aconteceu (AAAA-MM-DD, ou AAAA-MM-DDTHH:mm se souber a hora); 'hoje' é a data de hoje. Descreva o fato de forma curta e objetiva, sem inventar. Avisa se já houver andamento igual no mesmo dia.",
  modelo:
    "Prepara o RASCUNHO de um documento gerado a partir de um modelo .docx da tela Templates (procuração, declaração, contrato etc.). Não gera nada: a pessoa confere os campos e confirma. Antes, ache o modelo com listar_modelos (template_id) e a pessoa com buscar_leads (lead_id). Se a pessoa citar um cliente, use buscar_clientes e passe o client_id (o sistema usa o lead vinculado ao cliente). Em campos, mande só os campos manuais do modelo (os que listar_modelos marca como automatico=false), com os valores que a pessoa informou ou que vieram do CRM; nunca invente. Campos sem valor ficam vazios e aparecem para conferir. Só Advogado(a) e Admin geram documentos de modelo.",
};

/** Grava o rascunho, avisa a interface e monta a resposta para a IA. */
async function saveDraftAndReply(
  kind: DraftKind,
  ctx: ToolContext,
  input: {
    data: DraftData;
    uncertain: string[];
    duplicates: DraftDuplicate[];
    attachment: { id: string; name: string } | null;
  },
  extra: Record<string, unknown> = {}
) {
  let draft;
  try {
    draft = await createDraft(ctx.user.id, {
      conversationId: ctx.conversationId ?? null,
      kind,
      data: input.data,
      uncertain: input.uncertain,
      duplicates: input.duplicates,
      attachment: input.attachment,
    });
  } catch (err) {
    if (err instanceof AssistantSetupError) {
      return {
        erro: "O banco ainda não está pronto para cadastros pelo assistente (falta rodar supabase/assistente-fase2.sql). Avise o administrador e indique a tela do CRM para cadastrar.",
      };
    }
    // Banco sem o tipo novo na regra assistant_drafts_kind_check.
    if (err instanceof Error && /assistant_drafts_kind_check/.test(err.message)) {
      return {
        erro: "O banco ainda não aceita este tipo de rascunho (falta atualizar a regra assistant_drafts_kind_check). Avise o administrador e indique a tela do CRM para fazer manualmente.",
      };
    }
    throw err;
  }
  ctx.emit?.({ type: "draft", draft });
  return {
    rascunho_id: draft.id,
    tipo: DRAFT_DEFS[kind].title,
    situacao:
      ctx.channel === "whatsapp"
        ? "aguardando a pessoa responder OK no WhatsApp (o resumo do rascunho é enviado automaticamente no fim da sua resposta)"
        : "aguardando a pessoa conferir e clicar em Confirmar no cartão",
    dados: input.data,
    incertos: input.uncertain,
    duplicados: input.duplicates,
    ...extra,
    aviso: "Nada foi gravado ainda. Não diga que cadastrou.",
  };
}

function makeDraftTool(kind: DraftKind): AssistantTool {
  return defineTool({
    name: `preparar_${kind}`,
    label: "Preparando o rascunho",
    description: DESCRIPTIONS[kind],
    writeOnly: true,
    schema: inputSchemaFor(kind),
    run: async (input: Record<string, unknown>, ctx: ToolContext) => {
      const attachment = ctx.attachment ?? null;
      if (kind === "documento" && !attachment) {
        return {
          erro: "Não há arquivo anexado nesta mensagem. Peça para a pessoa anexar o arquivo (clipe ou arrastar) e repetir o pedido.",
        };
      }
      const { data, uncertain } = await normalizeDraftInput(kind, input, attachment);
      const duplicates = await findDuplicates(kind, data);
      return saveDraftAndReply(kind, ctx, { data, uncertain, duplicates, attachment });
    },
  });
}

// ---------------------------------------------------------------------------
// Rascunho "modelo": documento gerado de um template .docx
// ---------------------------------------------------------------------------

/**
 * Monta os dados do rascunho de modelo: o modelo, o lead, a prévia dos
 * campos automáticos e os campos manuais (vazios viram incertos).
 */
export function buildModeloDraftData(
  preview: Pick<TemplatePreview, "template" | "lead" | "autoData" | "manualFields">,
  campos: Record<string, unknown> = {},
  incertos: unknown[] = []
): { data: DraftData; uncertain: string[]; ignored: string[] } {
  const { template, lead, autoData, manualFields } = preview;
  const data: DraftData = {
    template_id: template.id,
    [linkLabelKey("template_id")]: template.name,
    lead_id: lead.id,
    [linkLabelKey("lead_id")]: lead.full_name,
    [MODELO_CATEGORY_KEY]: TEMPLATE_CATEGORY_LABELS[template.category] ?? template.category,
  };
  const uncertain = new Set<string>();
  const flagged = new Set(
    incertos
      .filter((k): k is string => typeof k === "string")
      .map((k) => (k.startsWith(MODELO_FIELD_PREFIX) ? k.slice(MODELO_FIELD_PREFIX.length) : k))
  );

  const manual = new Set(manualFields);
  for (const key of (template.placeholders ?? []).filter((p) => !manual.has(p)).sort()) {
    const value = autoData[key] ?? "";
    data[`${MODELO_AUTO_PREFIX}${key}`] = value;
    if (!value.trim()) uncertain.add(`${MODELO_AUTO_PREFIX}${key}`);
  }
  for (const key of manualFields) {
    const raw = campos[key] ?? campos[`${MODELO_FIELD_PREFIX}${key}`];
    const value = typeof raw === "string" ? raw.trim().slice(0, 4000) : "";
    data[`${MODELO_FIELD_PREFIX}${key}`] = value;
    if (!value || flagged.has(key)) uncertain.add(`${MODELO_FIELD_PREFIX}${key}`);
  }
  const ignored = Object.keys(campos)
    .map((k) => (k.startsWith(MODELO_FIELD_PREFIX) ? k.slice(MODELO_FIELD_PREFIX.length) : k))
    .filter((k) => !manual.has(k));
  return { data, uncertain: [...uncertain], ignored };
}

/** Lead vinculado ao cliente (o modelo é gerado na ficha do lead). */
async function leadOfClient(clientId: string): Promise<string | null> {
  const c = (await listClients()).find((x) => x.id === clientId);
  return c?.lead_id ?? null;
}

export const prepararModelo = defineTool({
  name: "preparar_modelo",
  label: "Preparando o documento do modelo",
  description: DESCRIPTIONS.modelo,
  writeOnly: true,
  schema: z.object({
    template_id: z.string().min(1).max(64).describe("Id do modelo, obtido com listar_modelos. Nunca invente."),
    lead_id: z
      .string()
      .max(64)
      .optional()
      .describe("Id do lead, obtido com buscar_leads. Se a pessoa citou um cliente, use client_id."),
    client_id: z
      .string()
      .max(64)
      .optional()
      .describe("Id do cliente, obtido com buscar_clientes (o sistema usa o lead vinculado a ele)."),
    campos: z
      .record(z.string().max(80), z.string().max(4000))
      .optional()
      .describe("Valores dos campos MANUAIS do modelo: chave = nome do campo, como em listar_modelos."),
    incertos: z
      .array(z.string().max(90))
      .max(40)
      .default([])
      .describe("Campos manuais em que você não tem certeza (aparecem em amarelo para conferir)."),
  }),
  async run(input, ctx) {
    // Permissão conferida no servidor (de novo no Confirmar e na geração).
    if (!canGenerateFromTemplates(ctx.user.role)) return { erro: TEMPLATE_ROLE_DENIED };

    let leadId = input.lead_id?.trim() || "";
    if (!leadId && input.client_id) {
      leadId = (await leadOfClient(input.client_id.trim())) ?? "";
      if (!leadId) {
        return {
          erro: "Este cliente não tem lead vinculado. O documento de modelo é gerado na ficha do lead: procure o lead com buscar_leads.",
        };
      }
    }
    if (!leadId) return { erro: "Informe para quem é o documento: ache o lead com buscar_leads ou o cliente com buscar_clientes." };

    const loaded = await loadTemplatePreview(input.template_id.trim(), leadId);
    if (!loaded.ok) {
      return {
        erro: `${loaded.error} Confira com listar_modelos e buscar_leads. Se não houver modelo adequado, aponte a tela [Templates](/templates).`,
      };
    }
    const allowed = checkTemplateGeneration(ctx.user.role, loaded.preview.template, ctx.channel ?? "painel");
    if (!allowed.ok) return { erro: allowed.error };

    const { data, uncertain, ignored } = buildModeloDraftData(
      loaded.preview,
      input.campos ?? {},
      input.incertos ?? []
    );
    return saveDraftAndReply(
      "modelo",
      ctx,
      { data, uncertain, duplicates: [], attachment: null },
      ignored.length > 0 ? { campos_ignorados: ignored } : {}
    );
  },
});

export const DRAFT_TOOLS: AssistantTool[] = [
  ...DRAFT_KINDS.filter((k) => k !== "modelo").map(makeDraftTool),
  prepararModelo,
];
