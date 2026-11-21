import "server-only";
import { revalidatePath } from "next/cache";
import { createClient } from "@/lib/supabase/server";
import { isSupabaseConfigured } from "@/lib/supabase/config";
import { getAttachment } from "@/lib/assistant/attachments";
import {
  buildInsertPlan,
  DRAFT_DEFS,
  modeloOverrides,
  pickDraftFields,
  validateDraft,
  type DraftData,
  type DraftKind,
} from "@/lib/assistant/draft-schema";
import { claimDraft, discardDraft, finishDraft, getDraft } from "@/lib/assistant/drafts";
import type { AssistantSession } from "@/lib/assistant/session";
import { generateDocumentFromTemplate } from "@/lib/data/templates-generate";
import {
  canGenerateFromTemplates,
  TEMPLATE_ROLE_DENIED,
  type TemplateChannel,
} from "@/lib/data/templates-permissions";
import { getTeamMemberContext } from "@/lib/supabase/request-context";

export type ConfirmResult =
  | {
      ok: true;
      link: string;
      message: string;
      /** Modelo gerado: link assinado para baixar agora (só no painel; nunca no WhatsApp). */
      downloadUrl?: string;
    }
  | { ok: false; error: string; field?: string; status?: number };

const PAGES: Record<DraftKind, string[]> = {
  processo: ["/processos", "/casos"],
  lead: ["/leads"],
  tarefa: ["/tarefas"],
  prazo: ["/tarefas", "/processos"],
  compromisso: ["/agenda"],
  documento: ["/documentos"],
  andamento: ["/processos"],
  modelo: ["/documentos"],
};

/** Como o cadastro é chamado na mensagem de sucesso. */
const NOUN: Partial<Record<DraftKind, string>> = { andamento: "Andamento" };

/** Registro de exemplo para o link no modo demonstração. */
const DEMO_IDS: Partial<Record<string, string>> = { processes: "proc-001", leads: "lead-001" };

/**
 * Atualiza o cache das telas sem arriscar o cadastro: fora de um pedido do
 * navegador (ex.: resposta do WhatsApp rodando depois do 200 à Meta) o
 * Next pode recusar; o registro já foi gravado e não pode voltar a "pendente".
 */
function safeRevalidate(path: string) {
  try {
    revalidatePath(path);
  } catch (err) {
    console.warn("[assistente] não foi possível atualizar o cache de", path, err);
  }
}

export function canWrite(session: AssistantSession) {
  return session.user.role !== "visualizador";
}

/**
 * Confirma um rascunho: valida de novo os dados editados no cartão e grava
 * com o login de quem confirmou (as regras de RLS valem). Só aqui o
 * assistente cria registros no CRM. Pelo WhatsApp (fase 4) o "OK" chega aqui
 * com os dados do próprio rascunho; o cliente é o service role, então autor,
 * dono do rascunho e log de auditoria são sempre preenchidos com user.id.
 */
export async function confirmDraft(
  session: AssistantSession,
  draftId: string,
  rawData: unknown,
  options: { channel?: TemplateChannel } = {}
): Promise<ConfirmResult> {
  const { user } = session;
  if (!canWrite(session)) {
    return { ok: false, status: 403, error: "Seu papel na equipe é só de visualização." };
  }
  const channel: TemplateChannel =
    options.channel ?? (getTeamMemberContext()?.channel === "whatsapp" ? "whatsapp" : "painel");
  const draft = await getDraft(user.id, draftId);
  if (!draft) return { ok: false, status: 404, error: "Rascunho não encontrado." };
  if (draft.status !== "pendente") {
    return {
      ok: false,
      status: 409,
      error: draft.status === "descartado" ? "Este rascunho foi descartado." : "Este rascunho já foi confirmado.",
    };
  }

  const data = pickDraftFields(draft.kind, rawData);
  if (draft.kind === "modelo") {
    const checked = validateDraft("modelo", data);
    if (!checked.ok) return { ok: false, status: 400, error: checked.error, field: checked.field };
    return confirmModelo(session, draftId, data, channel);
  }

  const valid = validateDraft(draft.kind, data);
  if (!valid.ok) return { ok: false, status: 400, error: valid.error, field: valid.field };

  const plan = buildInsertPlan(draft.kind, valid.data);
  const attachment = draft.attachment_id ? await getAttachment(user.id, draft.attachment_id) : null;
  if (draft.kind === "documento" && !attachment) {
    return { ok: false, status: 400, error: "O arquivo deste rascunho não está mais disponível. Envie de novo." };
  }

  if (!(await claimDraft(user.id, draftId, data))) {
    return { ok: false, status: 409, error: "Este rascunho já está sendo confirmado." };
  }

  const title = NOUN[draft.kind] ?? DRAFT_DEFS[draft.kind].title.replace(/^Novo |^Nova /, "");

  if (!isSupabaseConfigured()) {
    const link = plan.link.replace("{id}", DEMO_IDS[plan.table] ?? "demo");
    await finishDraft(user.id, draftId, { status: "confirmado", link });
    return { ok: true, link, message: `Modo demonstração: ${title.toLowerCase()} conferido, mas nada foi gravado.` };
  }

  const supabase = await createClient();
  let createdCaseId: string | null = null;
  try {
    if (plan.newCase) {
      const { data: c, error } = await supabase
        .from("cases")
        .insert({ ...plan.newCase, assigned_to: user.id })
        .select("id")
        .single();
      if (error || !c) throw new Error(`caso: ${error?.message}`);
      createdCaseId = c.id as string;
      plan.row.case_id = createdCaseId;
    }

    let row = plan.row;
    if (plan.table === "process_movements") {
      // Autor explícito: pelo WhatsApp o cliente é o service role e o banco
      // não teria auth.uid() para preencher.
      row = { ...row, created_by: user.id };
    }
    if (plan.table === "documents") {
      row = {
        ...row,
        file_type: attachment!.mime_type,
        file_size: attachment!.size_bytes,
        storage_path: attachment!.storage_path,
        uploaded_by: user.id,
      };
    }
    const { data: created, error } = await supabase.from(plan.table).insert(row).select("id").single();
    if (error || !created) throw new Error(`${plan.table}: ${error?.message}`);
    const newId = created.id as string;

    if (plan.processDeadline) {
      await supabase
        .from("processes")
        .update({ next_deadline: plan.processDeadline.deadline, updated_at: new Date().toISOString() })
        .eq("id", plan.processDeadline.processId);
    }

    // Arquivo enviado ao assistente vira documento do CRM ligado ao cadastro novo.
    let documentId: string | null = plan.table === "documents" ? newId : null;
    if (attachment && plan.attach && plan.table !== "documents") {
      const links: Record<string, string | null> = {
        lead_id: plan.attach.links.lead_id ?? null,
        client_id: plan.attach.links.client_id ?? null,
        case_id: (plan.row.case_id as string | null) ?? plan.attach.links.case_id ?? null,
        process_id: plan.attach.links.process_id ?? null,
      };
      if (plan.table === "processes") links.process_id = newId;
      if (plan.table === "leads") links.lead_id = newId;
      const { data: doc } = await supabase
        .from("documents")
        .insert({
          ...links,
          file_name: attachment.file_name,
          file_type: attachment.mime_type,
          file_size: attachment.size_bytes,
          storage_path: attachment.storage_path,
          category: plan.attach.category,
          uploaded_by: user.id,
          review_status: "pendente",
        })
        .select("id")
        .single();
      documentId = (doc?.id as string | undefined) ?? null;
    }
    if (attachment && documentId) {
      await supabase
        .from("assistant_attachments")
        .update({ document_id: documentId })
        .eq("id", attachment.id)
        .eq("user_id", user.id);
    }

    await supabase.from("audit_logs").insert({
      user_id: user.id,
      action: "assistant_confirm",
      entity_type: plan.table,
      entity_id: newId,
      metadata: { draft_id: draftId, kind: draft.kind, new_case_id: createdCaseId },
    });

    const link = plan.link.replace("{id}", newId);
    await finishDraft(user.id, draftId, { status: "confirmado", table: plan.table, resultId: newId, link });
    for (const p of PAGES[draft.kind]) safeRevalidate(p);
    if (link.startsWith("/leads/") || link.startsWith("/processos/")) safeRevalidate(link);
    return { ok: true, link, message: `${title.charAt(0).toUpperCase()}${title.slice(1)} cadastrado.` };
  } catch (err) {
    console.error("[assistente] confirmar rascunho", err);
    if (createdCaseId) await supabase.from("cases").delete().eq("id", createdCaseId);
    await finishDraft(user.id, draftId, { status: "pendente" });
    return {
      ok: false,
      status: 500,
      error: "Não consegui gravar agora. Confira os dados e tente de novo.",
    };
  }
}

/**
 * Rascunho "modelo": gera o .docx pela mesma função do botão da ficha do
 * lead. Papel e categoria do modelo são conferidos aqui e na geração.
 */
async function confirmModelo(
  session: AssistantSession,
  draftId: string,
  data: DraftData,
  channel: TemplateChannel
): Promise<ConfirmResult> {
  const { user } = session;
  if (!canGenerateFromTemplates(user.role)) return { ok: false, status: 403, error: TEMPLATE_ROLE_DENIED };
  const templateId = String(data.template_id ?? "");
  const leadId = String(data.lead_id ?? "");

  if (!(await claimDraft(user.id, draftId, data))) {
    return { ok: false, status: 409, error: "Este rascunho já está sendo confirmado." };
  }

  if (!isSupabaseConfigured()) {
    const link = leadId ? `/leads/${leadId}` : "/templates";
    await finishDraft(user.id, draftId, { status: "confirmado", link });
    return { ok: true, link, message: "Modo demonstração: documento conferido, mas nada foi gerado." };
  }

  let result;
  try {
    result = await generateDocumentFromTemplate({
      templateId,
      leadId,
      overrides: modeloOverrides(data),
      user: { id: user.id, role: user.role },
      channel,
      // No painel o link de download vale 10 minutos; no WhatsApp não vai.
      downloadTtlSeconds: 600,
      auditMeta: { draft_id: draftId, via: "assistente" },
    });
  } catch (err) {
    console.error("[assistente] gerar documento do modelo", err);
    result = { ok: false as const, error: "Não consegui gerar o documento agora. Tente de novo." };
  }
  if (!result.ok) {
    await finishDraft(user.id, draftId, { status: "pendente" });
    return { ok: false, status: 400, error: result.error };
  }

  try {
    const supabase = await createClient();
    await supabase.from("audit_logs").insert({
      user_id: user.id,
      action: "assistant_confirm",
      entity_type: "documents",
      entity_id: result.documentId,
      metadata: { draft_id: draftId, kind: "modelo", template_id: templateId, channel },
    });
  } catch {
    // não bloqueia: a geração já ficou registrada (generate_doc)
  }

  await finishDraft(user.id, draftId, {
    status: "confirmado",
    table: "documents",
    resultId: result.documentId,
    link: result.link,
  });
  for (const p of PAGES.modelo) safeRevalidate(p);
  return {
    ok: true,
    link: result.link,
    message: `Documento gerado: ${result.fileName}. Ficou na ficha do lead, com revisão pendente.`,
    ...(channel === "painel" && result.url ? { downloadUrl: result.url } : {}),
  };
}

export async function rejectDraft(session: AssistantSession, draftId: string): Promise<ConfirmResult> {
  const ok = await discardDraft(session.user.id, draftId);
  return ok
    ? { ok: true, link: "", message: "Rascunho descartado." }
    : { ok: false, status: 409, error: "Este rascunho não está mais pendente." };
}
