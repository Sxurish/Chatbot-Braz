import "server-only";
import { z } from "zod";
import {
  DEFAULT_ATTACH_CATEGORY,
  DRAFT_DEFS,
  DRAFT_KINDS,
  formatCnj,
  linkLabelKey,
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
};

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
      let draft;
      try {
        draft = await createDraft(ctx.user.id, {
          conversationId: ctx.conversationId ?? null,
          kind,
          data,
          uncertain,
          duplicates,
          attachment,
        });
      } catch (err) {
        if (err instanceof AssistantSetupError) {
          return {
            erro: "O banco ainda não está pronto para cadastros pelo assistente (falta rodar supabase/assistente-fase2.sql). Avise o administrador e indique a tela do CRM para cadastrar.",
          };
        }
        throw err;
      }
      ctx.emit?.({ type: "draft", draft });
      return {
        rascunho_id: draft.id,
        tipo: DRAFT_DEFS[kind].title,
        situacao: "aguardando a pessoa conferir e clicar em Confirmar no cartão",
        dados: data,
        incertos: uncertain,
        duplicados: duplicates,
        aviso: "Nada foi gravado ainda. Não diga que cadastrou.",
      };
    },
  });
}

export const DRAFT_TOOLS: AssistantTool[] = DRAFT_KINDS.map(makeDraftTool);
